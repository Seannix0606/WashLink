# Deploying B2C

Nothing here has been run against production. Each step is for a person to decide on and carry out. Back up the production database first.

## 1. Database

Review the fourteen migrations named `2026_11_06_b2c*`. Bookings stay closed afterwards, so customers see no change until step 5.

The first six (`b2ca` to `b2cf`) only add things. The next five (`b2cg` to `b2ck`) also replace B2C functions and change existing rows, and those row changes can't be undone: request distances become bands, skills and vehicle years outside the new limits are trimmed or cleared, malformed push tokens are deleted, and distance and vehicle year are cleared on bookings of already-deleted customers. The last three (`b2cl` to `b2cn`) add washer verification documents, and `b2cn` moves any washer who is verified without approved documents to pending and returns their unstarted jobs to search, which also can't be undone. None of them change `public.bookings` or any workforce table.

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

In the admin console, set real prices and the commission, review a washer's documents and verify them, then open bookings. See `OPERATIONS.md`. **Before any real washer uploads, complete section 7 and the gate in `OPERATIONS.md` (Before collecting real IDs).**

## 6. Mobile

See `mobile/README.md`. Also needed:

- Apple Developer and Google Play accounts
- A Google Maps Android key
- Logo files, a privacy policy and store listings
- A new native build. `expo-image-picker` and its permission strings can't ship over the air

## 7. Washer document removal job

**This has never been run.** The function `purge-worker-documents` has not been deployed or scheduled anywhere. Only its logic (`purgeWorkerDocumentFiles.ts`) has run, under Vitest and in the local `b2c7-api-smoke` against real Storage. The Deno wrapper (`index.ts`), deployment and scheduling can't be tested here, because the staged local stack has no edge functions. Treat every step below as untried.

Until this is scheduled, queued files stay in storage, including those of people who deleted their account. Real IDs must not be collected before then. Uploads stay off in the database until a person turns them on after this step: see **Runbook gate** in `OPERATIONS.md`. While they are off no washer can be verified, so don't open bookings first.

1. Deploy the function:

   ```bash
   supabase functions deploy purge-worker-documents --no-verify-jwt
   ```

   JWT checks are off because the job authenticates with its own secret. The function shares `secretsMatch.ts` with `send-service-push`, which has only been unit-tested under Node.

2. Set a long random `PURGE_WORKER_DOCUMENTS_SECRET` with `supabase secrets set`.
3. Upload a synthetic image with a test washer, delete that washer, and call the function with the secret in an `x-job-secret` header. Confirm that **Files waiting for removal** in the admin console goes down, and that the file is gone from the bucket. A run removes at most 200 files. The response reports what the database confirmed.
4. Schedule that same call, with pg_cron and pg_net or any trusted scheduler. Keep the secret out of source control. How often it runs hasn't been decided, and it affects how long a deleted person's file remains. See B2C7-L4.
5. Watch **Files waiting for removal** and its oldest date. A count that keeps growing means the job has stopped.

The migrations were proven on local Storage v1.88.0 only. Before real uploads, re-run the attack checks on a staging project: the `postgres` role's access to `storage.objects`, the `version` column, the delete protection, how Storage treats oversize and wrong-type requests, and the storage operation names `storage.object.upload` and `storage.object.get_authenticated`, which the two policies name exactly. The upload and approval checks fail closed if these differ, so a renamed operation stops uploads or admin reads rather than opening them.

## Rolling back

Close bookings in the admin console. To remove B2C from the website, follow `B2B_REACTIVATION.md`. The tables can stay, since nothing reads them when B2C is off.
