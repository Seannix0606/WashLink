import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The Content-Security-Policy, also written into the built page as a meta tag. render.yaml sends it as a header too,
 * but only when Render applies that file, which it did not on the live service (checked 2026-11-13): the meta tag keeps
 * the policy in force either way. frame-ancestors only works as a header, so it is left out here. Only built pages get
 * it: the dev server needs inline scripts for hot reload. A new Supabase domain, map or address provider must be added
 * here and in render.yaml.
 */
export function contentSecurityPolicy(supabaseUrl = ''): string {
  // The configured Supabase address is allowed as well, so a custom domain (or the local stack in tests) keeps working.
  let supabase = ''
  let supabaseSocket = ''
  try {
    const origin = new URL(supabaseUrl).origin
    supabase = ` ${origin}`
    supabaseSocket = ` ${origin.replace(/^http/, 'ws')}`
  } catch { /* no or invalid URL: the *.supabase.co entries cover the hosted project */ }
  return [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  `img-src 'self' data: blob: https://tile.openstreetmap.org https://*.supabase.co${supabase}`,
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${supabase}${supabaseSocket} https://nominatim.openstreetmap.org`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ].join('; ')
}

function contentSecurityPolicyMeta(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'washlink-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(supabaseUrl) }, injectTo: 'head-prepend' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), contentSecurityPolicyMeta(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL)],
  build: {
    // Never publish source maps: they would hand out the original source.
    sourcemap: false,
  },
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
}))
