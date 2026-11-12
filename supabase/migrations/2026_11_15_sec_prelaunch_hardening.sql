-- =============================================================
-- WashLink pre-launch security hardening (SEC-1). Additive: no committed migration changes.
-- 1) The shop verification bucket (B2B, from 2026_04_18) had no size or file type limit, so any signed-in owner could
--    store files of any type and size there. It now takes what the upload form already allows: PDF, PNG, JPEG or WebP,
--    up to 8 MB (frontend ShopVerificationDocumentSlot). The other two buckets already had limits.
-- 2) Signed-out visitors (anon) still held insert / update / delete grants on six early tables (bookings, profiles,
--    shop_pricing, shop_verification_documents, shops, workers). Row level security has no anon policy on any of them,
--    so these writes were already refused; removing the grants makes that a second, independent lock. Read grants and
--    every signed-in (authenticated) grant are unchanged.
-- Checked live and local on 2026-11-13: every public table has row level security on, every SECURITY DEFINER function
-- pins its search_path, and every admin_* function checks for an admin.
-- =============================================================

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
where id = 'shop-verification-documents';

revoke insert, update, delete, truncate, references, trigger
  on public.bookings, public.profiles, public.shop_pricing, public.shop_verification_documents, public.shops, public.workers
  from anon;

-- ROLLBACK:
-- begin;
-- update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'shop-verification-documents';
-- grant insert, update, delete, truncate, references, trigger
--   on public.bookings, public.profiles, public.shop_pricing, public.shop_verification_documents, public.shops, public.workers
--   to anon;
-- commit;
