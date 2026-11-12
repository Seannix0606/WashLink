# Pre-launch security report (2026-11-13)

Scope: the web app (`frontend/`), the shared package, the Supabase database (local copy and, read-only, the live project
`wkkqlugwuvenzapitkdt`), the live site `https://washlink-h7rc.onrender.com`, the mobile app's packages and the whole Git
history. Code fixes are on branch `security/pre-launch-hardening` (commit `[SEC-1]`).

## Summary

| You asked for | Result |
| --- | --- |
| A real login, every password hashed | **Already in place.** Supabase Auth handles sign-in and stores passwords as bcrypt hashes; the app never sees or stores a password. Email confirmation is on live. **Your action:** raise the live minimum password length from 6 to 8 (the app already asks for 8) and turn on "Secure password change". |
| API keys on the server, never in the browser | **Already in place, verified.** The live JavaScript holds only the publishable Supabase key, which is public by design. No secret or service-role key appears in the live bundle or the source. The Render deploy hook is a GitHub secret. |
| Database locked so people see only their own data | **In place, tightened.** Row level security is on for every public table (live and local). Signed-out visitors can read only the active service list, prices and add-ons. SEC-1 also removes leftover write grants for signed-out visitors on six early tables (row level security already refused those writes). |
| HTTPS everywhere | **Already in place, verified.** `http://` redirects to `https://` (301), and HSTS is sent with a 10-year max-age. |
| Every form checked on the server | **Already in place.** Bookings, messages, uploads, reviews and admin actions go through database functions that validate every field. Sign-up roles are sanitized by a database trigger. Earlier work added write-limit tests (B2C-6). |
| Block XSS | **Fixed.** React escapes all output, and the code has no `dangerouslySetInnerHTML`, `eval` or `innerHTML`. **Gap found:** the live site sends no Content-Security-Policy, because Render isn't applying `render.yaml`. SEC-1 builds the policy into the page itself, and Zod is set so it never needs `eval`. A production build was tested signed out and signed in (booking wizard and map), with zero policy violations. |
| Safe queries, no SQL injection | **Already in place.** The app talks to the database only through the Supabase client, which sends values as parameters. No query is built from user text. The only dynamic SQL is in migrations, where it quotes identifiers with `%I`. |
| Rate-limit the login | **Already in place, verified live.** 30 sign-ins or sign-ups per 5 minutes per IP address; 30 verification codes per 5 minutes; emails limited per hour and 60 seconds apart per user. |
| CSRF protection | **Not needed.** The app sends the session as a bearer token in a request header, not as a cookie, so a forged request from another site can't carry it. |
| Secure session cookies | **Not applicable.** Sessions live in browser storage, not cookies. The protection against theft is the XSS defence above (Content-Security-Policy plus React escaping). Tokens last 1 hour and refresh with rotation. |
| Password reset links expire | **Already in place, verified live.** Reset and confirmation links expire after 1 hour (3600 seconds). |
| Limit file uploads | **Fixed.** The shop verification bucket had no size or file-type limit. SEC-1 limits it to PDF, PNG, JPEG or WebP, up to 8 MB. The washer documents bucket (JPEG/PNG, 10 MB) and chat photos bucket (JPEG/PNG/WebP, 5 MB) already had limits. All buckets are private. |
| Lock the admin pages | **Already in place, verified live.** All 34 `admin_*` database functions check for an admin. The admin screens only display data those functions return. |
| Recheck every price on the server | **Already in place.** `create_service_booking` takes no price at all: the server prices the booking from the catalog, and a database trigger blocks any later change to price or service details. |
| Turn off debug mode | **Already off.** The live site is a production build with no source maps, and the app logs nothing to the console. The only debug flag is `APP_DEBUG=true` in the example settings of the old `backend/` folder, which is not deployed. |
| Update risky packages, remove unused ones | **Fixed.** Removed `nodemailer` (a shipped package with a high advisory, used only by two stray test scripts, also removed) and five unused build packages. Updated vite, zod, ws and others. **Shipped web packages: 0 known vulnerabilities.** 7 moderate advisories remain in lint tools that never ship. The mobile app's 4 moderate advisories are in Expo's build tools, not in the app on the phone; updating them needs an Expo upgrade. |
| Scan Git history for leaked keys, replace any found | **Clean, so nothing to replace.** All commits on every branch were searched for Supabase keys (JWT and `sb_secret`/`sb_publishable`), Stripe, AWS, Google, GitHub and Slack tokens, private keys, database URLs with passwords, SMTP passwords and long secret assignments. Only placeholders and test values were found. |

## What you need to do

1. **Apply the SEC-1 migration to the live database.** In the Supabase SQL Editor, run
   `supabase/migrations/2026_11_15_sec_prelaunch_hardening.sql`.
2. **Supabase → Authentication → Sign In / Providers → Email:**
   - Minimum password length: **8** (it's 6 now; the app already asks for 8).
   - **Secure password change: on.** A password change then needs a recent sign-in, so a stolen session can't lock the owner out.
   - **Prevent use of leaked passwords: on**, if your plan offers it.
3. **Render → washlink → Settings → Headers.** Add these, because the live site isn't using `render.yaml`:
   - `/*` `X-Frame-Options: DENY` (stops other sites from embedding WashLink to trick clicks)
   - `/*` `Referrer-Policy: strict-origin-when-cross-origin`
   - `/*` `Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()`
   - `/*` `Content-Security-Policy:` the value from `render.yaml`, which also adds `frame-ancestors 'none'`.

   Alternatively, connect the service to `render.yaml` as a Blueprint.
4. **Merge** branch `security/pre-launch-hardening` to `main`, so Render deploys it.
5. **Decide on `backend/`.** It's an old server that isn't deployed. Deleting it removes code that nobody checks.

## Tests run

- New database test `j19_sec1_prelaunch_hardening`: fails 5 of 9 checks before the migration, passes 9/9 after. It
  checks that no bucket is public, every bucket has size and type limits, signed-out visitors have no write grants and
  are refused, row level security is on for every table, and every definer function pins its search path.
- All 134 database test files on the local stack: 129 pass. The 5 failures exist without this change:
  - three fail because of documentation data in the local database (bookings open, renamed add-ons, an extra operator);
  - `j18` expects exactly 114 migrations, a count that was already out of date on `main`;
  - `j19_b2c6_dispatch_rounds_and_distance` fails at this time of night with or without SEC-1, so it looks
    time-of-day dependent. It needs its own fix.
- Web app: type check, lint, all 582 unit tests and a production build pass. The production build was also run in a
  headless browser to check the Content-Security-Policy.
- Live checks (read-only): HTTP headers of the live site, the live JavaScript bundle, live database security queries,
  and the live Auth rate-limit and password settings.
