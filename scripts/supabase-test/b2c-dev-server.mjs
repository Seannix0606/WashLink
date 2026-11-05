#!/usr/bin/env node
// Runs the web app against the LOCAL Supabase stack only, for manual B2C checks. The local URL and key are read from
// `npx supabase status` and passed as process environment, which Vite ranks above any frontend/.env file, so a real project's
// settings are never used here. Refuses non-loopback API URLs. Prints no keys.
//
//   node scripts/supabase-test/b2c-browser-seed.mjs    (test accounts, final prices, bookings open)
//   node scripts/supabase-test/b2c-dev-server.mjs

import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { STAGED_DIRECTORY_NAME } from './stage-local-workdir.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workdir = path.join(repoRoot, STAGED_DIRECTORY_NAME)
const status = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
if (status.status !== 0) {
  console.error('b2c-dev-server: local stack is not running')
  process.exit(2)
}
const values = Object.fromEntries(
  status.stdout.split(/\r?\n/).map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((match) => [match[1], match[2]]),
)
if (!values.API_URL || !values.ANON_KEY || !['127.0.0.1', 'localhost'].includes(new URL(values.API_URL).hostname)) {
  console.error('b2c-dev-server: could not read loopback API settings')
  process.exit(2)
}
const child = spawn('npx vite --port 5173 --strictPort', {
  cwd: path.join(repoRoot, 'frontend'),
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_SUPABASE_URL: values.API_URL, VITE_SUPABASE_ANON_KEY: values.ANON_KEY, VITE_FEATURE_B2B: 'false', VITE_FEATURE_B2C: 'true' },
})
child.on('exit', (code) => process.exit(code ?? 0))
