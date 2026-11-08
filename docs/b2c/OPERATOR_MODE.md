# Operator mode: WashLink runs the washes itself

While WashLink is starting out, it does the washes itself instead of signing up outside washers. In operator mode:

- **Washer sign-up is closed** on the website, in the installed web app and in the Expo app. Sign-up only creates
  customer accounts. The database enforces this too: a sign-up that asks for the worker role becomes a customer.
- **You accept and run bookings from an operator washer account.** This is an ordinary washer account that WashLink marks
  as its own. It uses the normal washer screens: booking requests (accept or decline), then *Start travelling*,
  *Mark arrived*, *Start wash* and *Complete wash*. It can also **cancel** a booking assigned to it, with a reason the customer is
  told about. Other washers can still only hand a job back.
- **The operator account needs no verification documents.** Every other washer still needs approved documents before
  verification. The admin panel marks operator accounts with a *WashLink operator* badge, and every grant or removal is
  in the audit log.
- **Existing washer accounts are unchanged.** They keep their status and can keep working.

The database change is `supabase/migrations/2026_11_08_opa_operator_mode.sql`, and its tests are in
`supabase/tests/database/j19_op1_operator_mode.test.sql`.

## Set up your operator account (once)

1. Deploy the migration and the new web build.
2. Create a normal account on the website with the email you want to use for washing. Use a different account from
   your admin login. Admin accounts can't take bookings, and nobody can review their own washer account.
3. In the Supabase SQL editor, run:

   ```sql
   select public.make_platform_operator('washer-account@example.com');
   ```

   This turns the account into a verified operator washer. It works only from the SQL editor (a trusted session), never
   from the apps. It refuses admin and shop owner accounts, and customer accounts that still have open bookings.
4. Sign in as that account. Under **Profile and hours**, set your base location, service radius, the services you offer
   and your weekly hours. Customers can only book times that fit those hours and that area.
5. On **Work**, go online to receive as-soon-as-possible bookings. Scheduled bookings inside your hours reach you while
   you are offline too.
6. In the admin panel, make sure bookings are open (the *Open bookings* button) and prices are final.

To stop using an account as the operator:

```sql
select public.remove_platform_operator('washer-account@example.com');
```

The account becomes an ordinary washer under review, and its unstarted jobs go back to search.

## Install WashLink on a phone

The website is installable, so customers (and you) can use it like an app:

- **Android (Chrome):** the landing page shows an *Install the app* button. You can also use *Install app* or *Add to
  Home screen* in the browser menu.
- **iPhone (Safari):** tap *Share*, then *Add to Home Screen*.

The installed app opens full screen and uses the same account and bookings. Its service worker caches nothing except
a small offline page, so every release and every booking status comes straight from the network. Installing needs HTTPS,
which the hosted site already has.

## Reopen washer sign-up later

Turn both switches on together:

1. Database: `update public.platform_settings set washer_signup_open = true;`
2. Builds: set `VITE_FEATURE_WASHER_SIGNUP=true` for the website and `EXPO_PUBLIC_FEATURE_WASHER_SIGNUP=true` for the
   Expo app, then rebuild.

New washers then sign up and go through document verification as before. Operator accounts keep working alongside them.
