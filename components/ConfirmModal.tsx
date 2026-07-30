import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useColors, Colors } from '../lib/theme';

export interface ConfirmModalButton {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'destructive';
  loading?: boolean;
}

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  buttons: ConfirmModalButton[];
  onRequestClose: () => void;
}

// A real RN <Modal> rather than Alert.alert / window.confirm, so it renders
// identically on native and web (react-native-web's Alert.alert is a no-op)
// and supports more than two buttons.
export default function ConfirmModal({ visible, title, message, buttons, onRequestClose }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onRequestClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onRequestClose} />
        <View style={s.card}>
          <Text style={s.title}>{title}</Text>
          {message ? <Text style={s.message}>{message}</Text> : null}
          <View style={s.buttonStack}>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  s.button,
                  b.variant === 'primary' && s.buttonPrimary,
                  b.variant === 'destructive' && s.buttonDestructive,
                ]}
                onPress={b.onPress}
                disabled={b.loading}
                activeOpacity={0.8}
              >
                {b.loading ? (
                  <ActivityIndicator size="small" color={b.variant === 'primary' || b.variant === 'destructive' ? '#fff' : c.textPrimary} />
                ) : (
                  <Text style={[
                    s.buttonText,
                    (b.variant === 'primary' || b.variant === 'destructive') && s.buttonTextLight,
                  ]}>
                    {b.label}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,27,75,0.5)' },
    card: {
      backgroundColor: c.bg,
      borderRadius: 20,
      padding: 22,
      width: '100%',
      maxWidth: 340,
    },
    title: { fontSize: 17, fontWeight: '800', color: c.textPrimary, marginBottom: 6, textAlign: 'center' },
    message: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
    buttonStack: { gap: 8, marginTop: 4 },
    button: {
      paddingVertical: 13,
      borderRadius: 14,
      alignItems: 'center',
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.separator,
    },
    buttonPrimary: { backgroundColor: c.primary, borderColor: c.primary },
    buttonDestructive: { backgroundColor: c.signOut, borderColor: c.signOut },
    buttonText: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    buttonTextLight: { color: '#fff' },
  });
}
