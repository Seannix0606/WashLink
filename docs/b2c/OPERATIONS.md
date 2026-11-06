# Running the B2C marketplace

## Before opening bookings

Bookings start closed, with draft prices and 0% commission. The database refuses to open them while an active service has a draft price.

1. Run the B2C migrations on the production project. This is a person's decision: nothing in this repository applies them automatically.
2. Sign in as a super admin and open **Bookings and washers**.
3. Set the real price for every service and add-on, then set the commission.
4. Have at least one washer sign up, complete their profile and upload their documents. Review the documents, then verify the washer. See **Reviewing washer documents**. Read **Before collecting real IDs** first.
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

## Before collecting real IDs

**Runbook gate. Real government IDs must not be collected until both of these are done.** Uploads are off in the database until a person turns them on (D-123), and only this runbook decides when that happens. While they are off, no washer can upload, so none can be verified, and bookings can't be served. Until both are done, test only with synthetic images on a local stack.

1. **The removal job is deployed and scheduled.** The job `purge-worker-documents` has not been deployed or scheduled anywhere. See `DEPLOYMENT.md`, section 7. Until it runs, every queued file stays in storage, including files of people who deleted their account.
2. **Legal review is done.** Items B2C7-L1 to B2C7-L17 in `LEGAL_REVIEW_REGISTER.md` are all open. They include whether to collect these documents at all, what washers must be told, and how long files are kept.

Then a person runs this once, by hand: `update public.platform_settings set worker_document_uploads_enabled = true;`. No screen or RPC can change it. Run it with `false` to stop new uploads again; files already there are unaffected.

The documents are a product default, not a statement of what any law requires. Approving them means an admin opened the files and chose Approve. It doesn't prove anyone's identity, so don't describe it that way.

## Reviewing washer documents

Washers upload a government ID and a selfie, as JPEG or PNG up to 10 MiB, on the website or in the app. The list of types is a database table changed by SQL. There is no admin screen for it. A required type added by SQL with no row for a washer isn't listed on the admin screen; **Verify** stays available and the database refuses it, so update the list in `packages/shared/src/workerDocuments.ts` if the types change.

In **Bookings and washers**, under **Washers**:

1. The summary shows how many documents are waiting for review, and how many files are waiting for removal. That second count includes items the job hasn't reached yet.
2. Each washer who isn't verified shows the documents stopping verification, and why: not uploaded, under review or rejected.
3. Choose **Documents**, then **Open** on a document. The image appears on the page. Each opening goes into the audit log, and opens a 60-second window for that admin alone. Do this only on a device WashLink controls. The app asks browsers not to store the image, but this wasn't observed in a real browser, and a custom client could upload without that request.
4. If the image doesn't display, the file may not be a real photo. Reject it. The server can't inspect file contents.
5. **Approve** is available only while the image is showing on your screen, so a file that failed to load can't be approved here. The database's own rule is looser: it only needs you to have opened that document at some point, so a custom client could approve without viewing it. Neither rule records that the file was examined. A file changed after upload can't be approved.
6. **Reject** and **Revoke** need a reason of 10 to 500 characters. **The washer reads this reason.** The notification they get doesn't include it.
7. **Verify** is a separate action. It's available once every required document is approved. Approving documents never verifies anyone, and the database refuses to verify without them.

Things to know:

- **Revoking** a required document from a verified washer, when no other approved copy remains, moves them to pending at once. Their open requests close and unstarted jobs return to search, as in **Suspending a washer**.
- **Replacing** an approved document changes nothing until the new one is approved. If the new one is rejected, the old one still counts.
- A washer can start at most 10 uploads in 24 hours. Documents don't expire: check the dates yourself, and revoke if needed.
- Any super admin can open any document, up to 60 an hour. The file is downloaded into the page. Local probes on Storage v1.88.0 show an admin's request for a link is refused, but hosted Storage is unverified. A stolen admin session could still take up to 60 files an hour until it ends. See B2C7-L5.
- No admin can open or review their own documents, or review their own washer account.
- The count of files waiting for removal includes expired uploads and stray files the job hasn't reached yet, so it can be higher than the number of real files.
- A washer can't view a file after uploading it. The file is never shown to customers.

## Suspending a washer

Suspending or rejecting a washer needs a reason of 10 to 500 characters, which the washer sees. A suspended washer can't upload documents. **Move to pending** lets them upload again. That button also appears for a rejected washer. Rejecting a washer's account status has no button yet.

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

- **Removed:** sign-in, profile, saved addresses and vehicles, device tokens, notifications, washer profile and washer document records.
- **Queued, not removed:** uploaded verification files. Account deletion queues files and does not remove them. Removal happens only when the job `purge-worker-documents` runs, and that job has not been deployed or scheduled anywhere. Until it is, the files stay in storage, and the admin console shows the count and the oldest date. After deletion no client session can read them through the policies, because an admin's read needs a document row that no longer exists and, in local probes on Storage v1.88.0, a request for a link is refused. Hosted Storage is unverified. The service role can still read them, and a copy already open in an admin's page stays until that view closes. Replaced and abandoned uploads join the same queue. Scheduling the job is a launch requirement before any real washer uploads. No retention period is stated, because none has been decided. See B2C7-L3 and B2C7-L4.
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
