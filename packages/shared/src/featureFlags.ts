/**
 * Release flags. A flag only changes what the UI offers; it is never authorization. Permissions stay
 * in RLS and database functions, so a hidden feature is still protected when reached directly.
 */
export interface FeatureFlags {
  /** Shop owner sign-up, sign-in routing, dashboards and workforce tools (docs/b2c/B2B_REACTIVATION.md). */
  readonly isB2bEnabled: boolean
}

type EnvironmentReader = (name: string) => string | undefined

export function readFeatureFlags(readEnvironment: EnvironmentReader): FeatureFlags {
  return { isB2bEnabled: readEnvironment('FEATURE_B2B') === 'true' }
}
