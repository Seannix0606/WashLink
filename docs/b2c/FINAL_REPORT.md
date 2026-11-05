# WashLink B2C: final report

Branch `feature/b2c`. Nothing has been pushed, merged, deployed or applied to a real Supabase project.

**The web app and backend are built and tested on a local stack. The mobile app is built, and its screens work in a browser preview, but it has never run on a phone.** It isn't ready for store release.

## 1. Status

### Completed and tested

Checked by automated tests and, where noted, by hand in a browser against the local stack.

| Area | Evidence |
| --- | --- |
| Booking engine: server prices, repeat-safe submission, status rules, cancellation, reviews | Database tests and API smoke |
| Dispatch: address privacy before acceptance, one winner when two washers race | API smoke |
| Access rules: customers, washers and admins limited to their own data and actions | Database tests and API smoke |
| Bookings can't open while prices are draft | API smoke |
| Landing page | Browser, 375px and desktop |
| Web booking, scheduled: all 5 steps through to confirmation | Browser, 375px |
| Web washer: profile, verification, going online, accept, address reveal, first status step | Browser, 375px |
| Web customer: live status update, rating | Browser. One live update seen about 2 seconds after the change |
| Web admin: verify a washer, summary, tabs hidden while B2B is off | Browser |
| B2B regression: all earlier database tests and API smokes | Pass |

### Partly implemented, or checked in a limited way

| Area | What's missing |
| --- | --- |
| Mobile app (customer and washer) | Booking through completion worked in the **browser preview** only, with stand-ins for maps and secure storage. Android and iOS JavaScript bundles compile, but no native build exists |
| Screens written but not clicked through | As-soon-as-possible booking, search again after no washer, release booking, report a problem, admin price editing and booking case view, mobile sign-up and password reset |
| Payment | Cash only. Amounts are "expected"; collection isn't confirmed |
| Address search and maps | Use public services with usage limits. Not suitable for production traffic |
| Cross-platform flow | Web and mobile screens were each driven against one shared backend, but not on devices at the same time. Each role was signed in turn in one browser tab. Web and preview weren't run side by side |

### Unverified

Nothing below has ever run. Don't rely on any of it yet.

- Android and iOS builds
- Native maps, device location, and keychain or keystore storage on a phone
- Push notifications: token registration on a device, `send-service-push`, the webhook, and opening a screen from a notification
- Live updates inside the mobile app. It uses the same code path as web, but this wasn't observed
- Deploying to Render or Docker, and applying migrations to production

### Not built

- **In-app account deletion for B2C users.** Apple and Google both require it, so this blocks store release.
- Online payment, phone number verification, and washer document upload
- Worker GPS tracking, and logo and store assets

## 2. Architecture changes

See `ARCHITECTURE.md`. Web and Expo share `packages/shared`, and both talk to one Supabase backend. B2C has its own tables, separate from B2B `bookings`.

## 3. New and modified files

| Path | Contents |
| --- | --- |
| `packages/shared/` | New shared package |
| `supabase/migrations/2026_11_06_b2c{a..e}_*.sql` | 5 new migrations |
| `supabase/functions/send-service-push/` | Push sender, never run |
| `supabase/tests/database/j19_*` | New tests. Six earlier roll-up tests had their expected counts extended; no checks were removed |
| `frontend/src/features/b2c/` | Landing, customer, washer and admin screens |
| `frontend/` existing files | `App.tsx`, role picker, admin dashboard and tabs, sign-in copy, map labels, build config |
| `mobile/` | New Expo app |
| `scripts/supabase-test/b2c-*` | API smoke, seed, and local preview scripts |
| `docs/b2c/` | Architecture, operations, deployment, B2B reactivation, this report |

One existing B2B test (`WorkerContractDraftEditor.j9`) timed out at 5 seconds when the full suite ran under load, but passed alone. Its timeout is now 15 seconds and its checks are unchanged.

## 4. Shared packages

`@washlink/shared` has no dependencies. It holds the API client, booking statuses and next actions, draft and step rules, validation, price formatting, Manila date helpers, feature flags and brand tokens.

## 5. Web features

- Dark landing page: hero, how it works, locations, live services and prices, washer sign-up and app section. The hero is a CSS scene until real photos exist.
- Customer: 5-step booking, map pin with search and device location, saved addresses and vehicles, live tracking, cancel, search again, rating.
- Washer: profile, service area, hours, services, online toggle, requests with countdown, job steps, directions, earnings, reviews.
- Admin: open or close bookings, prices, commission, washer verification and suspension, booking monitor, audited case view.

## 6. Mobile features

- Native React Native screens, not a WebView.
- Customer and washer tabs that follow the role stored in the database. Admin and shop accounts are sent to the website.
- Native booking steps, `react-native-maps`, device location, and a secure session.
- Push registration, an offline banner, and pull to refresh.

## 7. Migrations

Five additive migrations: catalog and accounts, bookings and dispatch, booking engine, washer actions, admin operations. They're applied only to the local stack. Nothing is deleted or changed in existing tables, apart from new notification categories being registered.

## 8. Security improvements

- Prices and washer eligibility are decided only on the server.
- The address and customer are hidden until a washer accepts, and the API smoke confirms it.
- Internal functions and identity sequences are revoked from client roles, pinned by the J17 list.
- Clients only see error sentences written for people, never raw database errors.
- Notification tap targets are limited to an allowed list.
- No service role reference exists in the app source, and none was found in the Android or iOS bundles.
- Mobile sessions use the keychain or keystore. That code passes unit tests with a mock but is untested on a device.

**Dependency audit (mobile):** 25 moderate or low advisories, none high or critical. The 5 in production dependencies are in Expo's command-line tooling (`glob`, `minimatch`), which is not app runtime code. I didn't force upgrades, because the suggested fix would break the Expo SDK version.

No separate independent security review of the B2C work has been done. I recommend one before launch.

## 9. Test results

Latest run on this code:

| Check | Result |
| --- | --- |
| Database tests (pgTAP) | 115 files, 3,471 tests, pass |
| API smokes | 16 smokes, pass (B2C: 49 checks) |
| Web unit tests | 155 files, 352 tests, pass |
| Web lint and type-check | Clean |
| Web production build | Pass, run before the final small mobile-only and wizard changes |
| Mobile type-check | Clean |
| Mobile unit tests | 5 pass. This is thin coverage: logic only, no screens |
| Expo Doctor | 20 of 20 |

## 10. Android build status

**Not built.** The JavaScript bundle compiles. This machine has no Android SDK, adb, Java or Expo account.

## 11. iOS build status

**Not built.** The JavaScript bundle compiles. iOS builds need EAS or a Mac, plus an Apple Developer account.

## 12. Required services and keys

| Service | Needed for | Status |
| --- | --- | --- |
| Supabase production project | Everything | Exists; migrations not applied |
| Expo account and EAS project | Mobile builds, push | Needed |
| Google Maps Android key | Android maps | Needed |
| Apple Developer, Google Play | Store release | Needed |
| Paid geocoding and tile provider | Real traffic | Needed |
| Scheduler such as pg_cron | Timely search expiry | Recommended |
| Payment provider | Online payment | Later |

## 13. Blockers

These need you:

1. Real prices and commission. Seeded prices are placeholders, and bookings stay closed until they're set.
2. Approval to apply the migrations to production.
3. An Expo account and real devices, to test builds and push.
4. Logo files and real photos. The repository only has the CSS brand mark.
5. In-app account deletion, which needs a decision on keeping completed booking records.

Parked: W17 on `feature/workforce` (`48f7fb0`) is unverified and W18 hasn't started. B-1 and B-2 in the worker profile editor stay open; B2C washer screens don't show that editor.

## 14. Deployment and B2B

- Deployment: `DEPLOYMENT.md`.
- Running the service: `OPERATIONS.md`.
- Bringing B2B back: `B2B_REACTIVATION.md`. B2B is hidden by a build flag. Its data, functions and tests are intact, and turning it back on needs no migration.
