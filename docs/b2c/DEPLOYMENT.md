# Deploying B2C

Nothing here has been run against production. Each step is for a person to decide on and carry out. Back up the production database first.

## 1. Database

Review the six migrations named `2026_11_06_b2c*`. They only add things, and bookings stay closed afterwards, so customers see no change until step 5.

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
