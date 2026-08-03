import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export interface Baby {
  id: string;
  user_id: string;
  name: string;
  birth_date: string | null;
  due_date?: string | null;
  is_expecting?: boolean | null;
  gender?: string | null;
  current_weight?: number | null;
  photo_url?: string | null;
  invite_code?: string | null;
}

type BabyContextType = {
  babies: Baby[];
  activeBabyId: string | null;
  activeBaby: Baby | null;
  loading: boolean;
  setActiveBabyId: (id: string) => void;
  refreshBabies: () => Promise<void>;
  joinBabyByCode: (code: string) => Promise<{ ok: boolean; error?: string }>;
};

const BabyContext = createContext<BabyContextType>({
  babies: [],
  activeBabyId: null,
  activeBaby: null,
  loading: true,
  setActiveBabyId: () => {},
  refreshBabies: async () => {},
  joinBabyByCode: async () => ({ ok: false, error: 'Not ready' }),
});

function activeBabyStorageKey(userId: string) {
  return `active_baby_id_${userId}`;
}

export function BabyProvider({ children }: { children: React.ReactNode }) {
  const [babies, setBabies] = useState<Baby[]>([]);
  const [activeBabyId, setActiveBabyIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const setActiveBabyId = useCallback((id: string) => {
    setActiveBabyIdState(id);
    if (userId) AsyncStorage.setItem(activeBabyStorageKey(userId), id).catch(() => {});
  }, [userId]);

  const refreshBabies = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBabies([]); setLoading(false); return; }
      setUserId(user.id);

      // RLS (see supabase/baby_sharing.sql) scopes this to babies the user
      // owns or has been invited to as a caregiver — no manual filter needed.
      const { data, error } = await supabase
        .from('babies')
        .select('id, user_id, name, birth_date, due_date, is_expecting, gender, current_weight, photo_url, invite_code')
        .order('birth_date', { ascending: true });
      if (error) throw error;

      const list = (data ?? []) as Baby[];
      setBabies(list);

      const savedId = await AsyncStorage.getItem(activeBabyStorageKey(user.id));
      const stillValid = savedId && list.some(b => b.id === savedId);
      setActiveBabyIdState(stillValid ? savedId : (list[0]?.id ?? null));
    } catch (err: any) {
      console.warn('[BabyContext] refreshBabies error:', err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const joinBabyByCode = useCallback(async (code: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const trimmed = code.trim();
      if (!trimmed) return { ok: false, error: 'Enter an invite code.' };
      const { data, error } = await (supabase as any).rpc('join_baby_by_code', { p_code: trimmed });
      if (error) throw error;
      await refreshBabies();
      if (data) setActiveBabyId(data as string);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Could not join with that code.' };
    }
  }, [refreshBabies, setActiveBabyId]);

  useEffect(() => { refreshBabies(); }, [refreshBabies]);

  const activeBaby = babies.find(b => b.id === activeBabyId) ?? null;

  return (
    <BabyContext.Provider value={{ babies, activeBabyId, activeBaby, loading, setActiveBabyId, refreshBabies, joinBabyByCode }}>
      {children}
    </BabyContext.Provider>
  );
}

export function useBaby(): BabyContextType {
  return useContext(BabyContext);
}
