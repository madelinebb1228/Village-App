import React, { useState, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useColors, Colors } from '../lib/theme'
import { MAX_FONT_SCALE } from '../lib/accessibility'
import { track, identifyUser } from '../lib/analytics'
import PrivacyPolicyScreen from './PrivacyPolicyScreen'
import TermsOfServiceScreen from './TermsOfServiceScreen'

export default function Auth() {
  const [legalScreen, setLegalScreen] = useState<'privacy' | 'terms' | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [dobMonth, setDobMonth] = useState('')
  const [dobDay, setDobDay] = useState('')
  const [dobYear, setDobYear] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const c = useColors()
  const styles = useMemo(() => makeStyles(c), [c])

  async function handleAuth() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter your email and password.')
      return
    }

    let dobIso: string | undefined;
    if (isSignUp) {
      if (!firstName.trim()) {
        Alert.alert('Error', 'Please enter your first name.');
        return;
      }
      const month = parseInt(dobMonth, 10);
      const day = parseInt(dobDay, 10);
      const year = parseInt(dobYear, 10);
      if (!dobMonth || !dobDay || !dobYear || isNaN(month) || isNaN(day) || isNaN(year) ||
          month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > new Date().getFullYear()) {
        Alert.alert('Date of Birth Required', 'Please enter a valid date of birth.');
        return;
      }
      const dob = new Date(year, month - 1, day);
      dobIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) {
        age--;
      }
      if (age < 15) {
        Alert.alert('Age Requirement', 'Sorry — you must be 15 or older to use Parent Patch.');
        return;
      }
      if (!agreedToTerms) {
        Alert.alert('Agreement Required', 'Please agree to the Terms of Service and Privacy Policy to continue.');
        return;
      }
    }

    setLoading(true)
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: data.user.id,
            display_name: firstName.trim(),
            first_name: firstName.trim(),
            date_of_birth: dobIso,
          } as any, { onConflict: 'id' });
          if (profileError) console.warn('Profile name save failed:', profileError.message);
          track('sign_up', { method: 'email' })
          identifyUser(data.user.id, { email: data.user.email })
        }
        Alert.alert(
          'Check your email',
          'We sent you a confirmation link. Please verify your email before signing in.'
        )
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        track('sign_in', { method: 'email' })
        if (data.user) identifyUser(data.user.id)
      }
    } catch (error: any) {
      Alert.alert('Authentication Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert('Error', 'Enter your email above first, then tap "Forgot password?".')
      return
    }
    setResetLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
      if (error) throw error
      Alert.alert('Check your email', 'We sent you a link to reset your password.')
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setResetLoading(false)
    }
  }

  if (legalScreen === 'privacy') {
    return <PrivacyPolicyScreen onClose={() => setLegalScreen(null)} />
  }
  if (legalScreen === 'terms') {
    return <TermsOfServiceScreen onClose={() => setLegalScreen(null)} />
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.logo} accessibilityRole="header" allowFontScaling maxFontSizeMultiplier={MAX_FONT_SCALE}>Parent Patch</Text>
          <Text style={styles.tagline}>Track · Connect · Support · Grow</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">{isSignUp ? 'Create Account' : 'Welcome Back'}</Text>
          <Text style={styles.subtitle}>
            {isSignUp ? 'Join Parent Patch today' : 'Sign in to continue'}
          </Text>

          {isSignUp && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                placeholder="First name"
                placeholderTextColor={c.textMuted}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="given-name"
                accessibilityLabel="First name"
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={c.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              accessibilityLabel="Email address"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="••••••••"
                placeholderTextColor={c.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                accessibilityLabel="Password"
              />
              <TouchableOpacity
                style={styles.showPasswordBtn}
                onPress={() => setShowPassword(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            {!isSignUp && (
              <TouchableOpacity
                style={styles.forgotPasswordBtn}
                onPress={handleForgotPassword}
                disabled={resetLoading}
                accessibilityRole="button"
                accessibilityLabel="Forgot password?"
                accessibilityHint="Sends a password reset link to the email address entered above"
              >
                <Text style={styles.forgotPasswordText}>
                  {resetLoading ? 'Sending...' : 'Forgot password?'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {isSignUp && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date of Birth</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="MM"
                  placeholderTextColor={c.textMuted}
                  value={dobMonth}
                  onChangeText={setDobMonth}
                  keyboardType="number-pad"
                  maxLength={2}
                  accessibilityLabel="Birth month"
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="DD"
                  placeholderTextColor={c.textMuted}
                  value={dobDay}
                  onChangeText={setDobDay}
                  keyboardType="number-pad"
                  maxLength={2}
                  accessibilityLabel="Birth day"
                />
                <TextInput
                  style={[styles.input, { flex: 2 }]}
                  placeholder="YYYY"
                  placeholderTextColor={c.textMuted}
                  value={dobYear}
                  onChangeText={setDobYear}
                  keyboardType="number-pad"
                  maxLength={4}
                  accessibilityLabel="Birth year"
                />
              </View>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 5 }}>
                You must be 15 or older to create an account.
              </Text>
            </View>
          )}

          {isSignUp && (
            <TouchableOpacity
              style={styles.consentRow}
              onPress={() => setAgreedToTerms(v => !v)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreedToTerms }}
              accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
            >
              <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                {agreedToTerms && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.consentText}>
                I agree to the{' '}
                <Text style={styles.consentLink} onPress={() => setLegalScreen('terms')}>
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text style={styles.consentLink} onPress={() => setLegalScreen('privacy')}>
                  Privacy Policy
                </Text>
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled, isSignUp && !agreedToTerms && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading || (isSignUp && !agreedToTerms)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isSignUp ? 'Create Account' : 'Sign In'}
            accessibilityState={{ disabled: loading || (isSignUp && !agreedToTerms), busy: loading }}
          >
            {loading ? (
              <ActivityIndicator color={c.primaryText} />
            ) : (
              <Text style={styles.buttonText}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => { setIsSignUp(v => !v); setFirstName(''); setAgreedToTerms(false); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          >
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.switchTextBold}>
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 24,
    },
    header: {
      alignItems: 'center',
      marginBottom: 36,
    },
    logo: {
      fontSize: 48,
      fontWeight: '800',
      color: c.primary,
      letterSpacing: -1,
    },
    tagline: {
      fontSize: 16,
      color: c.textSecondary,
      marginTop: 6,
      opacity: 0.8,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 24,
      padding: 28,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 8,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: c.textMuted,
      marginBottom: 28,
    },
    inputGroup: {
      marginBottom: 18,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: c.inputBg,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      color: c.textPrimary,
    },
    passwordRow: {
      position: 'relative',
      justifyContent: 'center',
    },
    passwordInput: {
      paddingRight: 60,
    },
    showPasswordBtn: {
      position: 'absolute',
      right: 16,
    },
    showPasswordText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primary,
    },
    forgotPasswordBtn: {
      alignSelf: 'flex-end',
      marginTop: 10,
    },
    forgotPasswordText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    buttonDisabled: {
      opacity: 0.65,
    },
    consentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 4,
      marginBottom: 4,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      backgroundColor: c.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    checkboxChecked: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    checkboxMark: {
      color: c.primaryText,
      fontSize: 13,
      fontWeight: '800',
    },
    consentText: {
      flex: 1,
      fontSize: 13,
      color: c.textMuted,
      lineHeight: 19,
    },
    consentLink: {
      color: c.primary,
      fontWeight: '700',
    },
    buttonText: {
      color: c.primaryText,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    switchButton: {
      alignItems: 'center',
      marginTop: 20,
      paddingVertical: 4,
    },
    switchText: {
      fontSize: 14,
      color: c.textMuted,
    },
    switchTextBold: {
      color: c.primary,
      fontWeight: '700',
    },
  })
}
