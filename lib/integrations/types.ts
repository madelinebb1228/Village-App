export type ServiceName =
  | 'google_calendar'
  | 'apple_health'
  | 'google_fit'
  | 'google_photos'
  | 'icloud_photos'
  | 'hatch'
  | 'nanit';

export type IntegrationStatusValue = 'connected' | 'disconnected' | 'error' | 'expired';

export interface IntegrationStatus {
  serviceName: ServiceName;
  status: IntegrationStatusValue;
  externalAccountId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  scopes: string[];
}

export interface SyncResult {
  ok: boolean;
  pushed?: number;
  pulled?: number;
  error?: string;
}

// Static catalog entry — drives the marketplace UI regardless of whether the
// integration is implemented yet (`available: false` renders as "Coming soon").
export interface IntegrationMeta {
  serviceName: ServiceName;
  label: string;
  icon: string;
  description: string;
  permissions: string[];
  available: boolean;
}
