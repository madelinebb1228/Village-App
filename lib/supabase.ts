import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Database } from '../types/supabase'

const supabaseUrl = 'https://vhrhosdegyomgipzlyet.supabase.co'
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocmhvc2RlZ3lvbWdpcHpseWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTE1MjYsImV4cCI6MjA5NDI4NzUyNn0.r9ggwIQ0QC-Ofz93034355JwNM6Mu4rI5L0dT5P6lYg'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
