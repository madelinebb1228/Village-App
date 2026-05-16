import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error: any) {
      Alert.alert('Error', error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.logo}>Village</Text>
        <TouchableOpacity
          onPress={handleSignOut}
          disabled={loading}
          activeOpacity={0.7}
          style={styles.signOutButton}
        >
          <Text style={styles.signOutText}>{loading ? '…' : 'Sign Out'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Your Community</Text>

        <View style={styles.card}>
          <Text style={styles.cardEmoji}>📣</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Announcements</Text>
            <Text style={styles.cardSub}>Nothing new yet — check back soon.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEmoji}>🗓️</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Upcoming Events</Text>
            <Text style={styles.cardSub}>No events scheduled.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEmoji}>🤝</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Neighbours</Text>
            <Text style={styles.cardSub}>Be the first to say hello!</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f3ff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ede9fe',
    backgroundColor: '#ffffff',
  },
  logo: {
    fontSize: 22,
    fontWeight: '800',
    color: '#6366f1',
    letterSpacing: -0.5,
  },
  signOutButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  signOutText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardEmoji: {
    fontSize: 32,
    marginRight: 16,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 13,
    color: '#9ca3af',
  },
})
