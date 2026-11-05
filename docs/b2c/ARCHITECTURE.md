# B2C architecture

```
React web (frontend/)        Expo app (mobile/)
customer, washer, admin      customer, washer
        \                      /
      @washlink/shared (packages/shared)
      API client, status rules, draft rules, validation, brand tokens
                   |
       Supabase: Auth, Postgres + row rules, RPCs, Realtime
                   |
   Maps and address lookup, Expo push (not verified), future payments
```

## Rules that hold across platforms

- **The database decides.** Prices, worker eligibility, status changes and who sees what are enforced in Postgres. Hiding something in a screen is never the protection.
- **Prices are calculated on the server.** Clients send a service, vehicle type and add-ons, never an amount. The total is recalculated when the booking is created.
- **Repeat submissions are safe.** Each booking attempt has a `submission_key`, so retrying returns the same booking.
- **Only one washer can accept.** Acceptance takes a lock on the booking and a unique index backs it up. The API smoke races two washers.
- **Addresses stay private.** Requests hold no location. A washer sees the address and customer only after accepting.
- **Status moves are checked.** A trigger allows only valid transitions, and each worker action sends the status it was looking at, so a stale screen is refused.
- **Dispatch doesn't depend on a scheduler.** Expired requests are swept whenever the app is used. An optional scheduled sweep keeps quiet periods timely.
- **Self-deletion needs a recent password.** See below.

## Search rounds

A booking's search runs in rounds, so a washer isn't sampled repeatedly and a customer can still reach one who only missed a request.

- Within a round, a washer with an `offered`, `expired` or `declined` request on that booking isn't offered it again, and the search moves outward.
- A customer retry, a washer handing back, and a washer losing verification each start a new round. `service_booking_reset_search` sets a new deadline and turns `expired` requests into `superseded`, which makes those washers eligible again. Retry needs **No washer found**, so there is at most one per search window.
- `declined` stays for good. A washer who hands a booking back, or is removed from it by a status change, has their requests marked `declined`, so they aren't offered that booking again.
- The new deadline is `now + search_window_minutes` for an immediate booking, which also has its `scheduled_at` reset to now. For a scheduled booking it's `least(scheduled_at, now + scheduled_search_window_hours)`.
- `dispatch_requests.distance_km` stores only the band's upper bound (2, 5, 10, 20, 50 or 200), so neither the table, Realtime nor an RPC reveals a precise distance. Service radius stays editable, so a washer changing it repeatedly could still narrow down a location. That gap is known and open.

## Recent-password rule

`delete_my_account` needs a password sign-in from the last 300 seconds, read from the JWT `amr` claim by the internal `auth_recent_password_sign_in`. It uses `amr` and not `iat`, because a token refresh keeps the original sign-in time. A recovery session has method `otp`, so it's refused. A future timestamp is allowed only within 60 seconds of skew.

Neither client has a separate step for this. Each signs in with the password on the same client that makes the RPC, so the call carries the fresh token.

This has been checked only on the local GoTrue version. A different `amr` shape in production refuses every self-deletion, so it fails closed. `docs/b2c/DEPLOYMENT.md` says to confirm the shape before applying.

## B2B separation

B2C has its own tables (`service_bookings`, `dispatch_requests`, `services` and others). The B2B `bookings` table and its guards are untouched, and all earlier database tests still run. The B2B feature flag only changes what screens offer. See `B2B_REACTIVATION.md`.

## Secrets and sessions

- Web and mobile hold only the public anon key. The service role key is used only in `supabase/functions/send-service-push`, on the server.
- Mobile keeps its session in the device keychain or keystore (`mobile/src/lib/secureSessionStorage.ts`). The browser preview uses session storage and isn't shipped to phones.

## Live updates

Realtime pushes changes on `service_bookings` and `dispatch_requests`, limited by row rules and a per-user filter. Screens also poll every 20 to 30 seconds and refresh on focus, so a dropped connection recovers without help.

## Push

1. A status change adds a row to `notifications`, as in-app notifications always have.
2. A database webhook, set up by a person, calls `send-service-push`.
3. The function looks up the recipient's tokens and sends through Expo.
4. Tapping a notification opens a screen, but only one on the app's allowed list.

Steps 2 to 4 have never run end to end.

## FastAPI backend

`backend/` isn't needed for the B2C flow and was not changed. Everything here runs on Supabase. Future payment webhooks need a trusted server: either an Edge Function or that backend would suit. Only a server may mark a booking paid, and only after the provider verifies it.
