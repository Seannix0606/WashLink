import { createB2cApi, type B2cApi, type B2cSupabaseClient } from '@washlink/shared'
import { getSupabaseClient } from '../../infrastructure/supabase/supabaseClient'

let cachedApi: B2cApi | undefined

export function getB2cApi(): B2cApi {
  cachedApi ??= createB2cApi(getSupabaseClient() as unknown as B2cSupabaseClient)
  return cachedApi
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
