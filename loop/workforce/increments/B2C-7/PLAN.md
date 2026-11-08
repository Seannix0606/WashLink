# B2C-7: washer verification documents

> **Amended in fix cycle 1.** Signing is refused and admins download instead (D-118); signed-upload tokens are refused (D-124); uploads default off (D-123). Where this plan describes signed URLs or `createSignedUrl`, `DECISIONS.md` and `LOG.md` take precedence. Browser step 6 no longer applies, because there is no link to paste. Section 14 lists L1 to L9; the register now has L1 to L17.

Branch `feature/b2c`, base `5a3f769`. Commit tag `[B2C-7]`. Local Supabase only. Dependencies: B2C-1 to B2C-6 committed (root `STATE.md`). No OPEN row blocks this; D-10 stays a standing gate. Baseline: 123 pgTAP files / 3580 tests, 16 smokes, web 398, mobile 11, backend 4.

## 1. Verified facts

`bN` means `supabase/migrations/2026_11_06_b2cN_*.sql`. "Probed" means run on the local stack (Storage v1.88.0, 110 migrations, file backend) with a throwaway bucket, policies and users. All were removed afterwards, and the cleanup check returned 0, 0, 0.

| # | Fact | Source |
|---|---|---|
| F1 | Only `admin_review_independent_worker` writes `verification_status` from a client path. It has no evidence check. Fixtures write the column directly | b2ci:197-245, grep |
| F2 | Only the two shop migrations touch `storage.*`. Every existing storage policy is limited to its own bucket, so a new bucket is isolated | grep, `pg_policies` |
| F3 | Shop pattern flaws not to copy: no bucket size or type limit (`size=null mime=null` probed); owner UPDATE and DELETE policies let bytes change behind a reviewed row; super admin reads with no audit; size, type and name come from the client; the extension comes from the user's filename; upload and row write are not atomic; old-file removal is a client call that ignores errors. Worth keeping: `w2b` binds the row to its folder and stamps the uploader on the server, and `2026_10_22` uses a definer helper in policies | `SupabaseShopVerificationRepository.ts`, `2026_04_18`, `2026_10_22`, w2b |
| F4 | Bucket limits work. 2 MiB against a 1 MiB limit gives 413. SVG and HTML give 415 | probed |
| F5 | **Storage does not read the bytes.** HTML bytes declared `image/jpeg` are accepted and served as `image/jpeg`. `image/jpeg; charset=utf-8` is accepted and stored with the suffix | probed |
| F6 | With an INSERT policy only: upload works; upsert and `update()` give 403; a repeat upload gives 409; `remove` reports OK with 0 rows and removes nothing; download, signed URL and move give 404; an upsert signed-upload URL gives 403 | probed |
| F7 | A plain signed-upload URL can be minted while INSERT is allowed, and uploads with that token later. Its lifetime is 2 hours (`SIGNED_UPLOAD_URL_EXPIRATION_TIME=7200`). A file can therefore land after its slot closed | probed once within the window; the late landing itself is not probed, and the smoke must prove it |
| F8 | **The client chooses signed URL lifetime.** A 10-year URL was minted (`exp-iat` 315360000). A signed URL keeps working after the SELECT policy is dropped. RLS cannot see or limit this | probed |
| F9 | Without `download`, no `Content-Disposition` is sent and there is no `X-Content-Type-Options`. With `download`, the response is `attachment; filename=...` and the same content type | probed |
| F10 | `storage.objects` has no FK to `auth.users`. After a user is deleted, the rows stay with their `owner_id` and the file is still downloadable with the service role | probed |
| F11 | Direct `delete from storage.objects` is refused for `postgres` by trigger `protect_objects_delete`. SQL cannot remove a file, and forcing the row out would orphan the bytes | probed |
| F12 | Service-role `remove` deletes row and file. Repeating it is OK with 0 rows, so it is idempotent | probed |
| F13 | After upload, `metadata` holds `mimetype`, `size` and `eTag`, and `version` is set. `postgres` has `rolbypassrls` and is not a superuser, so a definer function can read these. Production parity is unverified | probed |
| F14 | `.schema('storage')` through PostgREST is refused (`Invalid schema: storage`) | probed |
| F15 | Shop documents have no answer to deletion: nothing in SQL removes objects, and `shop_verification_documents` cascades leave objects behind | grep |
| F16 | `verificationNote` is mapped by the shared client (`b2cApi.ts:227`) but no worker screen shows it | grep |
| F17 | The audit rule rejects keys matching `storage_path`, `document_path`, `note`, `text`, `message`, `body`, `code`, `address` and others; strings over 120 characters; and **numbers of 1e6 or more**. A size in bytes would fail the whole transaction above about 1 MB | w3b:46-52 |
| F18 | `admin_independent_workers` returns a table, so adding a column needs drop and recreate. New RPCs avoid this | b2ce:148 |
| F19 | Stager copies only config, migrations, baseline and `tests/database`, not `functions/`. Edge functions cannot run from the staged workdir | `stage-local-workdir.mjs:308-320` |
| F20 | `storage-js` documents that Blob, File and FormData do not work as intended on React Native, and ArrayBuffer does (`StorageFileApi.ts:215`). Expo's fetch on Android handles `file://` through `OkHttpFileUrlInterceptor`, with no `content://` handling seen. `expo/bundledNativeModules.json` pins `expo-image-picker` to `~58.0.10` | `mobile/node_modules` |

## 2. Scope

**In:** bucket, tables, RPCs, storage policies, the database gate, deletion and replacement behaviour, a trusted file-removal job boundary, web and mobile upload, admin review, reasons shown to washers, a notification, docs.

**Out:** third-party ID verification (follow-up: a provider would add a reviewer kind to `admin_review_worker_document`, nothing is built now), phone verification, M3, M5, evidence before job completion, document expiry (D-114), byte-level content scanning, changing shop documents (flagged in section 13).

## 3. Schema

No client role gets a table grant on any of these. `revoke all ... from public, anon, authenticated, service_role`, RLS on, no policies. Reads and writes go through definer RPCs.

**`independent_worker_document_types`**: `key text pk check (key ~ '^[a-z_]{1,40}$')`, `label text`, `instructions text`, `is_required boolean not null`, `sort_order int`. Seed: `government_id`, `selfie` (D-109). Changed by human-run SQL, with no admin UI.

**`independent_worker_documents`**:
- `id uuid pk default gen_random_uuid()`
- `worker_id uuid not null references independent_workers(profile_id) on delete cascade`
- `document_type text not null references independent_worker_document_types(key)`
- `status text not null default 'awaiting_upload'`, check in `awaiting_upload, submitted, approved, rejected, superseded, abandoned`
- `object_name text not null unique`, always `<worker_id>/<id>`, with a CHECK that it equals `worker_id::text || '/' || id::text`
- `upload_expires_at timestamptz not null`, default `now() + 15 minutes`
- `content_type text`, `size_bytes integer`, `object_version text`, all read from `storage.objects` at submit, never from the client
- `submitted_at`, `reviewed_at timestamptz`, `reviewed_by uuid references profiles(id) on delete set null`
- `review_reason text`, check 10 to 500 characters when set, required when `status = 'rejected'`
- `read_open_for uuid`, `read_open_until timestamptz`: the audited read window (section 5)
- `file_queued_at`, `file_removed_at timestamptz`, `created_at`, `updated_at`

Indexes: unique `(worker_id, document_type) where status = 'awaiting_upload'`; unique same `where status = 'submitted'`; unique same `where status = 'approved'`; `(submitted_at) where status = 'submitted'`; `(worker_id, created_at desc)`.

**`independent_worker_document_file_queue`**: `object_name text pk`, `queued_at timestamptz`, `attempts int default 0`, `last_attempt_at timestamptz`. No FK, so it survives account deletion. Rows are deleted only after the file is confirmed gone.

**Trigger** `independent_worker_documents_queue_file_on_delete`: BEFORE DELETE FOR EACH ROW, definer. It inserts `object_name` into the queue on conflict do nothing. It fires for every path: `delete_my_account`, GoTrue or dashboard user deletion, and manual closure. **`delete_my_account` therefore needs no change.**

**Bucket** (in the migration, as shop documents do; `supabase/config.toml` is unchanged and no stray `.sql` is added):
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worker-verification-documents', 'worker-verification-documents', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
```

**Notification category:** `independent_worker.documents`, `source_increment 'W19'`, key prefix `worker_documents`, subject type `independent_worker_document`, recipient `worker`, via `enqueue_notification_safely` as at b2cc:219. Text is fixed and never contains the reason.

## 4. Storage policies, complete

These are the only two policies on this bucket. **There is deliberately no washer SELECT, no UPDATE and no DELETE policy** (F6): a washer cannot read back their own ID, even with a stolen token, and cannot change bytes after upload.

```sql
create policy iwd_storage_insert_open_slot on storage.objects for insert to authenticated
  with check (bucket_id = 'worker-verification-documents' and public.worker_document_upload_is_open(name));

create policy iwd_storage_select_admin_open_read on storage.objects for select to authenticated
  using (bucket_id = 'worker-verification-documents' and public.worker_document_admin_read_is_open(name));
```

Helpers (definer, `search_path = public, pg_temp`, execute for `authenticated` only, revoked from `anon`):
- `worker_document_upload_is_open(p_name text)`: a row exists with `object_name = p_name`, `worker_id = auth.uid()`, `status = 'awaiting_upload'`, `upload_expires_at > now()`, and the caller's `verification_status <> 'suspended'`.
- `worker_document_admin_read_is_open(p_name text)`: `is_super_admin()` and a row exists with `object_name = p_name`, `read_open_for = auth.uid()`, `read_open_until > now()`, `file_queued_at is null`.

Both return only a boolean, and a caller can get true only for their own slot or their own read window.

## 5. RPCs

All definer with `search_path = public, pg_temp`. Refusals use written sentences with codes in `databaseRefusalCodes`, so clients show them.

**Washer**
- `begin_worker_document_upload(p_document_type text)` returns `(document_id uuid, object_name text)`. Needs role `worker`, an `independent_workers` row, not suspended, a known type, and at most 10 slots per rolling 24 hours (23514). Locks the worker row. Marks any open slot of that type `abandoned` and queues its name. The server builds the path. **There is no filename parameter anywhere.**
- `submit_worker_document_upload(p_document uuid)` returns the row's safe columns. Must be the caller's own `awaiting_upload` row. Reads `storage.objects` by bucket and name and refuses if missing. Requires `metadata->>'mimetype'` to be exactly `image/jpeg` or `image/png`, which refuses the `; charset=` form from F5, and size above 0. Stores type, size and `version`. An older `submitted` or `rejected` row of that type becomes `superseded` with its file queued. An `approved` row stays. Audits `independent_worker_document.submitted`.
- `my_worker_documents()` returns one row per active type (left join on latest row): `document_type, label, instructions, is_required, document_id, status, submitted_at, reviewed_at, review_reason, has_approved_copy`. No path, no reviewer.

**Admin** (each starts with `b2c_require_super_admin`)
- `admin_worker_document_overview()` returns `(documents_to_review, files_waiting_for_removal, oldest_file_waiting_since)`.
- `admin_worker_documents(p_worker uuid)`: that washer's rows, or all `submitted` rows when null, limit 200. No path. Metadata only, so no file read and no audit.
- `admin_open_worker_document(p_document uuid)` returns `(object_name, content_type, read_open_until)`. Refuses `awaiting_upload`, `abandoned` and queued files. Sets the read window to 60 seconds and writes `independent_worker_document.opened` to the audit log **in the same transaction, before the window can be used**. The client then calls `createSignedUrl(name, 60, { download: '<type>.jpg' })`.
- `admin_review_worker_document(p_document uuid, p_decision text, p_reason text)`, decisions `approved` or `rejected`:
  - Locks worker then document.
  - Approving needs status `submitted`, `read_open_for = auth.uid()` (this admin opened it, D-113), and the object's current `version` equal to `object_version`. Any older approved row of that type becomes `superseded` first, with its file queued.
  - Rejecting needs a reason of 10 to 500 characters and accepts `submitted` or `approved`. If an approved required document is rejected, no other approved copy remains, and the washer is `verified`, it calls `admin_review_independent_worker(worker, 'pending', reason)`, so the D-92 path runs (section 6).
  - Notifies with fixed text. Approval never changes the washer's status (D-112).

**Gate:** `admin_review_independent_worker` keeps its signature, so its ACL stays. After `b2c_require_super_admin` and the status check it locks the worker row, then:
- `p_status = 'verified'`: refuses with 23514, `Approve every required document before verifying this washer.`, unless at least one required type exists and each has an `approved` row. Zero required types fails closed.
- `p_status in ('rejected', 'suspended')`: needs a note of 10 to 500 characters (23514).
- Withdrawal moves into the internal `independent_worker_withdraw_from_work(p_worker uuid, p_actor_kind text) returns jsonb`, unchanged in behaviour and audit counts.

**Trusted file job** (execute for `service_role` only; not on the `authenticated` list)
- `worker_document_files_claim(p_limit integer)`: marks expired slots `abandoned`; queues any bucket object with no live row or a row in `abandoned`, older than 3 hours so late tokens (F7) are caught; returns up to `p_limit` names, oldest first, and bumps `attempts`.
- `worker_document_files_confirm_removed(p_names text[])`: **for each name, only if no `storage.objects` row remains**, deletes the queue row, stamps `file_removed_at` on any surviving document row, and audits the count. Returns the count confirmed. A false report removes nothing.

**Internal, revoked from every client role:** `independent_worker_withdraw_from_work`, `independent_workers_reset_unevidenced`, the delete trigger function.

**Audit payload keys, all checked against F17:** `document_type`, `decision`, `size_kb`, `verification_status`, `offers_closed`, `bookings_returned_to_search`, `started_jobs_left`. The subject id is the document id. Never a path, filename, reason or byte count.

## 6. State machines

**Document**

| From | To | Who and condition |
|---|---|---|
| (new) | awaiting_upload | Washer, `begin`, not suspended, under the cap |
| awaiting_upload | submitted | Washer, `submit`, object present with an exact allowed type |
| awaiting_upload | abandoned | Washer starts again for that type, or the job after expiry |
| submitted | approved | Super admin who opened it, object version unchanged |
| submitted | rejected | Super admin, reason required |
| submitted, rejected | superseded | System, when the washer submits a newer one of that type |
| approved | superseded | System, when a newer one of that type is approved |
| approved | rejected | Super admin, reason required (revocation) |

Terminal: `superseded`, `abandoned`. Their files are queued for removal. Any row is deleted by cascade on account deletion, and the trigger queues its file.

**Washer verification** (the status set is unchanged)

| From | To | Who and condition |
|---|---|---|
| pending, rejected, suspended | verified | Super admin, every required document approved |
| verified | pending | Super admin with optional note, or automatically when a required approved document is revoked |
| any other | rejected, suspended | Super admin, reason of 10 to 500 characters |
| rejected, suspended | pending | Super admin |

**Effects on work:**
- Replacing an approved document changes nothing. The washer stays verified on the old approved copy until the new one is approved; if the new one is rejected, the old one stands (D-110).
- Losing verification runs the existing path: offers close, `accepted` and `worker_on_the_way` return to search through `service_booking_requeue` with that washer excluded, `arrived` and `in_progress` stay for the admin, and details are masked (D-92).
- No expiry exists (D-114), so nothing changes status on a timer.

**Who can upload:** `pending`, `rejected` and `verified` washers can. `suspended` washers cannot, and they can still read their documents, reasons and status. An admin moves them to `pending` to allow uploads (D-111). Uploading never changes washer status.

**Reason display:** per-document `review_reason` and the account's `verification_note` both appear on web and mobile. Admin inputs state that the washer will see the text.

## 7. Answers to the brief

1. **Required types:** `government_id` and `selfie`, as a seeded table with `is_required`. A new type needs one SQL insert, not a code change. Adding a required type does not affect washers already verified, and is checked at the next verify. This is a product default, not a statement of any Philippine requirement (B2C7-L1).
2. **Existing verified washers lose verification.** Silent grandfathering would keep the exact hole this fixes. Migration b2cn calls `independent_workers_reset_unevidenced()`: each `verified` washer with an incomplete approved set goes to `pending` with a washer-readable note, is withdrawn from work with actor `system`, and is audited as `independent_worker.verification_reset`. Production has no B2C data, so this should touch nothing there. The function stays, revoked, so pgTAP can prove it.
3. **Deletion:** see F10 to F12. Deleting the account removes the database rows at once, and nobody but the service role can then read the file. **The file itself stays until the trusted job removes it.** `supabase/functions/purge-worker-documents/`:
   - `purgeWorkerDocumentFiles.ts`: pure logic with an injected client. Claim, Storage API `remove` in batches, then confirm. Reports `confirmed` from the database, never from the `remove` response.
   - `index.ts`: Deno wrapper, `x-job-secret` checked with `secretsMatch` from `../send-service-push/secretsMatch.ts`.
   - **Testable locally:** the pure logic under Vitest, and that same logic with the real Storage API and local service key in the smoke, including bytes gone by download 404. **Not testable here:** the Deno wrapper, deployment and scheduling (F19). `DEPLOYMENT.md` must say so.
   - **Copy on web and mobile, truthful in all states:** "Your verification photos are queued for permanent removal from file storage. This doesn't happen instantly."
   - **OPERATIONS.md says:** account deletion queues files and does not remove them; removal happens only when the job runs; the job has not been deployed or scheduled anywhere; until it is, files stay in storage and the admin console shows the count and oldest date. Scheduling it is a launch requirement before any real washer uploads. No retention period is stated, because none has been decided.
4. **Suspended or rejected:** rejected can upload, suspended cannot, both see the reason (section 6). This answers the reason, display and notice parts of B2C6-L6. Note history and appeal stay open, so L6 stays OPEN with a pointer.
5. **Filenames and content:**
   - The path is `<uuid>/<uuid>`, built by the server and pinned exactly by the INSERT policy. No filename is taken, stored or sent, so traversal has no input.
   - Bucket allows only JPEG and PNG (D-115), so SVG, HTML and PDF give 415 (probed).
   - **A lying file:** the server cannot detect it (F5). Both clients sniff magic bytes in shared code before upload, for a friendly refusal only. If crafted bytes reach the bucket they are served as `image/jpeg`, the admin sees a broken image in `<img>`, and rejects.
   - The admin screen renders only through `<img>`. It never uses an iframe, object tag or `window.open`. Signed URLs always carry `download`, so a direct visit downloads rather than renders. The URL is not kept after closing the view. `download` can be stripped by someone holding the URL, which is why the bucket allow-list is the real control.
6. **Mobile:** section 9.
7. **Local stack:** the staged Storage service works for smoke tests (probed). No `config.toml` change: the migration creates the bucket, and the 50 MiB global limit sits above the bucket limit. Nothing new goes under `supabase/` except migrations, tests and the function folder, which contains no `.sql`. Smoke uses random names; `db reset` does not clear the file volume, which only matters locally.
8. **Pins:** section 11.
9. **B2B:** no effect. No change to `shop_verification_documents`, its bucket or policies, `public.bookings` or workforce tables. Storage policies are bucket-limited (F2). Shared additions only: three rows in pinned lists, one notification category. Shop documents keep flaws F3 and F15, including a `valid_government_id` type; recorded as a follow-up, not fixed here.

## 8. Migrations

| File | Contents | Est. lines |
|---|---|---|
| `2026_11_06_b2cl_worker_documents_schema.sql` | Three tables, indexes, grants, trigger, seed, bucket, two helpers, two policies, notification category | 170 |
| `2026_11_06_b2cm_worker_document_rpcs.sql` | The three washer RPCs and four admin RPCs | 260 |
| `2026_11_06_b2cn_worker_verification_gate.sql` | Withdrawal helper, gate in `admin_review_independent_worker`, reset function and its call, job functions | 200 |

The names sort after b2ck, so the stager assigns `20261106000012` to `...14`. No staging or replay reason requires other names. If a file nears 350 lines, move a whole function to `b2co_*` and extend the pins.

**Rollback:** each file ends with a commented ROLLBACK block, reverse order n to l. n restores `admin_review_independent_worker` from b2ci and drops its functions. m drops RPCs. l drops policies, helpers, trigger, tables, category; **the bucket can be dropped only after the job or Storage API has emptied it**, because of `objects_bucketId_fkey` and F11. Irreversible: washers reset to `pending`, bookings returned to search, removed files.

## 9. Client changes

**Shared (`packages/shared`, no DOM or React; `ArrayBuffer` and `Uint8Array` only):**
- New `b2cRequest.ts`: move `B2cRequestError`, `toFailure`, `run`, `rows` and the value mappers out of `b2cApi.ts`, re-exported so public imports are unchanged. This takes `b2cApi.ts` (458 lines) closer to the limit but not under it. Move shared date and URL helpers to `b2cFormat.ts` to finish the split. Update `index.ts`.
- New `workerDocuments.ts`: `WORKER_DOCUMENT_MAX_BYTES`, `WORKER_DOCUMENT_READ_SECONDS = 60`, `workerDocumentTypeFromBytes(bytes)`, `workerDocumentStatusLabel`, and `createWorkerDocumentsApi(client)`, spread into `createB2cApi`.
- `uploadWorkerDocument(documentType, bytes)`: sniff, size check, `begin`, `storage.upload(name, bytes, { contentType: sniffed, upsert: false })`, `submit`. Maps 413 and 415 to written sentences. Takes no filename.
- `adminOpenWorkerDocument(id)`: the RPC, then `createSignedUrl` with 60 seconds and `download`.
- `B2cSupabaseClient` gains a structural `storage` member.

**Web:**
- New `features/b2c/worker/WorkerDocumentsPanel.tsx`: notice of who sees the files and why, one row per type with status and reason, file input with `accept="image/jpeg,image/png"`, using `file.arrayBuffer()`. Hidden upload control while suspended. Shown in the Setup tab of `IndependentWorkerPage.tsx`, above `WorkerSetupPanel`, once an account row exists. Save-profile-first message otherwise.
- `IndependentWorkerPage.tsx`: show `verificationNote` under the status text.
- New `features/b2c/admin/WorkerDocumentReview.tsx`: per-washer list, **Open** (RPC then `<img>`), approve, reject with a reason, broken-image message suggesting rejection.
- `B2cOperationsPanel.tsx`: replace the one-click flow. **Verify** is enabled only when the listed required documents are approved, and the server still decides. Suspend gains a required reason. Show overview counts, including files waiting for removal.
- `DeleteAccountSection.tsx`: deletion copy from section 7.
- Check any web content security policy allows Storage images in `img-src`.

**Mobile:**
- Install with `cd mobile && npx expo install expo-image-picker`, which should resolve to `~58.0.10` (F20). Not `expo-document-picker`: images only (D-115).
- `app.config.ts`: add the plugin with `photosPermission` and `cameraPermission` strings and `microphonePermission: false`. **This needs a new native build**; it can't ship over the air.
- New `mobile/src/features/worker/WorkerDocumentsSection.tsx`, mounted in `app/worker/setup.tsx`. **Take photo** and **Choose photo**, `mediaTypes: ['images']`, `quality: 0.7`, `exif: false`.
- Bytes: `const bytes = await (await fetch(asset.uri)).arrayBuffer()`. **Do not use `.blob()`**, FormData or the picker's reported MIME type (F20). The content type comes from sniffing. HEIC is refused with a clear message.
- `mobile/app/worker/index.tsx`: show the reason. `AccountScreen.tsx`: deletion copy.

**What mobile can and can't prove here:**
- **Testable:** Jest logic tests of shared sniffing and the upload sequence with a fake client; `tsc`; browser preview through `b2c-mobile-preview.mjs`, where the picker uses a file input; the shared path through the real Storage API in the smoke.
- **Stays listed as unverified:** camera and library on a real device, permission prompts, `fetch(file://)` on iOS, whether Android picker results are always `file://` (`content://` has no handling in Expo's fetch), whether iOS returns JPEG rather than HEIC at `quality: 0.7`, memory on low-end phones, and `expo-doctor` until re-run. `expo-image-picker` was not installed during planning, so its source was not read.

**Docs:** `OPERATIONS.md` (reviewing documents, verify rule, reasons, deletion, job), `ARCHITECTURE.md`, `DEPLOYMENT.md` (`eleven` becomes `fourteen`; job deployment, marked never run), `FINAL_REPORT.md` line 49, `LEGAL_REVIEW_REGISTER.md`, `mobile/README.md`, `LOOP.md` check table, root `STATE.md`, `DECISIONS.md`.

## 10. Tests

pgTAP runs as real roles against `storage.objects` directly, so it proves policies but not the Storage service; the smoke does that. New helper file `scripts/supabase-test/baseline/test_helpers_worker_documents.sql`: fixture object row as `postgres`, and a helper giving a washer approved documents.

`j19_b2c7_schema_and_storage_policies`: `bucket_is_private`, `bucket_limit_is_10_mib`, `bucket_allows_only_jpeg_and_png`, `bucket_policies_are_exactly_two`, `no_washer_select_update_delete_policy`, `insert_refused_without_open_slot`, `insert_refused_for_other_washers_folder`, `insert_refused_for_other_name_in_own_folder`, `insert_refused_after_slot_expires`, `insert_refused_for_suspended_washer`, `insert_refused_for_customer`, `select_refused_for_washer_own_file`, `select_refused_for_other_washer_guessed_path`, `select_refused_for_customer`, `select_refused_for_admin_without_open_window`, `select_allowed_for_admin_in_window`, `select_refused_after_window_ends`, `select_refused_for_other_admin_in_window`, `direct_table_writes_refused_every_client_role`, `direct_table_reads_refused_every_client_role`, `service_role_has_no_table_access`.

`j19_b2c7_upload_flow`: `begin_builds_server_path`, `begin_has_no_filename_argument`, `begin_refused_for_customer`, `begin_refused_for_owner`, `begin_refused_without_worker_row`, `begin_refused_for_unknown_type`, `begin_refused_when_suspended`, `begin_allowed_when_rejected`, `begin_refused_over_daily_cap`, `begin_again_abandons_old_slot`, `submit_refused_without_object`, `submit_refused_for_other_washers_row`, `submit_refused_with_charset_suffix`, `submit_refused_with_disallowed_type`, `submit_stores_type_and_size_from_storage`, `submit_supersedes_older_rejected`, `submit_keeps_approved_copy`, `my_documents_shows_reason`, `my_documents_shows_only_own`, `my_documents_has_no_path_column`.

`j19_b2c7_admin_review`: `open_is_audited`, `open_refused_for_non_admin`, `open_refused_for_customer`, `approve_refused_until_admin_opened_file`, `approve_refused_when_object_version_changed`, `approve_supersedes_old_approved_and_queues_file`, `reject_needs_reason`, `reject_reason_visible_to_washer`, `reject_notification_has_no_reason`, `reject_new_keeps_old_approved_and_verified`, `audit_payload_has_no_path_or_reason`, `audit_accepts_ten_mib_document`, `review_refused_for_washer_on_own_document`, `admin_lists_have_no_path_column`, `overview_counts_queue`.

`j19_b2c7_verification_gate`: `verify_refused_with_no_documents`, `verify_refused_with_one_of_two_approved`, `verify_refused_with_submitted_only`, `verify_refused_with_rejected_document`, `verify_refused_when_no_required_types_exist`, `verify_refused_for_customer`, `verify_refused_for_washer_on_self`, `verify_allowed_with_all_approved`, `optional_type_not_needed`, `suspend_needs_reason`, `reject_status_needs_reason`, `pending_allows_no_reason`, `replacing_approved_leaves_washer_verified`, `replacing_approved_leaves_jobs_alone`, `revoking_required_document_moves_to_pending`, `revoking_closes_offers`, `revoking_requeues_accepted_job`, `revoking_leaves_started_job`, `revoked_washer_masked_and_blocked`, `reset_demotes_verified_without_documents`, `reset_keeps_verified_with_documents`, `reset_requeues_unstarted_job`, `reset_is_audited`, `reset_note_visible_to_washer`, `internal_functions_not_callable_by_clients`.

`j19_b2c7_deletion_and_file_queue`: `deleted_account_rows_removed_file_queued`, `dashboard_style_user_delete_queues_file`, `queue_row_survives_account_deletion`, `delete_my_account_body_unchanged`, `deletion_refused_keeps_rows_and_queue_empty`, `claim_expires_old_slots`, `claim_queues_orphan_object_after_3_hours`, `claim_skips_recent_orphan`, `claim_skips_live_object`, `confirm_refuses_while_object_row_exists`, `confirm_deletes_queue_row_when_gone`, `confirm_stamps_surviving_row`, `job_functions_refused_for_authenticated`, `job_functions_refused_for_anon`, `job_functions_allowed_for_service_role`.

`j19_b2c7_callable_function_authorization`: one assertion per new callable function, for anon, customer, owner, washer and admin as relevant: `begin_upload_authorization`, `submit_upload_authorization`, `my_documents_authorization`, `admin_overview_authorization`, `admin_documents_authorization`, `admin_open_authorization`, `admin_review_document_authorization`, `upload_helper_true_only_for_own_open_slot`, `admin_read_helper_true_only_for_own_window`, plus `definer_functions_pin_search_path`.

**New `scripts/supabase-test/b2c7-api-smoke.mjs`**, real Storage API, `SMOKE_ORDER` gains `b2c7` after `b2c`, before `w13`, so `PASS (17 smokes)`:
- Flow: `washer_uploads_both_documents`, `washer_sees_status_not_file`, `admin_opens_with_signed_url_and_audit`, `signed_url_serves_image_as_attachment`, `signed_url_expires_after_60_seconds`, `admin_rejects_with_reason_washer_reads_it`, `reupload_after_rejection`, `verify_refused_until_all_approved`, `verify_succeeds_after_approval`.
- Attacks: `guessed_path_download_refused`, `guessed_path_signed_url_refused`, `upload_to_other_washers_folder_refused`, `upload_to_invented_name_in_own_folder_refused`, `traversal_path_refused`, `oversize_refused_413`, `svg_refused_415`, `html_refused_415`, `pdf_refused_415`, `lying_bytes_served_only_as_jpeg_with_attachment`, `upsert_over_submitted_refused`, `update_over_submitted_refused`, `upsert_signed_upload_url_refused`, `washer_remove_removes_nothing`, `non_admin_signed_url_refused`, `admin_signed_url_refused_without_open`, `customer_upload_refused`, `customer_read_refused`, `anon_refused`, `storage_schema_refused_through_postgrest`, `direct_table_write_refused`, `service_role_table_write_refused`.
- Late token: `late_signed_upload_token_file_is_swept`, using a TEST-ONLY backdate through `docker exec`, as in W6.
- Lifecycle: `suspended_washer_cannot_upload`, `revoke_requeues_booking_to_next_washer`, `deleted_washer_file_still_present_before_job`, `deleted_washer_file_unreadable_by_admin`, `job_removes_file_download_404`, `job_confirm_clears_queue`, `job_is_idempotent`.

**`b2c-api-smoke.mjs` stays near its current size by reusing a new `smoke-worker-documents.mjs` helper** that uploads and approves. `readyWorker` uses it before verifying (line 135).

**Web and mobile:**
- `sharedPackage.b2c.test.ts`: `workerDocumentTypeFromBytes` for JPEG, PNG, HTML, SVG, HEIC, PDF and empty; the upload sequence with a fake client; 413 and 415 messages; no filename parameter.
- New `WorkerDocumentsPanel.test.tsx`, `WorkerDocumentReview.test.tsx` (renders only `<img>`, reject needs a reason, URL cleared on close).
- `b2cScreens.test.tsx`: suspend needs a reason, note shown. `DeleteAccountSection.test.tsx`: copy says queued, and never says deleted or removed for files.
- New `purgeWorkerDocumentFiles.test.ts`: reports only database-confirmed counts, keeps going after one failed batch. `mobileLogic.test.ts`: same sniffing.

## 11. Pins, found by search

| File | Change |
|---|---|
| `j17_w16_authenticated_executable_function_list` | Add exactly nine, in collated position: `admin_open_worker_document(uuid)`, `admin_review_worker_document(uuid, text, text)`, `admin_worker_document_overview()`, `admin_worker_documents(uuid)`, `begin_worker_document_upload(text)`, `my_worker_documents()`, `submit_worker_document_upload(uuid)`, `worker_document_admin_read_is_open(text)`, `worker_document_upload_is_open(text)`. Update the header. Each has its own test above |
| `j17_database_constraints...` line 30 | Add the three tables to `pre_workforce`, or `j17_workforce_table_list_is_complete` fails. The anon list (line 182) must not change, so the helpers need an explicit anon revoke |
| `j19_b2c_authorization` | Add the three tables to `b2c_tables` with no privileges. Extend the definer regex (line 56) to cover the new names. Add internals to the not-callable list |
| `001_migration_replay` | Add three versions at line 90, header to 113, `replay_b2c7_*` for tables and bucket; update `plan(29)` |
| `j18_existing_booking_pricing...` line 35 | 110 becomes 113 |
| `j17_w12_notification_registry` | Count 40 to 41 (line 91), add to `j17r_expected` (line 87), scan counts `34,2,21` to the real new values (line 100) |
| `j19_b2c6_suspended_worker` | Lines 64 and 98 need 10-character reasons (one is too short, one is null). Line 110 needs approved-document fixtures, or `suspended_worker_not_reoffered_after_reverify` fails |
| `b2c-api-smoke.mjs` | Lines 135, 326, 332: documents before verifying, reasons when suspending |
| `b2cScreens.test.tsx` | Line 268 expects an empty suspend reason; update it and the mocks at lines 18 and 251 |
| `stage-local-workdir.mjs` line 41, `.test.mjs` line 256 | New helper file and its suffix. `stager_seeds_every_helper_file_in_order` is a real pin |
| `run-api-smokes.mjs` line 18 | Add `b2c7`, header comment |
| `docs/b2c/DEPLOYMENT.md:7` | Fourteen migrations |

Checked and needing no change: `j19_b2c_booking_engine:38` (still 42501 first), `replay_storage_policies_replaced` (by name), `j17_every_definer_function...` (regex fits `public, pg_temp`), `j17_no_set_config_wrapper_exposed` (new names avoid `config` and `setting`). Fixtures that set `verified` directly bypass the RPC by design. The builder must re-run this search and record the result: `grep -rnE "110|20261106000011|adminReviewWorker|admin_review_independent_worker" supabase/tests scripts frontend/src`. No test is removed or loosened.

## 12. Acceptance criteria

| # | Criterion | Command and expected result |
|---|---|---|
| 1 | Replay and all DB tests pass | `node scripts/supabase-test/run-db-tests.mjs` ends `Result: PASS`; at least 129 files; above 3580 tests |
| 2 | Real Storage flow and attacks | `node scripts/supabase-test/run-api-smokes.mjs` ends `PASS (17 smokes)`; `b2c7-api-smoke: ... 0 failed` |
| 3 | Stager | `node --test scripts/supabase-test/stage-local-workdir.test.mjs` passes |
| 4 | Web | `cd frontend && npm run lint && npm run build && npm test` exit 0; above 398 tests |
| 5 | Mobile | `cd mobile && npm run typecheck && npm test` exit 0; above 11 tests |
| 6 | Mobile dependency matches SDK | `cd mobile && npx expo install --check` exit 0, and `npm run doctor` recorded |
| 7 | Backend | `cd backend && pytest`: 4 pass |
| 8 | Gate in the database | `verify_refused_with_no_documents` passes through the RPC, and `verify_refused_until_all_approved` through the API |
| 9 | No committed migration edited | `git diff --diff-filter=MD --name-only 5a3f769 -- supabase/migrations` is empty |
| 10 | Size and rollback | `wc -l supabase/migrations/2026_11_06_b2c[l-n]_*.sql` each about 350 or fewer; `grep -L "ROLLBACK" supabase/migrations/2026_11_06_b2c[l-n]_*.sql` is empty; new source files about 350 or fewer |
| 11 | Deletion unchanged, file queued | `delete_my_account_body_unchanged` and `deleted_account_rows_removed_file_queued` pass |
| 12 | Honest copy | `grep -rn "queued for permanent removal" frontend/src mobile/src` finds web and mobile; `docs/b2c/OPERATIONS.md` contains `has not been deployed or scheduled` |
| 13 | Shared stays clean | `grep -nE "from .react|document\.|window\." packages/shared/src/workerDocuments.ts packages/shared/src/b2cRequest.ts` is empty |
| 14 | B2B untouched | `grep -nE "public\.bookings|shop_verification|shop-verification" supabase/migrations/2026_11_06_b2c[l-n]_*.sql` is empty; `git diff --name-only 5a3f769 -- frontend/src/infrastructure/repositories/SupabaseShopVerificationRepository.ts` is empty |
| 15 | No removed test; only pinned files modified | `git diff --diff-filter=D --name-only 5a3f769 -- supabase/tests scripts` is empty; `--diff-filter=M` on `supabase/tests` lists only section 11 files |
| 16 | Browser check | List below, recorded with results |

**Browser check** (`b2c-browser-seed.mjs`, `b2c-dev-server.mjs`, local stack, 375px and desktop; a synthetic test image only, never a real ID):
1. Washer sees both types, the notice, and the save-profile-first message before a profile exists.
2. Upload a JPEG and a PNG: status becomes under review. No file preview or link is offered.
3. An HTML file renamed `.jpg` and an SVG are refused with a written message. A 12 MB image is refused.
4. Admin **Verify** is unavailable with no approved documents.
5. Admin opens a document: the image shows in the page, and the audit log has one `opened` row with no path.
6. Pasting the signed URL into a new tab downloads, and does not render. After 60 seconds it fails.
7. Admin rejects with a reason. The washer sees that reason, plus a notification without it.
8. Re-upload, approve both, verify. The washer can go online.
9. Replace an approved document: washer stays verified and online.
10. Reject the approved required document: washer goes to pending, the reason shows, and an accepted job returns to search.
11. Suspend needs a reason. The suspended washer sees it, with no upload control.
12. Delete the washer account: copy says queued, the admin count rises, and running the job locally lowers it.
13. Mobile browser preview: steps 1, 2 and 7 work through the file input. Camera remains listed as unverified.

## 13. Decisions adopted by default

| ID | Decision |
|---|---|
| D-109 | Required documents are `government_id` and `selfie`, in a seeded table changed by human-run SQL. No admin UI. Fails closed if none are required |
| D-110 | Replacing an approved document leaves the washer verified on the old copy until the new one is approved. A rejected replacement changes nothing |
| D-111 | `pending`, `rejected` and `verified` washers may upload. `suspended` may not, and needs an admin move to `pending` |
| D-112 | Approving documents never verifies a washer. Verifying stays a separate admin action |
| D-113 | An admin must have opened a document before approving it. This proves the file was opened, not that it was examined |
| D-114 | No document expiry in this increment. The admin checks the visible date and can revoke. There is no scheduler to enforce expiry, and `expires_on` can be added later |
| D-115 | JPEG and PNG only, 10 MiB. No PDF, which removes active-document risk and a second picker package |
| D-116 | Existing verified washers without approved documents go to `pending` at migration. No grandfathering |
| D-117 | Rejected and suspended statuses need a 10 to 500 character reason, which the washer sees. Pending does not |
| D-118 | Admin reads go through a 60-second audited window enforced by RLS. The 60-second URL lifetime is set by our client and **not enforced by the server** (F8) |
| D-119 | Washers cannot read back their own files |
| D-120 | Superseded and abandoned files are queued for removal at once. Rejected files stay until replaced or the account is deleted |
| D-121 | Files are removed by a queue and a trusted job using the Storage API. Removal counts only when the database confirms the object row is gone |
| D-122 | Cap of 10 upload slots per washer per rolling 24 hours |

## 14. Legal items for `docs/b2c/LEGAL_REVIEW_REGISTER.md`

Every item is added as OPEN. No code or document claims compliance, and none of this states what Philippine law requires.

| ID | Item for review |
|---|---|
| B2C7-L1 | **Which documents, and whether to collect them (RA 10173).** ID and selfie are a product default. Review whether this collection is justified and proportionate, whether a lesser check would do, and whether any law requires or limits it |
| B2C7-L2 | **Notice and consent (RA 10173).** What washers must be told before upload, whether consent or another basis applies, and whether an acknowledgement must be recorded. None is recorded now |
| B2C7-L3 | **Retention (RA 10173).** No period is set for approved or rejected files, or for document rows. Review how long each is kept and after a washer stops working |
| B2C7-L4 | **Removal delay after deletion (RA 10173, store rules).** Files outlive the account until the job runs, and the job isn't scheduled. Review the acceptable delay and the deletion wording. Backups of removed files are not addressed |
| B2C7-L5 | **Admin access (RA 10173).** Any super admin can open any document. Reads are audited, but no purpose is recorded, the audit log keeps IDs after deletion, and a super admin with a custom client can mint a longer-lived link (D-118) |
| B2C7-L6 | **Security and vendor (RA 10173).** Files are in Supabase Storage, with no extra encryption by WashLink and no malware scan. Photos may hold location metadata that isn't stripped. Review storage location, processor terms and breach duties |
| B2C7-L7 | **Automated loss of work (labor).** Revoking a document removes unstarted work at once. Refusal or revocation has a reason but no appeal, and there is no contact channel. Related: B2C6-L5, B2C6-L6 |
| B2C7-L8 | **What verification means.** A verified badge means an admin approved these files, not that identity was proven. Review any customer-facing wording before using the word |
| B2C7-L9 | **Shop documents.** Shop `valid_government_id` files have the same deletion gap and no audited read (F3, F15). B2B was left unchanged, and needs its own review |

Update B2C6-L6 with a pointer only; it stays OPEN. The register header's reviewer line needs these items added.

## 15. Risks

- **Client-chosen URL lifetime (F8).** A compromised admin token can mint a long-lived link during an open window, and it can't be revoked short of rotating the signing secret. Fixing it needs a server-side signer with no admin SELECT policy. That is the one architectural question for the owner.
- **Window versus read.** One audited open allows repeated reads for 60 seconds. "Every read audited" means every open.
- **Job not running.** Government IDs stay in storage indefinitely. This must block real washer uploads at launch, and only a person and the runbook enforce it. The admin count makes it visible.
- **Bytes unchecked.** Non-image files can sit in the bucket, up to 10 MiB and 10 per day, until rejected. They are never rendered as active content.
- **Metadata.** EXIF, including GPS, isn't stripped on web, and `exif: false` on mobile does not prove removal from the file.
- **Production parity, unverified:** `rolbypassrls` for `postgres`, `storage.objects.version`, `protect_delete`, Storage behaviour in F6 to F9 and any platform upload limit. Local is v1.88.0. The submit and approve checks fail closed if they differ. Re-run the attack checks on any staging before real uploads.
- **Migration on hosted:** creating policies on `storage.objects` (owned by `supabase_storage_admin`) follows the shop migrations, but was only proven locally.
- **Audit activity feed:** `my_workforce_activity` may list `independent_worker_document.*` rows to the washer, including that an admin opened a file. Not read in full during planning. The builder must decide this with a test.
- **Cost of reasons:** requiring a reason slows an urgent suspension slightly. Accepted.
- **Fabrication check:** nothing here creates a signature, certification, compensation or compliance claim. Upload tests use synthetic images only.
