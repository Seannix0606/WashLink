-- Repair storage access for owner-uploaded shop verification documents.
-- Requires 2026_04_18_super_admin_and_shop_verification.sql.

create or replace function public.can_manage_shop_verification_storage(
  shop_folder_id text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.shops s
    where s.id::text = shop_folder_id
      and s.owner_id = auth.uid()
  );
$$;

revoke all on function public.can_manage_shop_verification_storage(text)
  from public;
grant execute on function public.can_manage_shop_verification_storage(text)
  to authenticated;

drop policy if exists "svd_storage_select_owner_or_admin" on storage.objects;
create policy "svd_storage_select_owner_or_admin" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'shop-verification-documents'
    and (
      public.is_super_admin()
      or public.can_manage_shop_verification_storage(
        (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists "svd_storage_insert_owner" on storage.objects;
create policy "svd_storage_insert_owner" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'shop-verification-documents'
    and public.can_manage_shop_verification_storage(
      (storage.foldername(name))[1]
    )
  );

drop policy if exists "svd_storage_update_owner" on storage.objects;
create policy "svd_storage_update_owner" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'shop-verification-documents'
    and public.can_manage_shop_verification_storage(
      (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'shop-verification-documents'
    and public.can_manage_shop_verification_storage(
      (storage.foldername(name))[1]
    )
  );

drop policy if exists "svd_storage_delete_owner" on storage.objects;
create policy "svd_storage_delete_owner" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'shop-verification-documents'
    and public.can_manage_shop_verification_storage(
      (storage.foldername(name))[1]
    )
  );
