/**
 * Release flags. A flag only changes what the UI offers; it is never authorization. Permissions stay
 * in RLS and database functions, so a hidden feature is still protected when reached directly.
 */
export interface FeatureFlags {
  /** Shop owner sign-up, sign-in routing, dashboards and workforce tools (docs/b2c/B2B_REACTIVATION.md). */
  readonly isB2bEnabled: boolean
  /** The on-demand customer and independent worker experience. On unless explicitly turned off. */
  readonly isB2cEnabled: boolean
  /**
   * The "work as a washer" sign-up on web and mobile. Off unless explicitly turned on, while WashLink operates the washes
   * itself. The database closes washer sign-up separately (platform_settings.washer_signup_open), so turn both on together.
   */
  readonly isWasherSignUpEnabled: boolean
}

type EnvironmentReader = (name: string) => string | undefined

export function readFeatureFlags(readEnvironment: EnvironmentReader): FeatureFlags {
  return {
    isB2bEnabled: readEnvironment('FEATURE_B2B') === 'true',
    isB2cEnabled: readEnvironment('FEATURE_B2C') !== 'false',
    isWasherSignUpEnabled: readEnvironment('FEATURE_WASHER_SIGNUP') === 'true',
  }
}
