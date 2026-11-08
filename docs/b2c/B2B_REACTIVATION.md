# Bringing shop (B2B) features back

The shop owner, shop booking, training, certification and contract features were hidden for the B2C release, not removed. Their tables, functions, screens and tests are all still in place and still run.

## What is hidden

With `VITE_FEATURE_B2B` unset or `false`:

- The sign-up form does not offer the shop owner role.
- An existing shop owner who signs in sees a paused notice (`OwnerAccountPausedScreen`). Their data is untouched.
- The super admin console shows only **Bookings and washers** and **Audit log**.
- Signed-in workers and customers get the B2C screens.

This hiding is only a matter of what the screens show. Database rules for shop features still apply, and the B2C functions do not touch the `bookings` table.

## To turn it back on

1. Set `VITE_FEATURE_B2B=true` in the web host's build settings.
2. Rebuild and deploy the web app. The flag is read at build time, so changing it alone does nothing.
3. Check as a test shop owner: sign in, open the shop dashboard, and take a shop booking.

No migration is needed. To run both models side by side, keep `VITE_FEATURE_B2C` on (the default). Workers then see the B2C worker screens; the older worker screens only appear with `VITE_FEATURE_B2C=false`. Decide which worker experience you want before turning both on, because they have not been designed to run together.

## To turn B2C off

Set `VITE_FEATURE_B2C=false` and `VITE_FEATURE_B2B=true`, then rebuild. The B2C tables stay in the database but nothing reads them. The migrations are additive, so nothing else needs undoing.

## Open items from the parked workforce work

- Branch `feature/workforce` holds W17 at `48f7fb0`, labelled unverified. W18 has not started.
- Two findings stay open for when B2B returns. Both are in the worker profile editor, which B2C worker screens do not show:
  - **B-1:** the copy sends certified workers to an account deletion path that does not exist.
  - **B-2:** Delete profile removes training evidence and contract access, which is more than its copy says.
