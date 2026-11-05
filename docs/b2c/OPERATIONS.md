# Running the B2C marketplace

## Before opening bookings

Bookings start closed, with draft prices and 0% commission. The database refuses to open them while an active service has a draft price.

1. Run the B2C migrations on the production project. This is a person's decision: nothing in this repository applies them automatically.
2. Sign in as a super admin and open **Bookings and washers**.
3. Set the real price for every service and add-on, then set the commission.
4. Have at least one washer sign up, complete their profile, and verify them.
5. Choose **Open bookings**.

## How matching works

- When a customer books, the five nearest verified washers who offer the service, cover the location and are free at that time get a request. As requests run out, the search moves on to the next nearest.
- A request shows the service, vehicle type, time, rough distance and earnings. The address and customer details appear only after that washer accepts.
- The first washer to accept gets the booking. The database enforces this, so two washers can't both win.
- As-soon-as-possible bookings only reach washers who are online with a recent heartbeat. Scheduled bookings also reach offline washers, if the time is inside their hours.
- As-soon-as-possible requests last for the platform's request time (`request_ttl_seconds`). Scheduled requests last at least 60 minutes, unless the search window ends sooner.
- Within one search, a washer whose request expired isn't asked again. A washer who declined is never asked again for that booking.
- If nobody accepts before the search window ends, the booking becomes **No washer found**. The customer can search again or cancel. Searching again starts a new round, which can reach washers who only missed a request.
- A washer can't move their base location while they have an open request. This doesn't apply while bookings are closed, because open requests are hidden then.

### Rough distance

Requests store only a distance band: within 2, 5, 10, 20, 50 or 200 km. The exact distance isn't kept, for washers or in the admin view, and older requests were converted to bands. The apps show this as **Within N km**.

### When a job can start

A washer can start travelling to a scheduled booking from 2 hours before its time, and can mark arrival or later steps from 30 minutes before it. Neither can happen any earlier. As-soon-as-possible bookings can start straight away.

## Closing bookings

**Close bookings** in the admin console stops new work:

- Customers can't create a booking or search again.
- Washers get no new requests and can't accept one, and open requests are hidden from them. They reappear if bookings reopen before they expire.
- Searches still expire on time.

Work already accepted carries on. Washers can still move jobs forward, hand them back and report problems, and customers can still cancel.

## Cancelling bookings

| Status | Customer | Admin |
| --- | --- | --- |
| Before the washer arrives | Can cancel | Can cancel, with a reason |
| **Arrived** or **In progress** | Only once overdue: 60 minutes after the scheduled time plus the job's duration | Can cancel, with a reason |
| Completed, cancelled or expired | Can't cancel | Can't cancel |

An admin reason needs at least 10 characters. It's saved in the booking history, and the cancellation is recorded in the audit log.

An overdue cancel can happen after a real wash, if the washer never marked it complete. The app doesn't record cash, and a customer who cancels may not pay. Commission and earnings figures leave that job out, and reason text is cleared if the customer later deletes their account. This clock starts from the scheduled time rather than arrival, so a late job can be cancelled while still under way. See `LEGAL_REVIEW_REGISTER.md`, B2C6-L7.

## Suspending a washer

Suspending or rejecting a washer, or moving them back to pending, takes effect immediately:

- They go offline, can't move jobs forward and can't see customer details. Their app shows a paused notice if they're suspended or still hold a booking.
- Their open requests close. Their bookings that haven't started go back to search, with that washer left out. Verifying them again doesn't return those bookings.
- **Started jobs stay put** (**Arrived** or **In progress**). The customer stays blocked until an admin cancels or the job becomes overdue. To find these jobs, filter **Bookings** by status and look for the washer's name, because the list doesn't show verification status. Each one has a **Cancel booking** control.

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

## Account deletion

Customers and washers can delete their own account on the website and in the app, after re-entering their password. The server checks for a password sign-in from the last 5 minutes. It's refused while they have a current booking.

- **Removed:** sign-in, profile, saved addresses and vehicles, device tokens, notifications and washer profile.
- **Kept, without the person's name or contact details:** past bookings with price, status, dates and vehicle category, and review ratings. On a customer's own bookings, location, vehicle make, model and year, notes and review text are cleared. Deleting a washer doesn't change the customer's side: the customer's review text stays, and it may name the washer.
- **Kept with the internal account ID:** the append-only audit log keeps the person's internal ID beside booking IDs, and adds a record of the deletion. So these records are not anonymous.
- **Refused in the app:** admins, shop owners and washers with shop workforce records, whose contract and training records have retention rules, and anyone with a shop booking (`public.bookings`) in any status. These people are told "Only WashLink can close it", and the delete screen explains the shop records reason. No contact channel or procedure for this exists yet, so one is a launch requirement.

**Warning:** closing an account with shop bookings by hand leaves personal data behind unless someone deals with it. Deleting the user only empties the `customer_id` link. `customer_name`, `address`, location and notes stay on `public.bookings`. What to do with them **needs a legal decision**. There is no written procedure or named contact channel for manual closure yet, and a person must define both before launch.

Refusing these people in the app may also conflict with store rules and Philippine privacy rights. What to keep and for how long is a legal decision too. **Have this policy reviewed against Philippine privacy and tax rules before launch.**

Google Play also asks for a web link where people can request deletion. The website's Account tab can serve as that link once it's live.

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

`docker compose up` uses the Supabase project named in your `.env`, not the local stack. Until the B2C migrations are on that project, the site loads but services show as unavailable and booking fails. The dev server above also uses port 5173, so stop the Docker frontend first:

```bash
docker compose stop frontend
```
