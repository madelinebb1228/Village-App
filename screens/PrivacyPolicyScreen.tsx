import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../lib/theme';

const LAST_UPDATED = 'August 8, 2026';
const CONTACT_EMAIL = 'madelinebb1228@gmail.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary, marginBottom: 8 }}>{title}</Text>
      <Text style={{ fontSize: 14, color: c.textMuted, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}

export default function PrivacyPolicyScreen({ onClose }: { onClose: () => void }) {
  const c = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
      }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>Privacy Policy</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={{ fontSize: 22, color: c.textMuted }}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 20 }}>Last updated: {LAST_UPDATED}</Text>

        <Section title="Information We Collect">
          To provide Parent Patch's features, we collect:{'\n\n'}
          • Account info you provide: email, first name, date of birth, and password.{'\n'}
          • Profile info: username, display name, avatar, and any bio you add.{'\n'}
          • Baby and family tracking data you log: feeding, diaper, sleep, growth, medication, symptom, and vaccine records; milestones and journal entries; photos and videos you upload for these.{'\n'}
          • Health-adjacent tracking data for parents (mom trackers): period, pregnancy, mood, mental health check-ins, and recovery logs, where you choose to use those features.{'\n'}
          • Household data: expenses, shopping lists, calendar events, and handoff notes you create.{'\n'}
          • Community content: posts, comments, messages, marketplace listings, and Q&A you post to the community.{'\n'}
          • Location: if you enable driving-detection reminders, we collect background location to detect when you've stopped driving, so we can remind you to check the back seat. This is only collected if you turn the feature on, and you can disable it at any time in your device settings.{'\n'}
          • Device permissions you grant: camera and photo library (to attach photos/videos), microphone (for video posts), and notifications.{'\n'}
          • Usage and crash data, collected automatically to help us fix bugs and improve the app.
        </Section>

        <Section title="How We Use It">
          We use this information to operate Parent Patch's core features — trackers, reminders, your community feed, calendar, and messaging — to personalize content (like your daily tip and reminders), to keep the community safe (content moderation, blocking, reporting), to communicate with you (account and safety notifications), and to maintain and improve the app (bug fixes, crash reports, usage trends).
        </Section>

        <Section title="Data Sharing">
          We NEVER sell your data. We share information only with:{'\n\n'}
          • Service providers who help us run the app (e.g. our database and hosting provider Supabase, crash reporting via Sentry, subscription billing, and — only if you connect it — Google Calendar).{'\n'}
          • Other users, for content you choose to share publicly or with a Patch/community (posts, comments, profile info).{'\n'}
          • Law enforcement or regulators, only if required by law.{'\n\n'}
          We do not share your baby's health or tracking data with advertisers.
        </Section>

        <Section title="Your Rights">
          You can access, correct, export, or delete your data at any time from Profile → Settings: use "Export My Data" to download a copy of your information, or "Delete Account" to permanently delete your account and all associated data. Depending on where you live, you may also have additional rights under laws like the GDPR or state privacy laws (e.g. to object to certain processing, or to lodge a complaint with a regulator). Contact us at {CONTACT_EMAIL} for any privacy request.
        </Section>

        <Section title="Children's Privacy">
          Parent Patch is intended for parents and caregivers aged 15 and older — it is not directed at children, and children do not create their own accounts. Baby/child profile information (name, birth date, growth, health logs, photos) is entered by the parent or caregiver who owns the account, about their own child, for their own personal tracking use. We do not knowingly collect personal information directly from children. If you believe a child has provided us information directly, contact us at {CONTACT_EMAIL} and we will remove it.
        </Section>

        <Section title="Data Security">
          We use industry-standard safeguards — encrypted connections (TLS), encrypted storage for sensitive integration credentials, and access controls that limit data to your own account — to protect your information. No method of transmission or storage is 100% secure, so we can't guarantee absolute security, but we work to protect your data and to respond quickly if something goes wrong.
        </Section>

        <Section title="Changes to This Policy">
          We may update this policy as Parent Patch changes. We'll update the "Last updated" date above, and for significant changes we'll let you know in the app.
        </Section>

        <Section title="Contact Us">
          Questions about this policy or your data? Email us at {CONTACT_EMAIL}.
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
