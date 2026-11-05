#!/usr/bin/env node
// Runs the Expo app's browser preview against the LOCAL Supabase stack only. This checks screens and data flow; it says nothing
// about native maps, the keychain, location, push or real-device behaviour. Refuses non-loopback API URLs. Prints no keys.
//
//   node scripts/supabase-test/b2c-browser-seed.mjs
//   node scripts/supabase-test/b2c-mobile-preview.mjs

import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { STAGED_DIRECTORY_NAME } from './stage-local-workdir.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workdir = path.join(repoRoot, STAGED_DIRECTORY_NAME)
const status = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
if (status.status !== 0) {
  console.error('b2c-mobile-preview: local stack is not running')
  process.exit(2)
}
const values = Object.fromEntries(
  status.stdout.split(/\r?\n/).map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((match) => [match[1], match[2]]),
)
if (!values.API_URL || !values.ANON_KEY || !['127.0.0.1', 'localhost'].includes(new URL(values.API_URL).hostname)) {
  console.error('b2c-mobile-preview: could not read loopback API settings')
  process.exit(2)
}
const child = spawn('npx expo start --web --port 8081', {
  cwd: path.join(repoRoot, 'mobile'),
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_SUPABASE_URL: values.API_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY },
})
child.on('exit', (code) => process.exit(code ?? 0))
