import React, { useState, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { RootStackParamList } from '../App'
import { useColors, Colors } from '../lib/theme'

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>

export default function Welcome({ navigation }: Props) {
  const [loading, setLoading] = useState(false)

  const c = useColors()
  const styles = useMemo(() => makeStyles(c), [c])

  async function handleGetStarted() {
    setLoading(true)
    await AsyncStorage.setItem('onboarding_complete', 'true')
    navigation.replace('Home')
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🏘️</Text>
        <Text style={styles.title}>Welcome to Village!</Text>
        <Text style={styles.subtitle}>
          Your place to connect, share, and grow with your local community.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleGetStarted}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color={c.primaryText} />
        ) : (
          <Text style={styles.buttonText}>Get Started</Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
      padding: 24,
      justifyContent: 'space-between',
      paddingBottom: 40,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    emoji: {
      fontSize: 80,
      marginBottom: 28,
    },
    title: {
      fontSize: 32,
      fontWeight: '800',
      color: c.textPrimary,
      textAlign: 'center',
      marginBottom: 16,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 17,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 26,
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 18,
      alignItems: 'center',
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    buttonDisabled: {
      opacity: 0.65,
    },
    buttonText: {
      color: c.primaryText,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  })
}
