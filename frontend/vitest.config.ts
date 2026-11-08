import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Tests load env files only from an empty directory, so frontend/.env* is never read.
const isolatedEnvironmentDirectory = fileURLToPath(
  new URL('./src/test/isolated-env', import.meta.url),
)

export default mergeConfig(
  viteConfig,
  defineConfig({
    envDir: isolatedEnvironmentDirectory,
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      env: {
        VITE_SUPABASE_URL: 'http://127.0.0.1:9',
        VITE_SUPABASE_ANON_KEY: 'vitest-placeholder-not-a-key',
        // Existing owner and workforce tests run with B2B on; the B2C default has its own tests.
        VITE_FEATURE_B2B: 'true',
        VITE_FEATURE_B2C: 'false',
        // The existing sign-up tests cover the worker role; washer sign-up closed has its own tests.
        VITE_FEATURE_WASHER_SIGNUP: 'true',
      },
    },
  }),
)
