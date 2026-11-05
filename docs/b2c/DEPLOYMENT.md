# Deploying B2C

Nothing here has been run against production. Each step is for a person to decide on and carry out. Back up the production database first.

## 1. Database

Review the eleven migrations named `2026_11_06_b2c*`. Bookings stay closed afterwards, so customers see no change until step 5.

The first six (`b2ca` to `b2cf`) only add things. The last five (`b2cg` to `b2ck`) also replace B2C functions and change existing rows, and those row changes can't be undone: request distances become bands, skills and vehicle years outside the new limits are trimmed or cleared, malformed push tokens are deleted, and distance and vehicle year are cleared on bookings of already-deleted customers. They don't change `public.bookings` or any workforce table.

Before applying `b2ck`, confirm that the production Auth version issues the `amr` claim as an array of `method` and `timestamp`, as the local version does. With any other shape, every self-deletion is refused.

In the production Auth settings, turn on secure password change (`secure_password_change`, off in the local `supabase/config.toml`). Without it, a stolen session could set a new password, sign in with it and pass the deletion check. The setting may not fully close this, because it may only apply to older sessions. None of this was run locally, so test it.

The repository's safe local test scripts never touch a linked project. Applying to production is a deliberate, separate action with your own Supabase access.

The migration filenames use dates ahead of the current one (November 6, 2026), and the local replay test pins them. If your production history has migrations with later timestamps, check the ordering before applying.

## 2. Web

Set these on the web host, then build from the repository root. `render.yaml` and `frontend/Dockerfile` use the root as their build context so that the shared package is included. Neither has been tested on a real deploy.

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Production URL |
| `VITE_SUPABASE_ANON_KEY` | Production anon key |
| `VITE_FEATURE_B2B` | `false` |
| `VITE_FEATURE_B2C` | `true` |

## 3. Scheduled sweep (recommended)

See `OPERATIONS.md`.

## 4. Push (optional at launch)

The `send-service-push` function has never been deployed or run. Its secret comparison (`secretsMatch.ts`) has only been unit-tested under Node, not on Deno.

1. Deploy the function:

   ```bash
   supabase functions deploy send-service-push --no-verify-jwt
   ```

   JWT checks are off because the webhook authenticates with its own secret.

2. Set a long random `PUSH_WEBHOOK_SECRET` with `supabase secrets set`.
3. In the Supabase dashboard, add a database webhook on `public.notifications` for inserts. Point it at the function and send the secret in an `x-webhook-secret` header.
4. Test on a real Android phone and a real iPhone before relying on it.

Without push, the apps still update while open.

## 5. Open for business

In the admin console, set real prices and the commission, verify at least one washer, then open bookings. See `OPERATIONS.md`.

## 6. Mobile

See `mobile/README.md`. Also needed:

- Apple Developer and Google Play accounts
- A Google Maps Android key
- Logo files, a privacy policy and store listings

## Rolling back

Close bookings in the admin console. To remove B2C from the website, follow `B2B_REACTIVATION.md`. The tables can stay, since nothing reads them when B2C is off.
