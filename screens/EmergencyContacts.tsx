import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Linking } from 'react-native';
import { useColors, Colors } from '../lib/theme';

interface Props {
  onBack: () => void;
}

interface Contact {
  name: string;
  number: string;
  display: string;
  description: string;
  canText?: boolean;
}

interface ContactGroup {
  emoji: string;
  title: string;
  bg: (c: Colors) => string;
  border: (c: Colors) => string;
  contacts: Contact[];
}

const GROUPS: ContactGroup[] = [
  {
    emoji: '🚨',
    title: 'Emergency',
    bg: c => c.cardBlush, border: c => c.blush,
    contacts: [
      { name: 'Emergency (US)', number: '911', display: '911', description: 'Life-threatening emergencies: not breathing, unresponsive, severe injury, active choking that won\'t clear.' },
      { name: 'Poison Control', number: '18002221222', display: '1-800-222-1222', description: 'Suspected poisoning, medication overdose, or swallowed something dangerous. Free, confidential, 24/7 — they\'ll tell you if you need the ER.' },
    ],
  },
  {
    emoji: '💜',
    title: 'Mental health & crisis support',
    bg: c => c.cardLavender, border: c => c.lavender,
    contacts: [
      { name: '988 Suicide & Crisis Lifeline', number: '988', display: '988', description: 'Call or text if you or someone you love is in emotional crisis or having thoughts of self-harm.', canText: true },
      { name: 'Postpartum Support International', number: '18009444773', display: '1-800-944-4773', description: 'Call or text for postpartum depression, anxiety, and perinatal mood support.', canText: true },
    ],
  },
  {
    emoji: '🛡️',
    title: 'Safety hotlines',
    bg: c => c.cardBlue, border: c => c.blue,
    contacts: [
      { name: 'National Domestic Violence Hotline', number: '18007997233', display: '1-800-799-7233', description: 'Confidential support for domestic violence, available 24/7.' },
      { name: 'Childhelp National Child Abuse Hotline', number: '18004224453', display: '1-800-422-4453', description: 'Report or get guidance on suspected child abuse, 24/7.' },
    ],
  },
];

export default function EmergencyContacts({ onBack }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  const call = (number: string) => Linking.openURL(`tel:${number}`);
  const text = (number: string) => Linking.openURL(`sms:${number}`);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.heroCard, { backgroundColor: c.cardBlush, borderColor: c.blush }]}>
          <Text style={s.heroEmoji}>🚨</Text>
          <Text style={s.heroTitle}>Emergency Contacts</Text>
          <Text style={s.heroDesc}>
            Tap any number to call. If a child is unresponsive, not breathing, or in immediate danger, call 911 first.
          </Text>
        </View>

        {GROUPS.map(group => (
          <View
            key={group.title}
            style={[s.groupCard, { backgroundColor: group.bg(c), borderColor: group.border(c) }]}
          >
            <Text style={s.groupTitle}>{group.emoji}  {group.title}</Text>
            {group.contacts.map(contact => (
              <View key={contact.name} style={s.contactRow}>
                <View style={s.contactInfo}>
                  <Text style={s.contactName}>{contact.name}</Text>
                  <Text style={s.contactDesc}>{contact.description}</Text>
                </View>
                <View style={s.contactActions}>
                  <TouchableOpacity
                    style={[s.callBtn, { backgroundColor: group.border(c) }]}
                    onPress={() => call(contact.number)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.callBtnText}>📞 {contact.display}</Text>
                  </TouchableOpacity>
                  {contact.canText && (
                    <TouchableOpacity
                      style={[s.textBtn, { borderColor: group.border(c) }]}
                      onPress={() => text(contact.number)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.textBtnText, { color: group.border(c) }]}>💬 Text</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={[s.groupCard, { backgroundColor: c.cardHoney, borderColor: c.honey }]}>
          <Text style={s.groupTitle}>📌  Keep your pediatrician handy</Text>
          <Text style={s.contactDesc}>
            Your pediatrician's office and after-hours nurse line are the fastest way to get guidance for
            non-emergency concerns — save them in your phone and in Local Services so they're always one tap away.
          </Text>
        </View>

        <Text style={s.disclaimer}>
          This list is general guidance, not medical advice. When in doubt about a child's safety, call 911.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.separator },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 18, color: c.textPrimary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textPrimary, fontWeight: '600' },

    body: { padding: 20, paddingBottom: 48, gap: 14 },

    heroCard: { borderRadius: 18, borderWidth: 2, padding: 20, alignItems: 'center', marginBottom: 4 },
    heroEmoji: { fontSize: 36, marginBottom: 8 },
    heroTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginBottom: 8, textAlign: 'center' },
    heroDesc: { fontSize: 14, color: c.textSecondary, lineHeight: 20, textAlign: 'center' },

    groupCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 14 },
    groupTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },

    contactRow: { gap: 10 },
    contactInfo: { gap: 3 },
    contactName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    contactDesc: { fontSize: 13, color: c.textSecondary, lineHeight: 18 },
    contactActions: { flexDirection: 'row', gap: 8 },
    callBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20 },
    callBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
    textBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, backgroundColor: 'transparent' },
    textBtnText: { fontSize: 13, fontWeight: '800' },

    disclaimer: { fontSize: 12, color: c.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: 8, lineHeight: 17 },
  });
}
