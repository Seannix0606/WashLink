# 05 · Flows: bookings, statuses and who can do what

> Documented 2026-11-10 from `main` at `4012ce7`. The database decides every rule below; the screens only show it.

## Booking statuses (`packages/shared/src/bookingStatus.ts`)
| Status key | Label customers see | Group | Terminal |
|---|---|---|---|
| `pending` | Booking received | waiting | |
| `searching_for_worker` | Finding a washer | waiting | |
| `no_worker_available` | No washer available | needs action | (not active, not terminal) |
| `accepted` | Washer confirmed | confirmed | |
| `worker_on_the_way` | Washer on the way | moving | |
| `arrived` | Washer has arrived | moving | |
| `in_progress` | Washing your vehicle | washing | |
| `completed` | Completed | done | yes |
| `cancelled` | Cancelled | stopped | yes |
| `expired` | Expired | stopped | yes |

The status machine (database `service_booking_transition_allowed`):
```
pending → searching_for_worker | cancelled
searching_for_worker → accepted | cancelled | no_worker_available | expired
no_worker_available → searching_for_worker | cancelled | expired
accepted → worker_on_the_way | cancelled | searching_for_worker (handed back)
worker_on_the_way → arrived | cancelled | searching_for_worker (handed back)
arrived → in_progress | cancelled
in_progress → completed | cancelled
```

## Customer
1. **Book** with the five-step wizard ([Booking wizard](screens/booking-wizard.md)): When → Where → Service →
   Vehicle → Review. The price is quoted by the server; only times a washer can actually make are offered.
2. The booking starts **Finding a washer**: it is offered to eligible washers one at a time, each offer expiring.
3. If nobody accepts in the search window it becomes **No washer available**: the customer can **Search again** or
   **Cancel booking**.
4. They follow the status on their booking card; a notification is sent at each change.
5. **Cancel** is allowed while pending, finding, no washer, confirmed or on the way; once the washer has arrived or
   started, only after the job is overdue (scheduled time + duration + 60 min grace).
6. After **Completed** they can rate 1–5 with a comment.
7. **Saved details:** addresses (with landmark and gate notes) and vehicles for faster booking. **Account:** delete
   the account (requires a recent password sign-in).

## Operator washer
1. **Requests** arrive on the Work tab with service, time, a distance band and earnings, but no address until
   accepted. **Accept** or **Decline** before the offer expires.
2. Accepted jobs show the address, landmark, instructions, customer name and phone, **Navigate** and
   **Call customer**.
3. One next step at a time: **Start travelling** (up to 2 h before the start) → **Mark arrived** (up to 30 min
   before) → **Start wash** → **Complete wash**.
4. **Cancel booking** with a 10–500 character reason (operator accounts only); other washers can only hand a job
   back ("I can't do this booking"). **Report a problem** is always available.
5. **History and earnings:** totals, completed jobs, reviews. **Profile and hours:** bio, service area pin and
   radius, services offered, weekly hours, **Go online** for as-soon-as-possible jobs.
6. An operator needs no verification documents. Other washers upload documents and wait for admin review.

## Admin
1. **Open bookings / Close bookings** for the whole platform.
2. **Services and prices:** commission, each service's price (draft prices can't be booked), Hide/Show, add-ons and
   **Add an add-on** (from `4012ce7`).
3. **Washers:** verify, reject, suspend with a reason, review documents; operator accounts carry a
   **WashLink operator** badge.
4. **Bookings:** filter by status, open a booking's history, cancel with a reason.
5. **Audit log:** every money, status and verification change.
6. Making an operator account and opening washer sign-up are done in SQL: see
   [`docs/b2c/OPERATOR_MODE.md`](../b2c/OPERATOR_MODE.md).

## Sign up and sign in
- Create account asks for full name, phone, email and password; it always creates a **customer** while washer
  sign-up is closed (the account-type picker is hidden).
- Email confirmation is on; the Supabase redirect URLs must point at the live address.
- Forgot password sends a reset email; opening it shows the reset password page.
