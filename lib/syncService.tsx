import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type QueuedOp = {
  queueId: string;
  table: string;
  op: 'insert' | 'update' | 'delete' | 'upsert';
  payload: Record<string, any>;
  rowId: string;
  onConflict?: string;
  filters?: Record<string, any>;
  createdAt: string;
  retries: number;
};

type SyncStatus = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: Date | null;
  triggerSync: () => Promise<void>;
  retryFailed: () => Promise<void>;
  dismissFailed: () => Promise<void>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const QUEUE_KEY   = 'sync_queue_v1';
const HEALTH_URL  = 'https://clients3.google.com/generate_204';
const MAX_RETRIES = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function isNetworkError(err: any): boolean {
  const msg = String(err?.message ?? err ?? '').toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('networkerror') ||
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('abort')
  );
}

async function checkConnectivity(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    await fetch(HEALTH_URL, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

// ─── Queue management (AsyncStorage) ─────────────────────────────────────────

async function readQueue(): Promise<QueuedOp[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(ops: QueuedOp[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
}

async function enqueue(op: Omit<QueuedOp, 'queueId' | 'createdAt' | 'retries'>): Promise<void> {
  const queue = await readQueue();
  queue.push({ ...op, queueId: generateId(), createdAt: new Date().toISOString(), retries: 0 });
  await writeQueue(queue);
}

async function dequeue(queueId: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter(op => op.queueId !== queueId));
}

async function incrementRetry(queueId: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.map(op => op.queueId === queueId ? { ...op, retries: op.retries + 1 } : op));
}

async function resetFailedRetries(): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.map(op => op.retries >= MAX_RETRIES ? { ...op, retries: 0 } : op));
}

async function dropFailedOps(): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter(op => op.retries < MAX_RETRIES));
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

export async function cacheSet(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(`cache_${key}`, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {}
}

export async function cacheGet<T>(key: string, maxAgeMs = 5 * 60 * 1000): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`cache_${key}`);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > maxAgeMs) return null;
    return data as T;
  } catch {
    return null;
  }
}

export async function cacheGetStale<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`cache_${key}`);
    if (!raw) return null;
    return JSON.parse(raw).data as T;
  } catch {
    return null;
  }
}

// ─── Safe read/write API ──────────────────────────────────────────────────────

/**
 * Insert a row. If offline, queues the write and returns the local ID so the
 * caller can update UI optimistically.
 */
export async function safeInsert(
  table: string,
  data: Record<string, any>,
): Promise<{ id: string; queued: boolean }> {
  const id = data.id ?? generateId();
  const row = { ...data, id };
  try {
    const { error } = await supabase.from(table).insert(row);
    if (error) throw error;
    return { id, queued: false };
  } catch (err: any) {
    if (isNetworkError(err)) {
      await enqueue({ table, op: 'insert', payload: row, rowId: id });
      return { id, queued: true };
    }
    throw err;
  }
}

/**
 * Update a row by id, or by a compound filter set (e.g. { baby_id, vaccine_key }
 * for tables without a single-column primary key in play). Queues when offline.
 */
export async function safeUpdate(
  table: string,
  idOrFilters: string | Record<string, any>,
  data: Record<string, any>,
): Promise<{ queued: boolean }> {
  const filters = typeof idOrFilters === 'string' ? { id: idOrFilters } : idOrFilters;
  const rowId = typeof idOrFilters === 'string' ? idOrFilters : '';
  try {
    const { error } = await supabase.from(table).update(data).match(filters);
    if (error) throw error;
    return { queued: false };
  } catch (err: any) {
    if (isNetworkError(err)) {
      await enqueue({ table, op: 'update', payload: data, rowId, filters });
      return { queued: true };
    }
    throw err;
  }
}

/**
 * Delete a row by id, or by a compound filter set (e.g. { baby_id, vaccine_key }
 * for tables without a single-column primary key). Queues when offline.
 */
export async function safeDelete(
  table: string,
  idOrFilters: string | Record<string, any>,
): Promise<{ queued: boolean }> {
  const filters = typeof idOrFilters === 'string' ? { id: idOrFilters } : idOrFilters;
  const rowId = typeof idOrFilters === 'string' ? idOrFilters : '';
  try {
    const { error } = await supabase.from(table).delete().match(filters);
    if (error) throw error;
    return { queued: false };
  } catch (err: any) {
    if (isNetworkError(err)) {
      await enqueue({ table, op: 'delete', payload: {}, rowId, filters });
      return { queued: true };
    }
    throw err;
  }
}

/**
 * Upsert a row (insert-or-update on conflict). Queues when offline.
 */
export async function safeUpsert(
  table: string,
  data: Record<string, any>,
  onConflict: string = 'id',
): Promise<{ queued: boolean }> {
  try {
    const { error } = await supabase.from(table).upsert(data, { onConflict });
    if (error) throw error;
    return { queued: false };
  } catch (err: any) {
    if (isNetworkError(err)) {
      await enqueue({ table, op: 'upsert', payload: data, rowId: data.id ?? '', onConflict });
      return { queued: true };
    }
    throw err;
  }
}

/**
 * Run a Supabase query. On network failure returns stale cached data.
 * Always updates cache on success.
 */
export async function safeQuery<T>(
  fetcher: () => Promise<{ data: T[] | null; error: any }>,
  cacheKey: string,
): Promise<T[]> {
  try {
    const { data, error } = await fetcher();
    if (error) throw error;
    const result = data ?? [];
    await cacheSet(cacheKey, result);
    return result;
  } catch (err: any) {
    if (isNetworkError(err)) {
      const cached = await cacheGetStale<T[]>(cacheKey);
      return cached ?? [];
    }
    throw err;
  }
}

// ─── Queue processor ──────────────────────────────────────────────────────────

async function processQueue(): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  for (const op of queue) {
    if (op.retries >= MAX_RETRIES) continue;
    try {
      if (op.op === 'insert') {
        const { error } = await supabase.from(op.table).upsert(op.payload, { onConflict: 'id' });
        if (error) throw error;
      } else if (op.op === 'update') {
        const { error } = await supabase.from(op.table).update(op.payload).match(op.filters ?? { id: op.rowId });
        if (error) throw error;
      } else if (op.op === 'delete') {
        const { error } = await supabase.from(op.table).delete().match(op.filters ?? { id: op.rowId });
        if (error) throw error;
      } else if (op.op === 'upsert') {
        const { error } = await supabase.from(op.table).upsert(op.payload, { onConflict: op.onConflict ?? 'id' });
        if (error) throw error;
      }
      await dequeue(op.queueId);
      synced++;
    } catch (err: any) {
      if (!isNetworkError(err)) {
        // Non-network error (e.g. validation) — discard so it doesn't block the queue
        console.warn(`[sync] Discarding failed op ${op.queueId} (${op.table}):`, err?.message);
        await dequeue(op.queueId);
      } else {
        await incrementRetry(op.queueId);
      }
    }
  }
  return synced;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SyncContext = createContext<SyncStatus>({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  triggerSync: async () => {},
  retryFailed: async () => {},
  dismissFailed: async () => {},
});

export function useSyncStatus(): SyncStatus {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline]       = useState(true);
  const [isSyncing, setIsSyncing]     = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const queue = await readQueue();
    setPendingCount(queue.filter(op => op.retries < MAX_RETRIES).length);
    setFailedCount(queue.filter(op => op.retries >= MAX_RETRIES).length);
  }, []);

  const triggerSync = useCallback(async () => {
    if (syncingRef.current) return;
    const online = await checkConnectivity();
    setIsOnline(online);
    if (!online) { await refreshPendingCount(); return; }

    syncingRef.current = true;
    setIsSyncing(true);
    try {
      await processQueue();
      setLastSyncedAt(new Date());
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [refreshPendingCount]);

  const retryFailed = useCallback(async () => {
    await resetFailedRetries();
    await refreshPendingCount();
    await triggerSync();
  }, [refreshPendingCount, triggerSync]);

  const dismissFailed = useCallback(async () => {
    await dropFailedOps();
    await refreshPendingCount();
  }, [refreshPendingCount]);

  // Check on mount + whenever app comes to foreground
  useEffect(() => {
    triggerSync();
    refreshPendingCount();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') triggerSync();
    });

    // Periodic check every 30 s while app is active
    const interval = setInterval(triggerSync, 30_000);

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [triggerSync, refreshPendingCount]);

  return (
    <SyncContext.Provider value={{ isOnline, isSyncing, pendingCount, failedCount, lastSyncedAt, triggerSync, retryFailed, dismissFailed }}>
      {children}
    </SyncContext.Provider>
  );
}
