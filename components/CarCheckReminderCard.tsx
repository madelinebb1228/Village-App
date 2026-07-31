import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Modal, Platform,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as Location from 'expo-location';
import { Colors, useColors } from '../lib/theme';
import { ensureNotificationPermission } from '../lib/notifications';
import {
  CarCheckSettings,
  getCarCheckSettings,
  saveCarCheckSettings,
  saveActiveProfile,
} from '../lib/carCheckSettings';
import { startCarCheckTracking, stopCarCheckTracking } from '../lib/carCheckTask';

// ─── Quiet-hour presets (same shape as the diaper reminder's) ─────────────────

const QUIET_PRESETS = [
  { label: 'None',         quietStart: null, quietEnd: null },
  { label: '9 PM – 6 AM',  quietStart: 21,   quietEnd: 6   },
  { label: '10 PM – 7 AM', quietStart: 22,   quietEnd: 7   },
  { label: '11 PM – 7 AM', quietStart: 23,   quietEnd: 7   },
];

const DEFAULT_SETTINGS: CarCheckSettings = { enabled: false, quietStart: null, quietEnd: null };

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  userId: string | null;
  babyId: string | null;
  babyName: string | null;
}

export default function CarCheckReminderCard({ userId, babyId, babyName }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [loading,        setLoading]        = useState(true);
  const [settings,       setSettings]       = useState<CarCheckSettings>(DEFAULT_SETTINGS);
  const [showSettings,   setShowSettings]   = useState(false);
  const [showBgModal,    setShowBgModal]    = useState(false);
  const [requesting,     setRequesting]     = useState(false);
  const [deniedMessage,  setDeniedMessage]  = useState<string | null>(null);

  // Keep the on-device "who's the active baby" cache fresh so the background
  // task (which has no React context / Supabase session) can look it up.
  useEffect(() => {
    if (userId && babyId) saveActiveProfile(userId, babyId, babyName);
  }, [userId, babyId, babyName]);

  useEffect(() => {
    if (!userId || !babyId) { setLoading(false); return; }
    getCarCheckSettings(userId, babyId).then(s => { setSettings(s); setLoading(false); });
  }, [userId, babyId]);

  async function turnOn() {
    if (!userId || !babyId) return;
    setDeniedMessage(null);
    setRequesting(true);

    const notifOk = await ensureNotificationPermission();
    if (!notifOk) {
      setDeniedMessage('Notifications were denied — this feature can\'t alert you without them. You can enable them later in system Settings.');
      setRequesting(false);
      return;
    }

    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) {
      setDeniedMessage('Location was denied — this feature can\'t work without it. You can enable it later in system Settings.');
      setRequesting(false);
      return;
    }

    setRequesting(false);
    setShowBgModal(true);
  }

  async function confirmBackgroundPermission() {
    if (!userId || !babyId) return;
    setShowBgModal(false);
    setRequesting(true);

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) {
      setDeniedMessage('Background location was denied — this feature can\'t work without it. You can enable it later in system Settings.');
      setRequesting(false);
      return;
    }

    const next = { ...settings, enabled: true };
    setSettings(next);
    await saveActiveProfile(userId, babyId, babyName);
    await saveCarCheckSettings(userId, babyId, next);
    await startCarCheckTracking();
    setRequesting(false);
  }

  async function turnOff() {
    if (!userId || !babyId) return;
    setDeniedMessage(null);
    const next = { ...settings, enabled: false };
    setSettings(next);
    await saveCarCheckSettings(userId, babyId, next);
    await stopCarCheckTracking();
  }

  function setQuiet(quietStart: number | null, quietEnd: number | null) {
    if (!userId || !babyId) return;
    const next = { ...settings, quietStart, quietEnd };
    setSettings(next);
    saveCarCheckSettings(userId, babyId, next);
  }

  if (!babyId) return null;

  const isWeb = Platform.OS === 'web';

  return (
    <View style={s.wrap}>
      <TouchableOpacity
        style={s.headerRow}
        onPress={() => setShowSettings(p => !p)}
        activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel={showSettings ? 'Hide car check settings' : 'Show car check settings'}
      >
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>🚗</Text>
          <View>
            <Text style={s.headerTitle}>Car Check</Text>
            {loading ? (
              <ActivityIndicator size="small" color={c.textMuted} style={{ alignSelf: 'flex-start' }} />
            ) : (
              <Text style={s.headerSub}>
                {isWeb ? 'Not available on web' : settings.enabled ? 'Watching for stops' : 'Off'}
              </Text>
            )}
          </View>
        </View>
        <Text style={s.chevron}>{showSettings ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Always visible — not hidden behind the settings toggle. */}
      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>
          This is a supplementary reminder only. It cannot detect whether {babyName || 'your baby'} is
          actually in the car — it only detects that you stopped driving. Always physically check the
          back seat, every time.
        </Text>
      </View>

      {showSettings && (
        <View style={s.settingsBody}>
          {isWeb ? (
            <Text style={s.webNote}>
              Background location isn't available in the web app. Use the mobile app to enable this.
            </Text>
          ) : (
            <>
              <View style={s.toggleRow}>
                <Text style={s.toggleLabel}>Remind me to check the back seat</Text>
                {requesting ? (
                  <ActivityIndicator size="small" color={c.honey} />
                ) : (
                  <TouchableOpacity
                    style={[s.toggle, settings.enabled && { backgroundColor: c.honey }]}
                    onPress={() => (settings.enabled ? turnOff() : turnOn())}
                    activeOpacity={0.8}
                    accessibilityRole="switch" accessibilityLabel="Remind me to check the back seat" accessibilityState={{ checked: settings.enabled }}
                  >
                    <View style={[s.toggleThumb, settings.enabled && { transform: [{ translateX: 20 }] }]} />
                  </TouchableOpacity>
                )}
              </View>

              {deniedMessage && <Text style={s.deniedText}>{deniedMessage}</Text>}

              <Text style={s.settingsLabel}>Quiet hours (defer, don't skip)</Text>
              <View style={s.chipRow}>
                {QUIET_PRESETS.map(p => {
                  const active = settings.quietStart === p.quietStart && settings.quietEnd === p.quietEnd;
                  return (
                    <TouchableOpacity
                      key={p.label}
                      style={[s.chip, active && { backgroundColor: c.cardLavender, borderColor: c.lavender }]}
                      onPress={() => setQuiet(p.quietStart, p.quietEnd)}
                      activeOpacity={0.8}
                      accessibilityRole="button" accessibilityLabel={p.label}
                    >
                      <Text style={[s.chipText, active && { color: c.lavender, fontWeight: '700' }]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>
      )}

      {/* ══ Background-location explainer, shown before the OS "Always" prompt ══ */}
      <Modal visible={showBgModal} transparent animationType="fade" onRequestClose={() => setShowBgModal(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowBgModal(false)}
            accessibilityRole="button" accessibilityLabel="Close" />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>One more permission</Text>
            <Text style={s.modalBody}>
              To notice when you've stopped driving even if Parent Patch isn't open, your phone will ask
              to allow location "Always." This app only uses it to watch your speed and detect stops —
              it doesn't track or store where you go.
            </Text>
            <TouchableOpacity style={s.modalConfirmBtn} onPress={confirmBackgroundPermission} activeOpacity={0.8}
              accessibilityRole="button" accessibilityLabel="Continue">
              <Text style={s.modalConfirmText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowBgModal(false)} activeOpacity={0.8}
              accessibilityRole="button" accessibilityLabel="Not now">
              <Text style={s.modalCancelText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.card, borderRadius: 16, marginBottom: 16,
      borderWidth: 1.5, borderColor: c.separator, overflow: 'hidden',
    },

    headerRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: 14, borderLeftWidth: 4, borderLeftColor: c.honey,
    },
    headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerEmoji: { fontSize: 26 },
    headerTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    headerSub:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    chevron:     { fontSize: 11, color: c.textMuted },

    disclaimer:     { margin: 12, marginTop: 0, backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#DC2626' },
    disclaimerText: { fontSize: 12, color: '#7F1D1D', lineHeight: 17, fontWeight: '600' },

    settingsBody:  { paddingHorizontal: 14, paddingBottom: 14, gap: 8, borderTopWidth: 1, borderTopColor: c.separator },
    webNote:       { fontSize: 12, color: c.textMuted, paddingTop: 10, fontStyle: 'italic' },

    toggleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 },
    toggleLabel: { fontSize: 13, fontWeight: '600', color: c.textPrimary, flex: 1, marginRight: 10 },
    toggle:      { width: 46, height: 26, borderRadius: 13, backgroundColor: c.separator, justifyContent: 'center', paddingHorizontal: 2 },
    toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },

    deniedText: { fontSize: 12, color: c.honey, marginTop: 6, lineHeight: 17 },

    settingsLabel: { fontSize: 12, fontWeight: '700', color: c.textSecondary, marginTop: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:    { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    chipText:{ fontSize: 13, color: c.textSecondary },

    // Background-permission explainer modal
    modalOverlay:  { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet:    { backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
    modalHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: c.separator, alignSelf: 'center', marginBottom: 16 },
    modalTitle:    { fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 8 },
    modalBody:     { fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 20 },
    modalConfirmBtn: { backgroundColor: c.honey, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
    modalConfirmText:{ fontSize: 14, fontWeight: '800', color: '#fff' },
    modalCancelBtn:  { alignItems: 'center', paddingVertical: 6 },
    modalCancelText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  });
}
