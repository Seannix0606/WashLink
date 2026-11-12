-- SEC-1: upload limits on every bucket, no write grants for signed-out visitors, and the standing locks still hold.
-- Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- 1) Every storage bucket is private and has a size and file type limit.
select is((select count(*)::int from storage.buckets where public), 0, 'sec1_no_public_bucket');
select is((select count(*)::int from storage.buckets where file_size_limit is null or allowed_mime_types is null), 0,
          'sec1_every_bucket_has_size_and_type_limits');
select is((select file_size_limit::int from storage.buckets where id = 'shop-verification-documents'), 8388608,
          'sec1_shop_documents_up_to_8_mb');
select is((select allowed_mime_types from storage.buckets where id = 'shop-verification-documents'),
          array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], 'sec1_shop_documents_pdf_or_image_only');

-- 2) A signed-out visitor holds no insert, update or delete grant on any public table.
select is((select count(*)::int from information_schema.role_table_grants
           where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
          0, 'sec1_anon_has_no_write_grants');

set local role anon;
select throws_ok($$ insert into public.shops (name) values ('Sneaky shop') $$, '42501', null, 'sec1_anon_insert_refused');
select throws_ok($$ update public.profiles set full_name = 'x' $$, '42501', null, 'sec1_anon_update_refused');
reset role;

-- 3) The standing locks: row level security on every public table, and every definer function pins its search_path.
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity), 0, 'sec1_rls_on_every_public_table');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) s where s like 'search_path=%')),
          0, 'sec1_definer_functions_pin_search_path');

select * from finish();
rollback;
