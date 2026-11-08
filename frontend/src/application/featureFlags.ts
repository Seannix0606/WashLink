import { readFeatureFlags } from '@washlink/shared'

export const featureFlags = readFeatureFlags((name) => {
  const value: unknown = import.meta.env[`VITE_${name}`]
  return typeof value === 'string' ? value : undefined
})
