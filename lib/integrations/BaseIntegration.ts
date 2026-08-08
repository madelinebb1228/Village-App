import { supabase } from '../supabase';
import { IntegrationStatus, IntegrationStatusValue, ServiceName, SyncResult } from './types';

// Standard interface every integration implements. connect()/sync() do
// their real work by calling Supabase Edge Functions — the client never
// holds an OAuth client_secret or a decrypted token; see
// supabase/functions/google-oauth-exchange and google-calendar-sync.
export abstract class BaseIntegration {
  abstract readonly serviceName: ServiceName;

  abstract connect(): Promise<void>;
  abstract sync(): Promise<SyncResult>;

  async disconnect(): Promise<void> {
    const db: any = supabase;
    const { error } = await db.rpc('disconnect_integration', { p_service_name: this.serviceName });
    if (error) throw error;
  }

  async getStatus(): Promise<IntegrationStatus> {
    const db: any = supabase;
    const { data } = await db
      .from('user_integrations_public')
      .select('*')
      .eq('service_name', this.serviceName)
      .maybeSingle();

    if (!data) {
      return {
        serviceName: this.serviceName,
        status: 'disconnected',
        externalAccountId: null,
        lastSyncAt: null,
        lastError: null,
        scopes: [],
      };
    }

    return {
      serviceName: this.serviceName,
      status: data.status as IntegrationStatusValue,
      externalAccountId: data.external_account_id,
      lastSyncAt: data.last_sync_at,
      lastError: data.last_error,
      scopes: data.scopes ?? [],
    };
  }
}
