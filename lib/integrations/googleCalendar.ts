import * as AuthSession from 'expo-auth-session';
import { supabase } from '../supabase';
import { BaseIntegration } from './BaseIntegration';
import { SyncResult } from './types';

// Restricted to calendars this app creates itself — Parent Patch never
// requests access to the user's personal Google calendars.
const SCOPES = ['https://www.googleapis.com/auth/calendar.app.created'];

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

// Only the client ID lives in the app bundle. The client secret stays in the
// google-oauth-exchange edge function's Supabase secrets — see
// docs/google-calendar-setup.md for how to obtain both from Google Cloud.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export class GoogleCalendarIntegration extends BaseIntegration {
  readonly serviceName = 'google_calendar' as const;

  async connect(): Promise<void> {
    if (!GOOGLE_WEB_CLIENT_ID) {
      throw new Error("Google Calendar isn't configured yet (missing EXPO_PUBLIC_GOOGLE_CLIENT_ID).");
    }

    const redirectUri = AuthSession.makeRedirectUri();
    const request = new AuthSession.AuthRequest({
      clientId: GOOGLE_WEB_CLIENT_ID,
      scopes: SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      // access_type=offline + prompt=consent: without this, Google only
      // returns a refresh_token on a user's very first consent ever — force
      // it every time so reconnecting after a disconnect still works.
      extraParams: { access_type: 'offline', prompt: 'consent' },
    });

    const result = await request.promptAsync(discovery);
    if (result.type === 'error') {
      throw new Error(result.error?.message ?? 'Google sign-in failed');
    }
    if (result.type !== 'success') {
      return; // user cancelled
    }

    const code = result.params.code;
    const codeVerifier = request.codeVerifier;
    if (!code || !codeVerifier) {
      throw new Error('Google sign-in did not return an authorization code');
    }

    const { error } = await supabase.functions.invoke('google-oauth-exchange', {
      body: { code, redirectUri, codeVerifier },
    });
    if (error) throw error;
  }

  async sync(): Promise<SyncResult> {
    const { data, error } = await supabase.functions.invoke('google-calendar-sync', { body: {} });
    if (error) return { ok: false, error: error.message };
    return data as SyncResult;
  }
}
