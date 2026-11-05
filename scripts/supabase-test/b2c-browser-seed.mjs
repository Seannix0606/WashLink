#!/usr/bin/env node
// LOCAL STACK ONLY. Creates test accounts for trying the B2C flow by hand, sets final test prices and opens bookings.
// Accounts: b2c-customer@local.test, b2c-worker@local.test (not yet verified), b2c-admin@local.test; the password is below and
// is only valid on this local stack. Safe to re-run. Refuses non-loopback URLs. Never point this at a real project.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertLocalTestProjectId, STAGED_DIRECTORY_NAME } from './stage-local-workdir.mjs'

const LOCAL_TEST_PASSWORD = 'Local-B2C-Test-Pw1!'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workdir = path.join(repoRoot, STAGED_DIRECTORY_NAME)
const require = createRequire(path.join(repoRoot, 'frontend', 'package.json'))
const { createClient } = require('@supabase/supabase-js')
assertLocalTestProjectId(fs.readFileSync(path.join(workdir, 'supabase', 'config.toml'), 'utf8'), 'staged config.toml')

const status = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
const values = Object.fromEntries(
  status.stdout.split(/\r?\n/).map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((match) => [match[1], match[2]]),
)
if (status.status !== 0 || !values.API_URL || !['127.0.0.1', 'localhost'].includes(new URL(values.API_URL).hostname)) {
  console.error('b2c-browser-seed: local stack is not available')
  process.exit(2)
}
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(values.API_URL, values.SERVICE_ROLE_KEY, options)

async function ensureUser(email, role, fullName) {
  const created = await admin.auth.admin.createUser({ email, password: LOCAL_TEST_PASSWORD, email_confirm: true, user_metadata: { role: role === 'super_admin' ? 'customer' : role, full_name: fullName } })
  if (created.error && !/already/i.test(created.error.message)) throw created.error
  const profile = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  const id = created.data.user?.id ?? profile.data?.id
  if (!id) throw new Error(`no id for ${email}`)
  if (role === 'super_admin') {
    const promoted = await admin.from('profiles').update({ role }).eq('id', id)
    if (promoted.error) throw promoted.error
  }
  return id
}

await ensureUser('b2c-customer@local.test', 'customer', 'Bea Customer')
await ensureUser('b2c-worker@local.test', 'worker', 'Wes Washer')
await ensureUser('b2c-admin@local.test', 'super_admin', 'Ana Admin')

const adminUser = createClient(values.API_URL, values.ANON_KEY, options)
const signedIn = await adminUser.auth.signInWithPassword({ email: 'b2c-admin@local.test', password: LOCAL_TEST_PASSWORD })
if (signedIn.error) throw signedIn.error
const catalog = await adminUser.rpc('admin_catalog')
if (catalog.error) throw catalog.error
for (const service of catalog.data.services) {
  const saved = await adminUser.rpc('admin_save_service', {
    p_id: service.id, p_key: service.key, p_category: service.category, p_name: service.name, p_description: service.description, p_image_url: service.image_url,
    p_requirements: service.requirements, p_base_price_cents: 45000, p_duration_minutes: service.duration_minutes, p_is_active: service.is_active, p_price_is_draft: false, p_sort_order: service.sort_order,
  })
  if (saved.error) throw saved.error
}
for (const addon of catalog.data.addons) {
  const saved = await adminUser.rpc('admin_save_addon', {
    p_id: addon.id, p_key: addon.key, p_name: addon.name, p_description: addon.description, p_price_cents: 15000, p_duration_minutes: addon.duration_minutes,
    p_is_active: addon.is_active, p_price_is_draft: false, p_sort_order: addon.sort_order,
  })
  if (saved.error) throw saved.error
}
const opened = await adminUser.rpc('admin_update_platform_rules', { p_bookings_open: true, p_commission_bps: 1000, p_request_ttl_seconds: 300, p_search_window_minutes: 30, p_travel_buffer_minutes: 20 })
if (opened.error) throw opened.error
console.log('b2c-browser-seed: test accounts ready, prices final, bookings open (local stack only)')
