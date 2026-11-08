// OP-1: the app reads the same release flags as the website, and washer sign-up stays closed unless explicitly turned on.
describe('mobile feature flags', () => {
  const original = process.env.EXPO_PUBLIC_FEATURE_WASHER_SIGNUP

  afterEach(() => {
    process.env.EXPO_PUBLIC_FEATURE_WASHER_SIGNUP = original
    jest.resetModules()
  })

  const load = (): { readonly isWasherSignUpEnabled: boolean } =>
    (jest.requireActual('../lib/featureFlags') as { featureFlags: { readonly isWasherSignUpEnabled: boolean } }).featureFlags

  it('keeps washer sign-up closed by default', () => {
    delete process.env.EXPO_PUBLIC_FEATURE_WASHER_SIGNUP
    expect(load().isWasherSignUpEnabled).toBe(false)
  })

  it('opens washer sign-up only when the flag is exactly true', () => {
    process.env.EXPO_PUBLIC_FEATURE_WASHER_SIGNUP = 'true'
    expect(load().isWasherSignUpEnabled).toBe(true)
  })
})
