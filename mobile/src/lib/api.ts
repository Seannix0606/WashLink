import 'react-native-url-polyfill/auto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'
import { B2cRequestError, createB2cApi, type B2cApi, type B2cSupabaseClient } from '@washlink/shared'
import { secureSessionStorage } from './secureSessionStorage'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)

/** Uses the public anon key only. Row rules and database functions decide what this client may do. */
export const supabase: SupabaseClient = createClient(url ?? 'http://127.0.0.1:54321', anonKey ?? 'not-configured', {
  auth: { storage: secureSessionStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
})

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh()
    } else {
      void supabase.auth.stopAutoRefresh()
    }
  })
}

export const api: B2cApi = createB2cApi(supabase as unknown as B2cSupabaseClient)

export function errorMessage(error: unknown): string {
  return error instanceof B2cRequestError ? error.message : 'Something went wrong. Check your connection and try again.'
}
