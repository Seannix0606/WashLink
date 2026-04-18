-- =============================================================
-- WashLink — Super admin role + shop verification workflow
-- Idempotent: safe to run multiple times.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Allow 'super_admin' as a valid value on public.profiles.role
--    Handles both the CHECK-constraint and the enum-type cases.
-- -------------------------------------------------------------
do $$
declare
  constraint_name text;
begin
  -- Case A: role is a text column with a CHECK constraint.
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'profiles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role%';

  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('customer', 'owner', 'worker', 'super_admin'));
  end if;

  -- Case B: role is a Postgres enum.
  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname in ('user_role', 'profile_role', 'application_user_role')
      and n.nspname = 'public'
  ) then
    begin
      if not exists (
        select 1 from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        where t.typname in ('user_role', 'profile_role', 'application_user_role')
          and e.enumlabel = 'super_admin'
      ) then
        -- Enum name may vary; try each and ignore failures.
        begin execute 'alter type public.user_role add value if not exists ''super_admin'''; exception when undefined_object then null; end;
        begin execute 'alter type public.profile_role add value if not exists ''super_admin'''; exception when undefined_object then null; end;
        begin execute 'alter type public.application_user_role add value if not exists ''super_admin'''; exception when undefined_object then null; end;
      end if;
    end;
  end if;
end $$;

-- -------------------------------------------------------------
-- 2) Add verification columns to public.shops
-- -------------------------------------------------------------
alter table public.shops
  add column if not exists verification_status text not null default 'pending',
  add column if not exists verification_notes text,
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_reviewed_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shops_verification_status_check'
  ) then
    alter table public.shops
      add constraint shops_verification_status_check
      check (verification_status in ('pending', 'changes_requested', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists shops_verification_status_idx
  on public.shops(verification_status);

-- -------------------------------------------------------------
-- 3) Helper: is_super_admin() — used by RLS policies below
-- -------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- -------------------------------------------------------------
-- 4) Update shops RLS:
--    - Customers only see approved + active shops
--    - Owners always see their own shops (regardless of status)
--    - Super admins see everything and can update verification fields
-- -------------------------------------------------------------
drop policy if exists "shops_select_active" on public.shops;
create policy "shops_select_active" on public.shops
  for select
  to authenticated
  using (
    (is_active and verification_status = 'approved')
    or owner_id = auth.uid()
    or public.is_super_admin()
  );

drop policy if exists "shops_update_super_admin" on public.shops;
create policy "shops_update_super_admin" on public.shops
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Keep owner update policy intact (already exists from prior migration);
-- a separate trigger below prevents owners from mutating verification fields.

create or replace function public.prevent_owner_verification_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_super_admin() then
    return new;
  end if;
  if new.verification_status is distinct from old.verification_status
     or new.verification_notes is distinct from old.verification_notes
     or new.verification_reviewed_at is distinct from old.verification_reviewed_at
     or new.verification_reviewed_by is distinct from old.verification_reviewed_by
  then
    raise exception 'Only super admins can change verification status or notes.';
  end if;
  return new;
end;
$$;

drop trigger if exists shops_prevent_owner_verification_mutation on public.shops;
create trigger shops_prevent_owner_verification_mutation
  before update on public.shops
  for each row
  execute function public.prevent_owner_verification_mutation();

-- -------------------------------------------------------------
-- 5) shop_verification_documents table
-- -------------------------------------------------------------
create table if not exists public.shop_verification_documents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  document_type text not null,
  storage_path text not null,
  file_name text,
  file_size_bytes bigint,
  content_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  constraint shop_verification_documents_type_check
    check (document_type in (
      'business_permit',
      'dti_sec_registration',
      'mayors_permit',
      'valid_government_id'
    )),
  constraint shop_verification_documents_shop_type_unique
    unique (shop_id, document_type)
);

create index if not exists shop_verification_documents_shop_id_idx
  on public.shop_verification_documents(shop_id);

alter table public.shop_verification_documents enable row level security;

drop policy if exists "svd_select_owner_or_admin" on public.shop_verification_documents;
create policy "svd_select_owner_or_admin" on public.shop_verification_documents
  for select
  to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.shops s
      where s.id = shop_verification_documents.shop_id
        and s.owner_id = auth.uid()
    )
  );

drop policy if exists "svd_insert_owner" on public.shop_verification_documents;
create policy "svd_insert_owner" on public.shop_verification_documents
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.shops s
      where s.id = shop_verification_documents.shop_id
        and s.owner_id = auth.uid()
    )
  );

drop policy if exists "svd_update_owner" on public.shop_verification_documents;
create policy "svd_update_owner" on public.shop_verification_documents
  for update
  to authenticated
  using (
    exists (
      select 1 from public.shops s
      where s.id = shop_verification_documents.shop_id
        and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shops s
      where s.id = shop_verification_documents.shop_id
        and s.owner_id = auth.uid()
    )
  );

drop policy if exists "svd_delete_owner" on public.shop_verification_documents;
create policy "svd_delete_owner" on public.shop_verification_documents
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.shops s
      where s.id = shop_verification_documents.shop_id
        and s.owner_id = auth.uid()
    )
  );

-- -------------------------------------------------------------
-- 6) Storage bucket: shop-verification-documents (private)
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('shop-verification-documents', 'shop-verification-documents', false)
on conflict (id) do nothing;

-- Storage policies: paths are structured as <shop_id>/<document_type>-<uuid>.<ext>
-- Owners may read/write objects under folders matching shops they own.
-- Super admins may read any object.

drop policy if exists "svd_storage_select_owner_or_admin" on storage.objects;
create policy "svd_storage_select_owner_or_admin" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'shop-verification-documents'
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.shops s
        where s.id::text = split_part(name, '/', 1)
          and s.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "svd_storage_insert_owner" on storage.objects;
create policy "svd_storage_insert_owner" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'shop-verification-documents'
    and exists (
      select 1 from public.shops s
      where s.id::text = split_part(name, '/', 1)
        and s.owner_id = auth.uid()
    )
  );

drop policy if exists "svd_storage_update_owner" on storage.objects;
create policy "svd_storage_update_owner" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'shop-verification-documents'
    and exists (
      select 1 from public.shops s
      where s.id::text = split_part(name, '/', 1)
        and s.owner_id = auth.uid()
    )
  );

drop policy if exists "svd_storage_delete_owner" on storage.objects;
create policy "svd_storage_delete_owner" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'shop-verification-documents'
    and exists (
      select 1 from public.shops s
      where s.id::text = split_part(name, '/', 1)
        and s.owner_id = auth.uid()
    )
  );

-- -------------------------------------------------------------
-- 7) Bootstrap a super admin (run manually after signup):
--    update public.profiles set role = 'super_admin'
--      where id = (select id from auth.users where email = 'admin@washlink.dev');
-- -------------------------------------------------------------
