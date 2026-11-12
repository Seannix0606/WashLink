import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@washlink/shared': fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
    // In Docker on Windows, saved files send no change events into the container, so Vite polls (compose.yaml sets
    // WASHLINK_DEV_POLLING). Outside Docker it watches normally.
    watch: process.env.WASHLINK_DEV_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
  },
})
