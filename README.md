# WashLink

Production-grade car wash booking and operations dashboard (React + TypeScript) using Clean Architecture and SOLID principles.

## Stack

- React + TypeScript (strict mode)
- Tailwind CSS
- Supabase Auth + Realtime
- ESLint strict type-aware rules

## Architecture Layers

- `src/domain`: Business entities and repository contracts
- `src/application`: Use-case orchestration services
- `src/infrastructure`: Supabase implementations
- `src/presentation`: UI components, hooks, and pages

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Add your Supabase values:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (use the project publishable or anon public key)

## Auth + Landing Flow

- Unauthenticated users land on a sign-in screen.
- New users can switch to sign-up and register as:
  - `customer`
  - `owner`
- After sign-in, the app reads `profiles.role` and routes automatically:
  - `customer` -> booking page
  - `owner` -> owner dashboard
  - `worker` -> worker jobs page

## Run Locally

```bash
npm install
npm run dev
```

## Realtime Behavior

- Subscribes to `INSERT` and `UPDATE` events on `public.bookings`
- Shows green banner: `New Booking Received` (on insert)
- Plays a sound notification (on insert)
- Prepends new booking cards; merges updates (including `assigned_worker_id`) in place

## Supabase schema (expected)

Tables required:

- `profiles`
  - `id` (uuid, references `auth.users.id`)
  - `role` (`customer | owner | worker`)
  - `full_name` (text)
  - `phone_number` (text)
- `workers`
  - `id` (uuid)
  - `owner_id` (uuid, references `auth.users.id`)
  - `user_id` (uuid, nullable, references `auth.users.id`)
  - `name` (text)
  - `phone_number` (text)
  - `is_available` (boolean)
- `bookings`
  - `assigned_worker_id` (nullable, references `workers.id`)
  - `customer_id` (references `auth.users.id`)
  - `booking_status` in `pending | accepted | in_progress | completed | rejected`

RLS policies should enforce:

- Customers can insert/select their own bookings.
- Owners can manage their own workers and booking operations.
- Workers can view/update bookings assigned to their linked worker row.

Enable replication for `bookings` and `workers` if you use Supabase Realtime.

There is no hash-based route configuration anymore.
