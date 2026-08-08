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

export default function TermsOfServiceScreen({ onClose }: { onClose: () => void }) {
  const c = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
      }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>Terms of Service</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={{ fontSize: 22, color: c.textMuted }}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 20 }}>Last updated: {LAST_UPDATED}</Text>

        <Section title="1. Acceptance of Terms">
          By creating an account or using Parent Patch, you agree to these Terms of Service and our Privacy Policy. If you don't agree, please don't use the app.
        </Section>

        <Section title="2. Eligibility">
          You must be at least 15 years old to create a Parent Patch account. By signing up, you confirm you meet this requirement and that the information you provide is accurate.
        </Section>

        <Section title="3. User Accounts">
          You're responsible for keeping your login credentials secure and for all activity on your account. Let us know right away at {CONTACT_EMAIL} if you suspect unauthorized access. You may share access to a baby profile with a co-parent or caregiver using the app's built-in sharing features.
        </Section>

        <Section title="4. Community Guidelines">
          Parent Patch is a supportive space for parents and caregivers. Be respectful, don't harass or bully other users, and keep advice you share about health or parenting as your own experience rather than professional guidance. We may remove content or restrict accounts that violate these guidelines.
        </Section>

        <Section title="5. Content Ownership">
          You keep ownership of the photos, posts, and other content you create and share on Parent Patch. By posting, you grant us a limited license to host, store, and display that content within the app so we can operate the features you're using (like your feed, your baby's journal, or a shared calendar). We don't sell your content.
        </Section>

        <Section title="6. Prohibited Conduct">
          You agree not to: post content that is illegal, abusive, or harmful to children; impersonate another person; misuse the marketplace or messaging features to scam or spam other users; attempt to access another user's account or data without authorization; or use the app in a way that could damage, disable, or overburden it.
        </Section>

        <Section title="7. Disclaimers">
          Parent Patch is a tracking, organizing, and community tool for parents — it is NOT a substitute for professional medical advice, diagnosis, or treatment. Tips, community posts, and tracker insights shown in the app are for informational purposes only. Always consult your pediatrician or healthcare provider with questions about your child's health, and your own doctor for your own health. In an emergency, contact emergency services immediately.
        </Section>

        <Section title="8. Limitation of Liability">
          To the fullest extent permitted by law, Parent Patch and its creators are not liable for any indirect, incidental, or consequential damages arising from your use of the app, including reliance on any content, tip, or community post. The app is provided "as is" without warranties of any kind.
        </Section>

        <Section title="9. Termination">
          You may stop using Parent Patch and delete your account at any time from Profile → Settings → Delete Account. We may suspend or terminate accounts that violate these Terms or that pose a risk to other users, including children whose information appears in the app.
        </Section>

        <Section title="10. Changes to These Terms">
          We may update these Terms as Parent Patch changes. We'll update the "Last updated" date above, and for significant changes we'll let you know in the app.
        </Section>

        <Section title="11. Contact Us">
          Questions about these Terms? Email us at {CONTACT_EMAIL}.
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
