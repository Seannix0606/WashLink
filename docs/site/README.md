# WashLink site documentation

How the live WashLink website works, looks and feels, documented with screenshots, as the baseline for the UI
redesign. Covers the website and installed web app at https://washlink-h7rc.onrender.com (not the Expo app).

> Baseline: 2026-11-10, `main` at `4012ce7`. Public screenshots are from the live site; signed-in screenshots are
> from the local stack with test data (see [Screenshots](#screenshots)).

## Contents
| Document | What it covers |
|---|---|
| [01 · Overview](01-overview.md) | Product, roles, how a page is chosen, feature flags, hosting, PWA |
| [02 · Branding](02-branding.md) | Name, logo, icons, color, type, voice and copy, what must not change |
| [03 · SEO and metadata](03-seo-and-meta.md) | Every head tag, the manifest, headers, offline page, and the SEO gaps |
| [04 · Design system](04-design-system.md) | Tokens, primitives, hardcoded colors, today's status colors, layout |
| [05 · Flows](05-flows.md) | Booking status machine, customer, washer and admin flows, sign-up |
| [06 · UX audit](06-ux-audit.md) | Where categories blur today and what the redesign must fix |
| [07 · Tests that pin the UI](07-tests-that-pin-ui.md) | Tests a redesign must keep green |
| Screens | [Landing](screens/landing.md) · [Sign in and create account](screens/auth.md) · [Customer](screens/customer.md) · [Booking wizard](screens/booking-wizard.md) · [Washer](screens/washer.md) · [Admin](screens/admin.md) · [Other screens](screens/other.md) |

## Screenshots
All in `screenshots/`, named `<screen>-<phone|desktop>.png` (phone 390×844, desktop 1280×800, full page, light
system theme, Asia/Manila time).

- **Public screens** (landing, sign in, create account, forgot password, offline page) are taken from the live site.
- **Signed-in screens** are taken from the **local** Supabase stack with test accounts and sample bookings in every
  status. They never use production accounts or real customer data. The local build is served by Playwright from
  `scripts/site-docs/.dist`, so no dev server is needed.

Tooling, in `scripts/site-docs/`:
```bash
cd scripts/site-docs && npm install && npx playwright install chromium   # once
node scripts/site-docs/local-setup.mjs                                    # local stack must be running
node scripts/site-docs/capture.mjs                                        # all screens
node scripts/site-docs/capture.mjs --only=washer-work,customer-bookings --skip-build
```
`local-setup.mjs` reads the local JWT secret from the running `supabase_auth_washlink-local-test` container, so it
works without the Supabase CLI. Its accounts (`docs-customer@local.test`, `docs-washer@local.test`,
`docs-admin@local.test`) and password only exist on the local stack. Afterwards, reset the local database
with `node scripts/supabase-test/run-db-tests.mjs`.

## Keeping these docs current (instructions for agents)
Do this in the same change as any edit to the web UI, its copy, tokens, flows or `<head>`:

1. **Find the affected pages.** Map the changed files to `screens/*.md` using the "Files" list in each screen doc.
2. **Re-capture** those screens: `node scripts/site-docs/local-setup.mjs`, then
   `node scripts/site-docs/capture.mjs --only=<screen names>`. Screen names are the screenshot file names without
   `-phone`/`-desktop`. Add a new entry to the `screens` list in `capture.mjs` for a new screen.
3. **Update the text.** Edit the screen doc: sections, states, actions, and copy **quoted exactly as shipped**. Update
   the numbered doc too when tokens or primitives (04), flows or statuses (05), branding or copy rules (02), head tags
   or manifest (03), or pinned tests (07) change. Strike through or remove anything no longer true; don't leave stale
   text.
4. **Stamp it.** Change the `> Documented …` line at the top of each edited file to the date and the commit it
   describes, and update the baseline line in this README.
5. **Never** capture signed-in screens from the live site, put real customer data or production credentials in a
   screenshot or script, or copy another site's branding, copy or SEO text into these docs.
6. **Review the images** you captured (open them) before committing; a failed sign-in or an error toast in a
   screenshot is a bug in the capture, not the site.
