# B2C-7 database build log

Branch `feature/b2c`, base `5a3f769`. Database engineer. Local Supabase only. Nothing committed.

## Progress
- Started: read PLAN.md, began surveying existing migrations and tests.
- Wrote migrations b2cl, b2cm, b2cn and test_helpers_worker_documents.sql (not yet replayed).
- Applied section 11 pins (j17 list, j17 constraints, j19_b2c_authorization, 001 replay, j18, j17_w12 registry, j19_b2c6, stager and test, run-api-smokes, DEPLOYMENT.md). Existing 123 files replay and pass with them.
- Wrote j19_b2c7_schema_and_storage_policies, j19_b2c7_upload_flow, j19_b2c7_admin_review (first run pending).
- Wrote j19_b2c7_verification_gate, j19_b2c7_deletion_and_file_queue, j19_b2c7_callable_function_authorization; all six new pgTAP files pass when run directly against the local DB.
- Wrote supabase/functions/purge-worker-documents/{purgeWorkerDocumentFiles.ts,index.ts} and frontend/src/features/b2c/purgeWorkerDocumentFiles.test.ts.
- Wrote scripts/supabase-test/smoke-worker-documents.mjs and b2c7-api-smoke.mjs; updated b2c-api-smoke.mjs (first run pending).
- Tidied b2c7-api-smoke.mjs and made the claim skip locked slots; both suites re-run after that. Results below are from after the last code edit. Only this log was written afterwards.

## Pin search (PLAN section 11), after the build
`grep -rnE "110|20261106000011|adminReviewWorker|admin_review_independent_worker" supabase/tests scripts frontend/src`, with unrelated hits (CSS, a rating class name, stager fake timestamps, a w13 md5) and this increment's new files left out:
```
supabase/tests/database/001_migration_replay.test.sql:87:            ('20261030000007'), ('20261030000008'), ('20261030000009'), ('20261103000001'),
supabase/tests/database/001_migration_replay.test.sql:88:            ('20261104000001'), ('20261104000002'), ('20261106000001'), ('20261106000002'),
supabase/tests/database/001_migration_replay.test.sql:89:            ('20261106000003'), ('20261106000004'), ('20261106000005'), ('20261106000006'),
supabase/tests/database/001_migration_replay.test.sql:90:            ('20261106000007'), ('20261106000008'), ('20261106000009'), ('20261106000010'), (
supabase/tests/database/001_migration_replay.test.sql:91:            ('20261106000012'), ('20261106000013'), ('20261106000014') $$,
supabase/tests/database/j17_w16_authenticated_executable_function_list.test.sql:34:admin_review_independent_worker(uuid, text, text)
supabase/tests/database/j19_b2c6_suspended_worker.test.sql:64:select public.admin_review_independent_worker(pg_temp.id('wa'), 'suspended', 'Paused whi
supabase/tests/database/j19_b2c6_suspended_worker.test.sql:98:select public.admin_review_independent_worker(pg_temp.id('wa'), 'rejected', 'Rejected wh
supabase/tests/database/j19_b2c6_suspended_worker.test.sql:103:select public.admin_review_independent_worker(pg_temp.id('wa'), 'pending', null) is not
supabase/tests/database/j19_b2c6_suspended_worker.test.sql:112:select public.admin_review_independent_worker(pg_temp.id('wa'), 'verified', null) is no
supabase/tests/database/j19_b2c_booking_engine.test.sql:38:select throws_ok($$ select public.admin_review_independent_worker((select w1 from ids), 've
scripts/supabase-test/b2c-api-smoke.mjs:137:  await adminPerson.api.adminReviewWorker(worker.id, 'verified', '')
scripts/supabase-test/b2c-api-smoke.mjs:328:  await superAdmin.api.adminReviewWorker(workerD.id, 'suspended', 'Suspended by this smoke test')
scripts/supabase-test/b2c-api-smoke.mjs:334:  await superAdmin.api.adminReviewWorker(workerC.id, 'suspended', 'Suspended by this smoke test')
frontend/src/features/b2c/admin/B2cOperationsPanel.tsx:132:              {worker.verification_status !== 'verified' ? <Button size="sm" onClick={(): v
frontend/src/features/b2c/admin/B2cOperationsPanel.tsx:136:                  <Button size="sm" variant="danger" onClick={(): void => { setConfirmSuspe
frontend/src/features/b2c/b2cScreens.test.tsx:18:  createBooking: vi.fn(), adminSummary: vi.fn(), adminCatalog: vi.fn(), adminWorkers: vi.fn(), adminB
frontend/src/features/b2c/b2cScreens.test.tsx:263:    api.adminReviewWorker.mockResolvedValue(undefined)
frontend/src/features/b2c/b2cScreens.test.tsx:266:    expect(api.adminReviewWorker).not.toHaveBeenCalled()
frontend/src/features/b2c/b2cScreens.test.tsx:268:    expect(api.adminReviewWorker).toHaveBeenCalledWith('w1', 'suspended', '')
```
Not changed, for the frontend engineer: `b2cScreens.test.tsx` (still expects an empty suspend reason) and the `B2cOperationsPanel.tsx` calls, which now get a refusal from the database.

## Results
### node scripts/supabase-test/run-db-tests.mjs
```
All tests successful.
Files=129, Tests=3748, 31 wallclock secs ( 0.55 usr  0.30 sys +  0.83 cusr  1.04 csys =  2.72 CPU)
Result: PASS
```
### node scripts/supabase-test/run-api-smokes.mjs
```
w2-api-smoke: 48 passed, 0 failed
w3-api-smoke: 33 passed, 0 failed
w4-api-smoke: 43 passed, 0 failed
w5-api-smoke: 39 passed, 0 failed
w6-api-smoke: 40 passed, 0 failed
w7-api-smoke: 38 passed, 0 failed
w8-api-smoke: 30 passed, 0 failed
w9-api-smoke: 34 passed, 0 failed
w10-api-smoke: 39 passed, 0 failed
w11-api-smoke: 36 passed, 0 failed
w14-api-smoke: 33 passed, 0 failed
w12-api-smoke: 22 passed, 0 failed
w15-api-smoke: 17 passed, 0 failed
w16-api-smoke: 17 passed, 0 failed
b2c-api-smoke: 72 passed, 0 failed
b2c7-api-smoke: 50 passed, 0 failed
w13-api-smoke: 17 passed, 0 failed
run-api-smokes: PASS (17 smokes)
smokes-exit 0
```
### Other checks, run before the final smoke tidy (those edits touched no file these cover)
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: 19 pass, 0 fail.
- `npx vitest run purgeWorkerDocumentFiles.test.ts pushWebhookSecret.test.ts`: 11 pass. eslint clean on the new test.

# B2C-7 client build log (web, mobile, shared, docs)

## Progress
- Started client build: read PLAN sections 9-15 and the DB log.
- Shared package split: b2cTypes, b2cRequest, b2cFormat; new workerDocuments.ts. expo-image-picker installed (~58.0.10) and its source read.
- Web washer panel, admin review, suspend reason, deletion copy, mobile section and picker written (tests next).
- Tests written: sharedWorkerDocuments, WorkerDocumentsPanel, WorkerDocumentReview, mobile workerDocuments; smoke helper moved to the shared client.
- Docs updated (OPERATIONS, DEPLOYMENT, ARCHITECTURE, FINAL_REPORT, LEGAL_REVIEW_REGISTER, mobile/README). Next: full verification.
- Android and web bundles compile with expo-image-picker (expo export, EXPO_NO_DOTENV=1). expo-doctor 20/20, expo install --check clean. No browser automation exists in the repo, so the section 12 browser check is not run by this session.

## Client build notes
- Source reading of expo-image-picker ~58.0.10: iOS passes HEIC through raw even at quality 0.7 (ImageUtils.swift), so Compatible mode is requested and HEIC is still refused. Android always returns file:// (MediaHandler.kt) but reports the source file's size, so asset.fileSize is not used. The library needs no permission prompt; the camera does. Expo fetch gives status 200 for file:// on iOS (NativeResponse.swift) and Android (interceptor). No browser stand-in was needed: the picker has its own web implementation.
- Web content security policy: none exists in frontend/ or render.yaml, so img-src needs no change.
- Moved the new admin washer tests out of b2cScreens.test.tsx into admin/WasherVerificationCard.test.tsx to keep that file near the size limit. Waiting to run the final verification.

## Final client results (after the last source, test and doc edit; only this log section was written afterwards)
```
Files=129, Tests=3748, 29 wallclock secs ( 0.53 usr  0.23 sys +  0.80 cusr  0.98 csys =  2.54 CPU)
Result: PASS
db-exit 0
b2c-api-smoke: 72 passed, 0 failed
b2c7-api-smoke: 56 passed, 0 failed
run-api-smokes: PASS (17 smokes)
smokes-exit 0
api-smokes other: 15 w* smokes with 0 failed
lint-exit 0
✓ built in 510ms
build-exit 0
 Test Files  162 passed (162)
      Tests  493 passed (493)
test-exit 0
tsc-exit 0
Test Suites: 2 passed, 2 total
Tests:       24 passed, 24 total
jest-exit 0
20/20 checks passed. No issues detected!
doctor-exit 0
Dependencies are up to date
check-exit 0
ℹ pass 19
ℹ fail 0
stager-exit 0
4 passed, 1 warning in 0.48s
backend-exit 0
```

## Fix cycle 1 (coordinator's six findings)
Findings verified against the code before fixing. Earlier results above are from before this cycle.

### Probe: storage.operation() on local Storage v1.88.0
`storage.operation()` exists (owner `supabase_storage_admin`, reads the `storage.operation` setting, executable by authenticated and anon). Method: a throwaway bucket with permissive policies on all four commands, each calling a logging function that raised a WARNING with `storage.operation()`, read back from `docker logs`. The first attempt logged to a table and lost every INSERT row, because Storage rolls back its upload permission check, so WARNING was used instead. S3 user-session form: access key `stub` (TENANT_ID), secret anon key, session token the user's JWT. Actual output, as route, result, and policy=operation:
```
status keys present: S3_PROTOCOL_ACCESS_KEY_ID,S3_PROTOCOL_ACCESS_KEY_SECRET,S3_PROTOCOL_REGION,STORAGE_S3_URL
upload (POST /object)          | ok                         | INSERT=storage.object.upload
upload upsert                  | ok                         | INSERT=storage.object.upload ; SELECT=storage.object.upload ; UPDATE=storage.object.upload
update (PUT /object)           | ok                         | INSERT=storage.object.upload_update ; SELECT=storage.object.upload_update ; UPDATE=storage.object.upload_upd
download (GET auth)            | ok                         | SELECT=storage.object.get_authenticated
HEAD /object/authenticated     | 200                        | SELECT=object.head_authenticated_info
info                           | ok                         | SELECT=object.get_authenticated_info
exists                         | ok                         | SELECT=object.head_authenticated_info
createSignedUrl                | ok                         | SELECT=storage.object.sign
createSignedUrl download       | ok                         | SELECT=storage.object.sign
createSignedUrls               | ok                         | SELECT=storage.object.sign_many
list                           | ok                         | SELECT=storage.object.list
createSignedUploadUrl          | ok                         | INSERT=storage.object.sign_upload_url
uploadToSignedUrl              | ok                         | (no policy check ran)
copy                           | ok                         | SELECT=storage.object.copy ; INSERT=storage.object.copy
move                           | ok                         | SELECT=storage.object.move ; UPDATE=storage.object.move
remove                         | ok                         | DELETE=storage.object.delete_many ; SELECT=storage.object.delete_many
TUS create                     | 201                        | INSERT=storage.tus.upload.create
TUS patch                      | 204                        | INSERT=storage.tus.upload.part
S3 PUT (user session)          | 200                        | INSERT=storage.s3.upload ; SELECT=storage.s3.upload
S3 GET (user session)          | 200 ����                | SELECT=storage.s3.object.get
S3 DELETE (user session)       | 204                        | DELETE=storage.s3.object.delete ; SELECT=storage.s3.object.delete
objects left: c.jpg,t.jpg,s3.jpg
cleanup check (policies, function, table, bucket): 0,0,0,0
```
Cleanup check 0,0,0,0 means no probe policy, function, table or bucket was left. Findings: the download route and the sign routes set different values, so the allow-list works. `uploadToSignedUrl` runs no policy at all, which is why a minted token could land late. S3 with a user session is reachable locally and went through the permissive policies.
- Applied the fix cycle's migration and pgTAP edits (first run pending).
- Applied the fix cycle's smoke edits: new route attacks and race file, flag switch in helpers, seed turns uploads on.
- Updated D-118, D-120 and D-122, added D-123 and D-124, and corrected ARCHITECTURE, OPERATIONS, DEPLOYMENT and the legal register.

### Fix cycle 1 results, after the last code edit (only this log was written afterwards)
#### node scripts/supabase-test/run-db-tests.mjs
```
All tests successful.
Files=129, Tests=3776, 29 wallclock secs ( 0.55 usr  0.22 sys +  0.75 cusr  1.04 csys =  2.56 CPU)
Result: PASS
```
#### node scripts/supabase-test/run-api-smokes.mjs
The runner stops at b2c7 because of one check that waits on the frontend change: `shared_client_open_downloads_image`. `shared.adminOpenWorkerDocument` still calls createSignedUrl, which the policy now refuses.
```
w2-api-smoke: 48 passed, 0 failed
w3-api-smoke: 33 passed, 0 failed
w4-api-smoke: 43 passed, 0 failed
w5-api-smoke: 39 passed, 0 failed
w6-api-smoke: 40 passed, 0 failed
w7-api-smoke: 38 passed, 0 failed
w8-api-smoke: 30 passed, 0 failed
w9-api-smoke: 34 passed, 0 failed
w10-api-smoke: 39 passed, 0 failed
w11-api-smoke: 36 passed, 0 failed
w14-api-smoke: 33 passed, 0 failed
w12-api-smoke: 22 passed, 0 failed
w15-api-smoke: 17 passed, 0 failed
w16-api-smoke: 17 passed, 0 failed
b2c-api-smoke: 72 passed, 0 failed
  NOT OK shared_client_open_downloads_image -> This document could not be opened. Try again.
b2c7-api-smoke: 72 passed, 1 failed
run-api-smokes: FAIL at b2c7 (exit 1)
smokes-exit 1
```
#### node scripts/supabase-test/w13-api-smoke.mjs, run alone because the runner did not reach it
```
w13-api-smoke: 17 passed, 0 failed
w13-exit 0
```
#### node scripts/supabase-test/b2c7-api-smoke.mjs, run alone for its result notes
```
NOT OK shared_client_open_downloads_image -> This document could not be opened. Try again.
note   tus create on own open slot: 403 new row violates row-level security policy
note   s3 put on own open slot: 403 <?xml version="1.0" encoding="UTF-8" standalone="yes"?><Error><Resource>worker-verification-documents/0527ba1e-b80d-46ff-9c30-920bc83a1ee8/743abb08-acaa-4500-a505-7c956071a3f8</Resource><Code>AccessDenied</Code><Message>
note   s3 get in admin window: 404 <?xml version="1.0" encoding="UTF-8" standalone="yes"?><Error><Resource>worker-verification-documents/0527ba1e-b80d-46ff-9c30-920bc83a1ee8/743abb08-acaa-4500-a505-7c956071a3f8</Resource><Code>NoSuchKey</Code><Message>Obj
note   s3 delete of own file: 403 <?xml version="1.0" encoding="UTF-8" standalone="yes"?><Error><Resource>worker-verification-documents/0527ba1e-b80d-46ff-9c30-920bc83a1ee8/743abb08-acaa-4500-a5
note   concurrent upload: fast error=none; slow RESULT 400 {"statusCode":"409","error":"Duplicate","message":"The resource already exists","code":"KeyAlreadyExists"}
note   slow upload into a slot closed mid-flight: RESULT 400 {"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy","code":"AccessDenied"}; file landed=false; submit=55000
b2c7-api-smoke: 72 passed, 1 failed
b2c7-exit 1
```
Other checks, before the last doc edit: stager test 19 pass; vitest on sharedWorkerDocuments, purgeWorkerDocumentFiles and WorkerDocumentReview 71 pass.

Race result: a slow upload that had started when a fast one finished and was submitted gets 409 at its final insert, so the swap is ruled out on v1.88.0. A slow upload whose slot closes mid-flight gets 403, because the policy is evaluated again at the final insert, and no file lands.
- Fix cycle 1 (clients and copy) started.
- Fix cycle 1: applied download-based open, blob URL lifecycle, copy fixes, cacheControl, cache cleanup, docs and legal items (checks pending). expo-file-system ~58.0.13 installed as a direct dependency.
- Fix cycle 1: report counts set from expected values; the final run below must match them. Content security policy: none exists (searched frontend, mobile, render.yaml, compose.yaml), so no img-src change is needed. The client can't tell whether uploads are enabled without an RPC change (platform_settings has no client grant and my_worker_documents doesn't return it), so the washer screen shows the database refusal.

## Client fix cycle 1 results (after the last source, test and doc edit; only this section was written afterwards)
```
Files=129, Tests=3776, 42 wallclock secs ( 0.91 usr  0.39 sys +  1.09 cusr  1.29 csys =  3.68 CPU)
Result: PASS
db-exit 0
w2-api-smoke: 48 passed, 0 failed
w3-api-smoke: 33 passed, 0 failed
w4-api-smoke: 43 passed, 0 failed
w5-api-smoke: 39 passed, 0 failed
w6-api-smoke: 40 passed, 0 failed
w7-api-smoke: 38 passed, 0 failed
w8-api-smoke: 30 passed, 0 failed
w9-api-smoke: 34 passed, 0 failed
w10-api-smoke: 39 passed, 0 failed
w11-api-smoke: 36 passed, 0 failed
w14-api-smoke: 33 passed, 0 failed
w12-api-smoke: 22 passed, 0 failed
w15-api-smoke: 17 passed, 0 failed
w16-api-smoke: 17 passed, 0 failed
b2c-api-smoke: 72 passed, 0 failed
b2c7-api-smoke: 73 passed, 0 failed
w13-api-smoke: 17 passed, 0 failed
run-api-smokes: PASS (17 smokes)
smokes-exit 0
ok     shared_client_open_downloads_image
b2c7-api-smoke: 73 passed, 0 failed
b2c7-exit 0
lint-exit 0
✓ built in 1.06s
build-exit 0
 Test Files  162 passed (162)
      Tests  508 passed (508)
test-exit 0
tsc-exit 0
Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
jest-exit 0
20/20 checks passed. No issues detected!
doctor-exit 0
Dependencies are up to date
check-exit 0
```

## Fix cycle 2 (tests only; VERDICT.md M1 to M3, N2 to N4, S1)
No migration changed in this cycle.

### Items 1 and 2: new assertions
In `j19_b2c7_callable_function_authorization`, plan 10 to 16:
- `upload_helper_false_once_slot_left_awaiting` (2 assertions): the slot's own unexpired row, not suspended, in each of the six statuses. Only `awaiting_upload` is true.
- `admin_read_helper_false_for_demoted_admin` (2): true in the window, false once the role changes.
- `admin_read_helper_false_once_file_is_queued` (2): true in the window, false once `file_queued_at` is set.

In `smoke-worker-document-routes.mjs`: `slow_upload_into_closed_slot_refused_403`, asserting the status, the row-level security message and no file, where this was only printed as a note.

### Item 3: mutation runs
Each ran in a transaction that was rolled back, with the test file's own `begin` and `rollback` stripped. Actual output:
```
control: the real functions unchanged
  ok=16 not_ok=0 failed: -
control: same text as the migration, status guard kept
  ok=16 not_ok=0 failed: -
control: same text as the migration, both read conditions kept
  ok=16 not_ok=0 failed: -
M1: b2cl:153 removed, d.status = 'awaiting_upload'
  ok=15 not_ok=1 failed: upload_helper_false_once_slot_left_awaiting
M2: b2cl:165 removed, is_super_admin()
  ok=15 not_ok=1 failed: admin_read_helper_false_for_demoted_admin
M3: b2cl:167 removed, file_queued_at is null
  ok=15 not_ok=1 failed: admin_read_helper_false_once_file_is_queued
functions unchanged afterwards: true
```
The smoke check was also run against the M1 mutation. A transaction can't cover this, because Storage uses its own connections, so the mutated helper was committed on the local stack and the next `run-db-tests` reset removed it. Actual output:
```
note   slow upload into a slot closed mid-flight: RESULT 200 {"Key":"worker-verification-documents/5ae5ab6b-30ac-440a-a14c-2b56258d1c1a/bcdcfab2-03c9-4ec7-afee-07ae7b37a6f4","Id":"ba7296be-c781-4121-a4cc-28e7cb57047f"}; file landed=true; submit=55000
NOT OK slow_upload_into_closed_slot_refused_403 -> RESULT 200 {"Key":"worker-verification-documents/5ae5ab6b-30ac-440a-a14c-2b56258d1c1a/bcdcfab2-03c9-4ec7-afee-07ae7b37a6f4","Id":"ba7296be-c781-4121-a4cc-28e7cb57047f"}; landed=true
b2c7-api-smoke: 73 passed, 1 failed
```
With the guard removed, the in-flight upload really does land a file, and only the new check fails.

### Item 4: three checks tightened (VERDICT N3)
Names unchanged. Each now needs the actual refusal, where before any error passed:
- `upload_to_other_washers_folder_refused`: statusCode 403, row-level security message, no object at that name.
- `customer_upload_refused`: both uploads 403 with that message, and neither object exists.
- `anon_refused`: upload 403 with that message and no object; download 404 with no data; `my_worker_documents` and `begin_worker_document_upload` both 42501.

### Item 5: file size
Moved the whole `attacks` group to `scripts/supabase-test/smoke-worker-document-attacks.mjs` (77 lines), exported as `pathAndTypeAttacks`. `b2c7-api-smoke.mjs` is now about 322 lines. No check removed or renamed.

### Item 6: smoke checks replaced in fix cycle 1
**Six.** Five are plan section 10 names, which is what the verifier found. The sixth, `shared_client_open_serves_image_as_attachment`, was never in the plan: the frontend engineer added it to the smoke after my first build, so a comparison with the plan can't find it, and the file being untracked means git can't show it either.

| Old name | New name | Reason |
|---|---|---|
| `admin_opens_with_signed_url_and_audit` | `admin_opens_and_downloads_with_audit` | D-118 refuses signing. Same audit check, and it now reads the file by download |
| `signed_url_serves_image_as_attachment` | `admin_download_serves_stored_type_and_bytes` | No link exists to serve. Checks type and exact bytes. There is no attachment header any more, so `<img>` only is now the control |
| `signed_url_expires_after_60_seconds` | `admin_window_closes_after_60_seconds` | The limit is now the server's window, not a link's lifetime. Really waits 62 seconds |
| `lying_bytes_served_only_as_jpeg_with_attachment` | `lying_bytes_served_only_as_jpeg` | No link to attach to. Weaker on the header, for the same reason |
| `late_signed_upload_token_file_is_swept` | `late_file_on_closed_slot_is_swept` | D-124 refuses the token at mint, asserted in this check. The file now lands with the service key, so this proves the sweep and not a washer's late landing. The real late landing was proved in the first build's run |
| `shared_client_open_serves_image_as_attachment` | `shared_client_open_downloads_image` | Not in the plan. The shared client now downloads and returns the bytes |

Added in that cycle with no old counterpart: `admin_download_refused_without_window`, `admin_signed_url_refused_with_open_window`.

### Item 7 and one small extra
- Added three rows to the check table in `loop/workforce/LOOP.md` (B2C-7 DB tests, API smoke, removal job logic) after the W16 row. No other row changed.
- Removed the leftover exclusion of a function that never existed from `uploads_flag_only_changed_by_human_sql` (VERDICT N7). This makes the check slightly stricter.

### Fix cycle 2 results, after the last code edit (only this log was written afterwards)
#### node scripts/supabase-test/run-db-tests.mjs
```
All tests successful.
Files=129, Tests=3782, 29 wallclock secs ( 0.50 usr  0.26 sys +  0.78 cusr  1.01 csys =  2.55 CPU)
Result: PASS
```
#### node scripts/supabase-test/run-api-smokes.mjs
```
w2-api-smoke: 48 passed, 0 failed
w3-api-smoke: 33 passed, 0 failed
w4-api-smoke: 43 passed, 0 failed
w5-api-smoke: 39 passed, 0 failed
w6-api-smoke: 40 passed, 0 failed
w7-api-smoke: 38 passed, 0 failed
w8-api-smoke: 30 passed, 0 failed
w9-api-smoke: 34 passed, 0 failed
w10-api-smoke: 39 passed, 0 failed
w11-api-smoke: 36 passed, 0 failed
w14-api-smoke: 33 passed, 0 failed
w12-api-smoke: 22 passed, 0 failed
w15-api-smoke: 17 passed, 0 failed
w16-api-smoke: 17 passed, 0 failed
b2c-api-smoke: 72 passed, 0 failed
b2c7-api-smoke: 74 passed, 0 failed
w13-api-smoke: 17 passed, 0 failed
run-api-smokes: PASS (17 smokes)
smokes-exit 0
```

## 2026-11-07: after the first verifier FAIL (orchestrator)

The verifier's FAIL was about records and test gaps, not behaviour. All 19 required mutation probes were caught and every attack it ran was refused.

- **Records:** `FINAL_REPORT.md` no longer contradicts `REVIEW.md`. The cache claim is corrected in `ARCHITECTURE.md`, `workerDocuments.ts` and `REVIEW.md`: `cacheControl: '0'` is served as `max-age=0`, which doesn't forbid storing the file. `OPERATIONS.md` now says to review on a device WashLink controls.
- **Browser check:** re-run on the final code. See `REVIEW.md`.
- **Fixes outside the plan:** the empty-ID request in `mobile/app/worker/setup.tsx`, and the re-run bug in `b2c-browser-seed.mjs`.
- **Known flake, not from B2C-7:** `j2_job_opening_lifecycle` test 46 searches audit payloads for `4321`, and each payload holds a random `shop_id`, so it fails rarely by chance. The verifier reproduced it by forcing such an ID. Not changed here.

## 2026-11-07: after the second verifier FAIL (orchestrator)

The second verifier failed the increment on two records: the claim that Storage can't send `no-store`, which it disproved by measurement, and stale counts in `FINAL_REPORT.md`. The first was fixed by changing behaviour rather than wording: the shared upload now sends `cache-control: no-store`. New smoke check `shared_client_upload_is_served_no_store` reads the header on the admin's download route. Counts corrected, and findings N1, N2 and N7 fixed. N3 (five attack checks accepting any error) stays open as low priority.

Results after the last code edit (actual output):

| Check | Result |
|---|---|
| `run-db-tests.mjs` | `Files=129, Tests=3782`, `Result: PASS` |
| `run-api-smokes.mjs` | `PASS (17 smokes)`, b2c 72, b2c7 75, 0 failed |
| Web lint, build | exit 0 |
| Web tests | 162 files, 508 tests pass |
| Mobile `tsc`, `jest`, `expo-doctor` | exit 0, 33 tests, 20/20 |
| Backend `pytest` | 4 passed, 1 warning |

## 2026-11-07: final verdict and last browser run (orchestrator)

The verifier returned PASS, with criterion 16 not verifiable by it. Afterwards the orchestrator re-ran browser steps 1 to 5 on the final code, closing N9: HTML as `.jpg`, SVG and 12 MB refused; both uploads 200 with no CORS error; both stored files `no-store`; Verify disabled; admin image shown through a `blob:` URL. Only docs and this log changed after the verifier's run. Open and non-blocking: N3, N4, N6.
