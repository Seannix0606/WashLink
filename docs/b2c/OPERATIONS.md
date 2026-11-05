# Running the B2C marketplace

## Before opening bookings

Bookings start closed, with draft prices and 0% commission. The database refuses to open them while an active service has a draft price.

1. Run the B2C migrations on the production project. This is a person's decision: nothing in this repository applies them automatically.
2. Sign in as a super admin and open **Bookings and washers**.
3. Set the real price for every service and add-on, then set the commission.
4. Have at least one washer sign up, complete their profile, and verify them.
5. Choose **Open bookings**.

## How matching works

- When a customer books, every verified washer who offers the service, covers the location and is free at that time gets a request.
- A request shows the service, vehicle type, time, distance and earnings. The address and customer details appear only after that washer accepts.
- The first washer to accept gets the booking. The database enforces this, so two washers can't both win.
- As-soon-as-possible bookings only reach washers who are online with a recent heartbeat. Scheduled bookings also reach offline washers, if the time is inside their hours.
- If nobody accepts before the search window ends, the booking becomes **No washer found**. The customer can search again or cancel.

## Scheduled sweep (recommended)

Expired requests are closed whenever someone uses the app, so nothing depends on a scheduler. Without one, though, a quiet system won't move a stale search to **No washer found** until the next visit. To keep this timely, schedule this every minute with pg_cron or similar, as a database owner:

```sql
select public.service_dispatch_sweep_all();
```

This has not been scheduled anywhere yet.

## Payment

Cash only. WashLink records expected amounts and does not confirm that cash changed hands, so the admin figures are labelled **Expected**. No card details are stored, and no booking is ever marked as paid. Online payment needs a provider with server-verified confirmation.

## Maps and addresses

| Use | Web | Mobile |
| --- | --- | --- |
| Map | OpenStreetMap tiles | Apple Maps on iPhone, Google Maps on Android (needs a key) |
| Address lookup | Nominatim public service | Nominatim public service |
| Directions | Opens Google Maps by link | Opens the phone's maps app by link |

The public OpenStreetMap and Nominatim services have usage policies that limit production traffic: at most one lookup per second, and no heavy tile use. Before real traffic, move to a paid provider or your own server. Only `frontend/src/api/geocoding.api.ts`, the tile URL and the mobile equivalents need changing.

## Push notifications

The database stores device tokens through `register_device_push_token` and queues in-app notifications. Sending to Expo's push service needs a trusted server job, and needs real devices to verify, so push is **not verified**. See `docs/b2c/ARCHITECTURE.md`.

## Testing locally

From the repository root, with Docker running:

```bash
node scripts/supabase-test/run-db-tests.mjs
```

```bash
node scripts/supabase-test/run-api-smokes.mjs
```

To try the app by hand against the local stack only:

```bash
node scripts/supabase-test/b2c-browser-seed.mjs
```

```bash
node scripts/supabase-test/b2c-dev-server.mjs
```

The seed script's header lists its test accounts. They exist only on the local stack.
