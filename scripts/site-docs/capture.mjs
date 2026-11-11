#!/usr/bin/env node
// Screenshots for docs/site. Public screens come from the live site; signed-in screens come from the LOCAL stack only,
// prepared by local-setup.mjs. The local build is served straight from disk through Playwright, so no dev server runs.
//
//   node scripts/site-docs/local-setup.mjs          (once, after the local stack is up)
//   node scripts/site-docs/capture.mjs              (all screens)
//   node scripts/site-docs/capture.mjs --only=customer-home,washer-work --skip-build
//   node scripts/site-docs/capture.mjs --public=local  (public screens from the local build, before a deploy)
//   node scripts/site-docs/capture.mjs --theme=dark      (the device prefers dark, so Auto shows the dark theme)
//
// Output: docs/site/screenshots/<screen>-<phone|desktop>.png, or <screen>-<phone|desktop>-dark.png with --theme=dark

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import { ACCOUNTS, API_URL, LOCAL_PASSWORD, localKeys } from './local-setup.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const distDir = path.join(here, '.dist')
const outDir = path.join(repoRoot, 'docs', 'site', 'screenshots')
const LIVE = 'https://washlink-h7rc.onrender.com'
// A loopback origin, so Chrome lets the page call the local Supabase API on 127.0.0.1. Nothing listens on this port:
// Playwright answers every request from the local build on disk.
const LOCAL = 'http://127.0.0.1:5199'
const viewports = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } }

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')).map(([key, value]) => [key, value ?? true]))
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null
const theme = args.theme === 'dark' ? 'dark' : 'light'
// --public=local takes the public screens from the local build too, to document a branch before it is deployed.
const isPublicLocal = args.public === 'local'
const originOf = (screen) => (screen.origin === 'live' && !isPublicLocal ? 'live' : 'local')

function buildLocal() {
  const { anonKey } = localKeys()
  const result = spawnSync('npx vite build --outDir ../scripts/site-docs/.dist --emptyOutDir', {
    cwd: path.join(repoRoot, 'frontend'), shell: true, encoding: 'utf8',
    env: { ...process.env, VITE_SUPABASE_URL: API_URL, VITE_SUPABASE_ANON_KEY: anonKey, VITE_FEATURE_B2B: 'false', VITE_FEATURE_B2C: 'true', VITE_FEATURE_WASHER_SIGNUP: 'false' },
  })
  if (result.status !== 0) throw new Error(`local build failed:\n${result.stdout}\n${result.stderr}`)
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }
async function serveLocal(context) {
  await context.route(`${LOCAL}/**`, async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname)
    let file = path.join(distDir, pathname)
    if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html')
    await route.fulfill({ status: 200, contentType: types[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) })
  })
  // Chrome's local network protection blocks the page from calling 127.0.0.1:54321 itself, so Playwright makes the
  // Supabase calls on the page's behalf and hands back the answers, CORS headers included.
  await context.route(`${API_URL}/**`, async (route) => {
    const cors = { 'access-control-allow-origin': LOCAL, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors })
      return
    }
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), ...cors } })
  })
}

const settle = async (page, ms = 1200) => {
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(ms)
}

async function signIn(page, account) {
  await page.goto(LOCAL)
  await settle(page)
  await page.getByRole('button', { name: 'Sign in' }).first().click()
  await page.getByLabel('Email address').fill(account.email)
  await page.getByLabel(/^Password/).fill(LOCAL_PASSWORD)
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: /Sign in/ }).first().waitFor({ state: 'detached', timeout: 20000 }).catch(() => undefined)
  await settle(page, 2000)
}

const tab = async (page, name) => {
  await page.getByRole('tab', { name }).first().click()
  await settle(page)
}

// Each screen: where it runs, who signs in, and the steps to reach it.
const screens = [
  { name: 'landing', origin: 'live', steps: async () => undefined },
  { name: 'auth-sign-in', origin: 'live', steps: async (page) => { await page.getByRole('button', { name: 'Sign in' }).first().click() } },
  { name: 'auth-create-account', origin: 'live', steps: async (page) => {
    await page.getByRole('button', { name: 'Sign in' }).first().click()
    await page.getByRole('tab', { name: 'Create account' }).click()
  } },
  { name: 'auth-forgot-password', origin: 'live', fullPage: false, steps: async (page) => {
    await page.getByRole('button', { name: 'Sign in' }).first().click()
    await page.getByRole('button', { name: /Forgot password/ }).click()
  } },
  { name: 'offline-page', origin: 'live', path: '/offline.html', steps: async () => undefined },
  { name: 'customer-home', origin: 'local', role: 'customer', steps: async () => undefined },
  { name: 'customer-bookings', origin: 'local', role: 'customer', steps: async (page) => { await tab(page, 'Bookings') } },
  { name: 'customer-bookings-calendar', origin: 'local', role: 'customer', steps: async (page) => {
    await tab(page, 'Bookings')
    await page.getByRole('radio', { name: 'Calendar' }).click()
    await page.getByRole('button', { name: /, 1 booking$|, [2-9] bookings$/ }).first().click()
    await settle(page)
  } },
  { name: 'customer-saved-details', origin: 'local', role: 'customer', steps: async (page) => { await tab(page, 'Addresses and vehicles') } },
  { name: 'customer-account', origin: 'local', role: 'customer', steps: async (page) => { await tab(page, 'Account') } },
  { name: 'wizard-1-when', origin: 'local', role: 'customer', steps: async (page) => {
    await page.getByRole('button', { name: 'Book a car wash' }).first().click()
    await settle(page)
  } },
  { name: 'wizard-2-where', origin: 'local', role: 'customer', steps: async (page) => {
    await page.getByRole('button', { name: 'Book a car wash' }).first().click()
    await settle(page)
    await wizardWhen(page)
  } },
  { name: 'wizard-3-service', origin: 'local', role: 'customer', steps: async (page) => {
    await page.getByRole('button', { name: 'Book a car wash' }).first().click()
    await settle(page)
    await wizardWhen(page)
    await wizardWhere(page)
  } },
  { name: 'wizard-4-vehicle', origin: 'local', role: 'customer', steps: async (page) => {
    await page.getByRole('button', { name: 'Book a car wash' }).first().click()
    await settle(page)
    await wizardWhen(page)
    await wizardWhere(page)
    await wizardService(page)
  } },
  { name: 'wizard-5-review', origin: 'local', role: 'customer', steps: async (page) => {
    await page.getByRole('button', { name: 'Book a car wash' }).first().click()
    await settle(page)
    await wizardWhen(page)
    await wizardWhere(page)
    await wizardService(page)
    await wizardVehicle(page)
  } },
  { name: 'washer-work', origin: 'local', role: 'washer', steps: async () => undefined },
  { name: 'washer-work-calendar', origin: 'local', role: 'washer', steps: async (page) => {
    await page.getByRole('radio', { name: 'Calendar' }).click()
    await page.getByRole('button', { name: /, 1 booking$|, [2-9] bookings$/ }).first().click()
    await settle(page)
  } },
  { name: 'washer-history', origin: 'local', role: 'washer', steps: async (page) => { await tab(page, 'History and earnings') } },
  { name: 'washer-profile', origin: 'local', role: 'washer', steps: async (page) => { await tab(page, 'Profile and hours') } },
  { name: 'admin-bookings-and-washers', origin: 'local', role: 'admin', steps: async () => undefined },
  { name: 'admin-booking-case', origin: 'local', role: 'admin', steps: async (page) => {
    await page.getByRole('button', { name: /View|Open|Details|history/i }).first().click()
    await settle(page)
  } },
  { name: 'admin-audit-log', origin: 'local', role: 'admin', steps: async (page) => { await tab(page, 'Audit log') } },
]

async function wizardWhen(page) {
  // The first open day is chosen for the customer; its free times sit in the fieldset under the calendar.
  await page.locator('section[aria-labelledby="when-title"] button[aria-label*=" open time"]').first().waitFor({ timeout: 15000 })
  const openSlots = page.locator('section[aria-labelledby="when-title"] fieldset button:not([disabled])')
  await openSlots.first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await settle(page)
}
async function wizardWhere(page) {
  await page.getByRole('button', { name: 'Office' }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await settle(page)
}
async function wizardService(page) {
  await page.getByRole('button', { name: /^Full Wash/ }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await settle(page)
}
async function wizardVehicle(page) {
  await page.getByRole('button', { name: /Toyota Vios/ }).first().click().catch(() => undefined)
  await page.getByRole('button', { name: 'Continue' }).click()
  await settle(page, 2000)
}

const wanted = screens.filter((screen) => !only || only.has(screen.name))
if (wanted.some((screen) => originOf(screen) === 'local') && !args['skip-build']) buildLocal()
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const failures = []
for (const screen of wanted) {
  for (const [viewportName, viewport] of Object.entries(viewports)) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block', colorScheme: theme, locale: 'en-PH', timezoneId: 'Asia/Manila' })
    // The app starts in Light whatever the device prefers, so the dark captures choose Dark the way a person would.
    if (theme === 'dark') await context.addInitScript(() => { try { window.localStorage.setItem('washlink.theme', 'dark') } catch { /* storage blocked */ } })
    if (originOf(screen) === 'local') await serveLocal(context)
    const page = await context.newPage()
    try {
      if (screen.role) {
        await signIn(page, ACCOUNTS[screen.role])
      } else {
        await page.goto(`${originOf(screen) === 'live' ? LIVE : LOCAL}${screen.path ?? '/'}`)
        await settle(page, 2500)
      }
      await screen.steps(page)
      await settle(page)
      // Sign-in and save toasts would cover the top bar; they are momentary, not part of the screen.
      // Full-page shots stitch the page together, so a sticky top bar would also appear wherever the page was scrolled to.
      await page.addStyleTag({ content: '[data-sonner-toaster] { display: none !important; } .sticky { position: static !important; }' })
      const file = path.join(outDir, `${screen.name}-${viewportName}${theme === 'dark' ? '-dark' : ''}.png`)
      await page.screenshot({ path: file, fullPage: screen.fullPage !== false })
      console.log(`ok   ${screen.name}-${viewportName}${theme === 'dark' ? '-dark' : ''}`)
    } catch (error) {
      failures.push(`${screen.name}-${viewportName}: ${error.message.split('\n')[0]}`)
      console.log(`FAIL ${screen.name}-${viewportName}: ${error.message.split('\n')[0]}`)
    }
    await context.close()
  }
}
await browser.close()
if (failures.length > 0) process.exitCode = 1
