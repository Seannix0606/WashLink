-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT
-- =============================================================
-- WashLink W1 local test baseline, part 2: shop-owner booking policies.
--
-- Staged by scripts/supabase-test/stage-local-workdir.mjs as migration
-- version 20260417000002 inside the gitignored .local-supabase-test/
-- workdir only, i.e. right after 2026_04_17_add_shops_and_booking_location
-- (staged as 20260417000001), which adds bookings.shop_id, and before every
-- later committed migration. Because these policies are a MIGRATION (not the
-- seed, which runs after all migrations), W2 migrations can drop or replace
-- them and the J17/J18 owner-booking tests then exercise the W2 policies.
--
-- It lives outside supabase/ on purpose: it must never reach a linked
-- project via `supabase db push` or `supabase test db --linked`.
--
-- reconstructed, see docs/workforce/ARCHITECTURE_AUDIT.md; no column
-- restriction on purpose (reproduces audit S2).
-- =============================================================

drop policy if exists "bookings_owner_select_local_test" on public.bookings;
create policy "bookings_owner_select_local_test" on public.bookings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.shops s
      where s.id = bookings.shop_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "bookings_owner_update_local_test" on public.bookings;
create policy "bookings_owner_update_local_test" on public.bookings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.shops s
      where s.id = bookings.shop_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shops s
      where s.id = bookings.shop_id and s.owner_id = auth.uid()
    )
  );

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; never run against a real project)
-- -------------------------------------------------------------
-- drop policy if exists "bookings_owner_update_local_test" on public.bookings;
-- drop policy if exists "bookings_owner_select_local_test" on public.bookings;
