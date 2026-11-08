import { readFeatureFlags } from '@washlink/shared'

// Expo inlines EXPO_PUBLIC_ variables only where they are written out in full, so each one is named here.
const environment: Readonly<Record<string, string | undefined>> = {
  FEATURE_B2B: process.env.EXPO_PUBLIC_FEATURE_B2B,
  FEATURE_B2C: process.env.EXPO_PUBLIC_FEATURE_B2C,
  FEATURE_WASHER_SIGNUP: process.env.EXPO_PUBLIC_FEATURE_WASHER_SIGNUP,
}

/** Release flags, the same as the website's. They only change what the app offers; the database still decides. */
export const featureFlags = readFeatureFlags((name) => environment[name])
