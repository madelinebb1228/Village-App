import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../lib/theme';
import { INTEGRATION_CATALOG, getIntegration } from '../lib/integrations/registry';
import { IntegrationMeta, IntegrationStatus } from '../lib/integrations/types';

function syncSummary(result: { pushed?: number; pulled?: number }): string {
  const pushed = result.pushed ?? 0;
  const pulled = result.pulled ?? 0;
  if (pushed === 0 && pulled === 0) return 'up to date — nothing new to sync';
  const parts: string[] = [];
  if (pushed > 0) parts.push(`${pushed} sent to Google`);
  if (pulled > 0) parts.push(`${pulled} pulled in`);
  return parts.join(', ');
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function IntegrationsScreen({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const next: Record<string, IntegrationStatus> = {};
    for (const meta of INTEGRATION_CATALOG) {
      const integration = getIntegration(meta.serviceName);
      if (!integration) continue;
      next[meta.serviceName] = await integration.getStatus();
    }
    setStatuses(next);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConnect = useCallback(async (meta: IntegrationMeta) => {
    const integration = getIntegration(meta.serviceName);
    if (!integration) return;
    setError(null);
    setMessage(null);
    setBusy(meta.serviceName);
    try {
      await integration.connect();
      const result = await integration.sync();
      setMessage(`Connected — ${syncSummary(result)}`);
      await load();
    } catch (err: any) {
      setError(err?.message ?? `Could not connect ${meta.label}`);
    } finally {
      setBusy(null);
    }
  }, [load]);

  const handleSync = useCallback(async (meta: IntegrationMeta) => {
    const integration = getIntegration(meta.serviceName);
    if (!integration) return;
    setError(null);
    setMessage(null);
    setBusy(meta.serviceName);
    try {
      const result = await integration.sync();
      if (!result.ok) setError(result.error ?? `Sync failed for ${meta.label}`);
      else setMessage(syncSummary(result));
      await load();
    } catch (err: any) {
      setError(err?.message ?? `Sync failed for ${meta.label}`);
    } finally {
      setBusy(null);
    }
  }, [load]);

  const handleDisconnect = useCallback(async (meta: IntegrationMeta) => {
    const integration = getIntegration(meta.serviceName);
    if (!integration) return;
    setError(null);
    setMessage(null);
    setBusy(meta.serviceName);
    try {
      await integration.disconnect();
      await load();
    } catch (err: any) {
      setError(err?.message ?? `Could not disconnect ${meta.label}`);
    } finally {
      setBusy(null);
    }
  }, [load]);

  const connected = INTEGRATION_CATALOG.filter(m => statuses[m.serviceName]?.status === 'connected');
  const availableNotConnected = INTEGRATION_CATALOG.filter(m => m.available && statuses[m.serviceName]?.status !== 'connected');
  const comingSoon = INTEGRATION_CATALOG.filter(m => !m.available);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
        backgroundColor: c.card,
      }}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={{ fontSize: 22, color: c.textMuted }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary }}>Integrations</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          {error ? (
            <View style={{ margin: 20, marginBottom: 0, padding: 14, borderRadius: 12, backgroundColor: c.cardBlush }}>
              <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600' }}>{error}</Text>
            </View>
          ) : null}

          {message ? (
            <View style={{ margin: 20, marginBottom: 0, padding: 14, borderRadius: 12, backgroundColor: c.cardSage }}>
              <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>{message}</Text>
            </View>
          ) : null}

          {connected.length > 0 ? (
            <>
              <SectionHeader label="Connected" />
              <View style={{ paddingHorizontal: 20, gap: 12 }}>
                {connected.map(meta => (
                  <ConnectedCard
                    key={meta.serviceName}
                    meta={meta}
                    status={statuses[meta.serviceName]}
                    busy={busy === meta.serviceName}
                    onSync={() => handleSync(meta)}
                    onDisconnect={() => handleDisconnect(meta)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {availableNotConnected.length > 0 ? (
            <>
              <SectionHeader label="Available" />
              <View style={{ paddingHorizontal: 20, gap: 12 }}>
                {availableNotConnected.map(meta => (
                  <MarketplaceCard
                    key={meta.serviceName}
                    meta={meta}
                    busy={busy === meta.serviceName}
                    onConnect={() => handleConnect(meta)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <SectionHeader label="Coming Soon" />
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            {comingSoon.map(meta => (
              <ComingSoonCard key={meta.serviceName} meta={meta} />
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SectionHeader({ label }: { label: string }) {
  const c = useColors();
  return (
    <Text style={{
      fontSize: 12, fontWeight: '700', color: c.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 20, paddingTop: 24, paddingBottom: 10,
    }}>
      {label}
    </Text>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.separator }}>
      {children}
    </View>
  );
}

function PermissionsList({ permissions }: { permissions: string[] }) {
  const c = useColors();
  return (
    <View style={{ marginTop: 8, gap: 3 }}>
      {permissions.map(p => (
        <Text key={p} style={{ fontSize: 12, color: c.textMuted, lineHeight: 17 }}>• {p}</Text>
      ))}
    </View>
  );
}

function ConnectedCard({
  meta, status, busy, onSync, onDisconnect,
}: {
  meta: IntegrationMeta;
  status: IntegrationStatus | undefined;
  busy: boolean;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const c = useColors();
  return (
    <CardShell>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Text style={{ fontSize: 28 }}>{meta.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{meta.label}</Text>
          {status?.externalAccountId ? (
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{status.externalAccountId}</Text>
          ) : null}
          <Text style={{ fontSize: 12, color: c.sage, marginTop: 4, fontWeight: '600' }}>
            {status?.lastSyncAt ? `Last synced ${timeAgo(status.lastSyncAt)}` : 'Connected — not synced yet'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <TouchableOpacity
          onPress={onSync}
          disabled={busy}
          style={{ flex: 1, backgroundColor: c.cardSage, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
          accessibilityRole="button" accessibilityLabel={`Sync ${meta.label} now`}
        >
          {busy ? <ActivityIndicator color={c.primary} size="small" /> : (
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary }}>Sync now</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDisconnect}
          disabled={busy}
          style={{ flex: 1, backgroundColor: c.cardBlush, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
          accessibilityRole="button" accessibilityLabel={`Disconnect ${meta.label}`}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>Disconnect</Text>
        </TouchableOpacity>
      </View>
    </CardShell>
  );
}

function MarketplaceCard({
  meta, busy, onConnect,
}: {
  meta: IntegrationMeta;
  busy: boolean;
  onConnect: () => void;
}) {
  const c = useColors();
  return (
    <CardShell>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Text style={{ fontSize: 28 }}>{meta.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{meta.label}</Text>
          <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 2, lineHeight: 18 }}>{meta.description}</Text>
          <PermissionsList permissions={meta.permissions} />
        </View>
      </View>
      <TouchableOpacity
        onPress={onConnect}
        disabled={busy}
        style={{ marginTop: 14, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
        accessibilityRole="button" accessibilityLabel={`Connect ${meta.label}`}
      >
        {busy ? <ActivityIndicator color="#fff" size="small" /> : (
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Connect</Text>
        )}
      </TouchableOpacity>
    </CardShell>
  );
}

function ComingSoonCard({ meta }: { meta: IntegrationMeta }) {
  const c = useColors();
  return (
    <View style={{ opacity: 0.55 }}>
      <CardShell>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 24 }}>{meta.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>{meta.label}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{meta.description}</Text>
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted }}>Coming soon</Text>
        </View>
      </CardShell>
    </View>
  );
}
