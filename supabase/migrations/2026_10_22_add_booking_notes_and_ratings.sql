-- Query name: WashLink add booking notes and ratings
-- Add the optional notes and customer rating fields used by the frontend.
-- Idempotent: safe to run multiple times.

alter table public.bookings
  add column if not exists customer_notes text,
  add column if not exists customer_rating_stars smallint,
  add column if not exists customer_rating_comment text,
  add column if not exists customer_rated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_customer_rating_stars_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_customer_rating_stars_check
      check (
        customer_rating_stars is null
        or customer_rating_stars between 1 and 5
      );
  end if;
end $$;

notify pgrst, 'reload schema';
