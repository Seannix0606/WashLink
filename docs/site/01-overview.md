# 01 · Overview: what WashLink is and how the site works

> Documented 2026-11-10 from `feature/ui-redesign` (UI redesign stages 1–4, not yet deployed) and the live site
> https://washlink-h7rc.onrender.com. Pre-redesign baseline: `1687f86`.

## The product
WashLink is an on-demand car wash service in Metro Manila. Customers book a wash at their home, office, condo or
parking spot, choose a time and pay the washer in cash when the job is done. **WashLink currently runs the washes
itself**: one or more *operator washer* accounts accept and carry out every booking, and washer sign-up is closed.

| Who | What they do | Screen |
|---|---|---|
| Visitor | Reads the landing page, signs up or signs in | [Landing](screens/landing.md), [Sign in and create account](screens/auth.md) |
| Customer | Books washes, follows them, cancels, rates, saves places and cars, deletes their account | [Customer home](screens/customer.md), [Booking wizard](screens/booking-wizard.md) |
| Operator washer | Accepts or declines requests, runs each job step by step, cancels with a reason, sees earnings and reviews, sets service area and hours | [Washer](screens/washer.md) |
| Admin (`super_admin`) | Sets prices, adds and hides services and add-ons, opens or closes bookings, reviews washers, follows and cancels bookings, reads the audit log | [Admin](screens/admin.md) |
| Shop owner (B2B, paused) | Sees a "paused" screen. The shop and workforce product is switched off | [Other screens](screens/other.md) |

## How a page is chosen (there are no URLs)
The app has no router. Every screen is on `/`, and `frontend/src/App.tsx` picks the page from the sign-in state and
role, in this order:

1. Supabase settings missing at build time → "WashLink needs Supabase settings".
2. Sign-in still loading → spinner.
3. Password recovery link opened → `ResetPasswordPage`.
4. Signed out → `PublicEntryPage` (landing ↔ sign-in) when B2C is on.
5. `super_admin` → `SuperAdminDashboardPage`.
6. `owner` with B2B off → `OwnerAccountPausedScreen`.
7. `worker` → `IndependentWorkerPage`.
8. Everyone else → `CustomerHomePage`.

Tabs inside pages are local state, so a reload returns to the first tab. Deep links don't exist.

## Feature flags
Defined in `packages/shared/src/featureFlags.ts`, read from build-time `VITE_FEATURE_*` variables.

| Flag | Live value | Effect |
|---|---|---|
| `VITE_FEATURE_B2B` | off (default) | Shop owner sign-up and workforce screens hidden; owners see the paused screen |
| `VITE_FEATURE_B2C` | on (default) | Customer, washer and admin B2C screens |
| `VITE_FEATURE_WASHER_SIGNUP` | off (default) | No washer option in sign-up or on the landing page. The database also turns a washer sign-up into a customer (`platform_settings.washer_signup_open`) |

## Hosting and data
- **Web:** Render free static site `washlink` (service `srv-d86tfb3eo5us73cbv4s0`), building `main` with
  `cd frontend && npm ci && npm run build`, publishing `frontend/dist`. Every push to `main` redeploys.
  Settings: `render.yaml` and [`docs/b2c/RENDER.md`](../b2c/RENDER.md).
- **Backend:** Supabase project `wkkqlugwuvenzapitkdt` (database, auth, storage). The browser talks to it directly
  with the publishable key; the database functions and row rules decide everything.
- **Installable app (PWA):** `manifest.webmanifest`, icons and a service worker (`sw.js`) that caches only
  `offline.html`. Chrome on Android shows an **Install the app** button on the landing page; iPhone users use
  Share → Add to Home Screen.
- **Separate Expo mobile app** (`mobile/`): not deployed and out of scope for this documentation.

## Look
Light and dark themes (Light / Dark / Auto, remembered per device), one color per booking-status group, outlined
sections, and a month calendar for customers and the washer. See [04 · Design system](04-design-system.md).

## Language and region
English (en-PH tone), Philippine pesos (`₱`, whole pesos shown), times in Asia/Manila (`formatManilaDateTime`),
cash payment at the end of the wash.
