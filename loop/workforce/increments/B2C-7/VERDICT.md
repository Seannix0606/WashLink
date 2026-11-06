# B2C-7 independent verification verdict

Branch `feature/b2c`, uncommitted on `5a3f769`. Final re-check on 2026-11-07, local stack only. Every result comes from my own runs.

Earlier FAIL 1: `FINAL_REPORT.md` contradicted `REVIEW.md`, the cache claim was unsupported, the browser check could not be verified, and `b2c7-api-smoke.mjs` was over the size limit.
Earlier FAIL 2: `OPERATIONS.md` and `REVIEW.md` said Storage could not send `no-store`, which measurement disproved, and `FINAL_REPORT.md` carried stale counts.

## Overall: PASS, with criterion 16 not verified

All checks pass, and criteria 1 to 15 pass on evidence I produced. Both blocking findings from FAIL 2 are closed.

**Criterion 16 (browser check) is NOT-VERIFIABLE by me, so this PASS rests on my judgement that it should not block.** Reasons are below. The upload path changed after the recorded browser run, so a person should repeat steps 1, 2, 3 and 4 in a real browser before uploads are turned on.

## Checks, run in sequence from a clean start

| Check | Exit | Actual result |
|---|---|---|
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | 19 pass, 0 fail |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | `Files=129, Tests=3782`, `Result: PASS`. `j2_job_opening_lifecycle` did not flake |
| `node scripts/supabase-test/run-api-smokes.mjs` | 0 | `run-api-smokes: PASS (17 smokes)`, 0 failed in each |
| Smoke counts | | w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 36, w14 33, w12 22, w15 17, w16 17, b2c 72, b2c7 75, w13 17 |
| `frontend: npm run lint` | 0 | clean |
| `frontend: npm run build` | 0 | built |
| `frontend: npm test` | 0 | 162 files, 508 tests pass |
| `mobile: npx tsc --noEmit` | 0 | clean |
| `mobile: npx jest` | 0 | 2 suites, 33 tests pass |
| `mobile: npx expo-doctor` | 0 | 20/20 |
| `mobile: npx expo install --check` | 0 | Dependencies are up to date |
| `backend: .venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |

## Acceptance criteria (PLAN section 12)

| # | Result | Evidence |
|---|---|---|
| 1 | PASS | `Result: PASS`, 129 files, 3782 tests (above 3580) |
| 2 | PASS | `PASS (17 smokes)`; `b2c7-api-smoke: 75 passed, 0 failed` |
| 3 | PASS | 19 pass |
| 4 | PASS | Lint, build and test exit 0; 508 tests (above 398) |
| 5 | PASS | `typecheck` is `tsc --noEmit` and `test` is `jest` (`mobile/package.json:11-12`); both exit 0; 33 tests (above 11) |
| 6 | PASS | `expo install --check` exit 0; doctor 20/20 |
| 7 | PASS | 4 passed |
| 8 | PASS | `verify_refused_with_no_documents` passes, and failed when the gate was removed. Smoke check `verify_refused_until_all_approved` ran and passed in the b2c7 smoke |
| 9 | PASS | `git diff --diff-filter=MD --name-only 5a3f769 -- supabase/migrations` is empty. Migration files are unchanged since 22:54 |
| 10 | PASS | b2cl 207, b2cm 316, b2cn 304 lines, all with ROLLBACK. Largest new source file: `b2c7-api-smoke.mjs` at 326 lines |
| 11 | PASS | Both named tests are in `j19_b2c7_deletion_and_file_queue`, which passes |
| 12 | PASS | `DeleteAccountSection.tsx:46`, `AccountScreen.tsx:49`, `OPERATIONS.md:58`, `:132` |
| 13 | PASS | grep empty |
| 14 | PASS | Both checks empty |
| 15 | PASS | No test or script deleted. The 7 modified pgTAP files are exactly the section 11 list |
| 16 | NOT-VERIFIABLE | I have no browser. See below |

### Criterion 16: the record, and whether it should block

**It should not block on its own.** The server side is proven by the smoke, the screen logic by tests, and uploads default to off, so nothing real depends on it yet.

`REVIEW.md:44-66` is specific and consistent with the code: a result per step, which steps were re-run and which weren't, and that the page was driven by script. Its limits:
- It was not independently repeated, and it keeps no screenshots or other artefacts.
- Steps 1 and 3, and the disabled state in step 4, predate fix cycle 1.
- **The upload option changed after that run, and the record doesn't say so** (finding N9). So no real browser has uploaded with the final code. I measured the same shared client under Node instead, and a CORS preflight naming `cache-control` from `http://localhost:5173` returned 200 and allowed that header.

## Blocking findings from FAIL 2

### 1. Cache: CLOSED

The shared upload now sends `headers: { 'cache-control': 'no-store' }` (`packages/shared/src/workerDocuments.ts:252`).

**Measured.** Each upload went through the real shared client as a washer, then an admin opened the document and read the authenticated download:

| App's library | Bytes | Status | Served `cache-control` | Stored `metadata.cacheControl` |
|---|---|---|---|---|
| frontend, storage-js 2.103.3 | `Uint8Array` | 200 | `no-store` | `no-store` |
| frontend, storage-js 2.103.3 | `ArrayBuffer` | 200 | `no-store` | `no-store` |
| mobile, storage-js 2.119.0 | `Uint8Array` | 200 | `no-store` | `no-store` |
| mobile, storage-js 2.119.0 | `ArrayBuffer` | 200 | `no-store` | `no-store` |

The mobile row used the app's library under Node, not React Native on a device.

**The smoke check has teeth.** A preload script in the scratchpad removed the header from the shared source in memory, so no repo file changed. The script confirmed the change applied, and the source file still has the header afterwards.

| Run | Result |
|---|---|
| Unmodified | 75 passed, 0 failed; `ok shared_client_upload_is_served_no_store` |
| Header removed | 74 passed, 1 failed: `NOT OK shared_client_upload_is_served_no_store -> 200 max-age=3600` |

Without the header the library's default gives a file an hour of caching, so this check guards something real. The unit tests at `sharedWorkerDocuments.test.ts:164` and `mobile/src/__tests__/workerDocuments.test.ts:175` also pin the exact options.

**Wording.** I searched `docs`, `packages`, `frontend/src/features/b2c`, `mobile/src`, `mobile/app`, the smokes, `DECISIONS.md`, `LOOP.md`, `REVIEW.md` and `PLAN.md`. None still claims `max-age=0` behaviour or that Storage can't send `no-store`. Only `LOG.md:350` still mentions it, as a dated history entry, and `LOG.md:357` records the correction.

No overclaim found:
- `OPERATIONS.md:73`: the app asks browsers not to store the image, this wasn't observed in a real browser, and a custom client could upload without that request.
- `REVIEW.md:16`: the client's request, not enforced, a custom client could send another value, browser behaviour not observed.
- `ARCHITECTURE.md:55`: the header is measured and a browser's behaviour isn't, it is the client's request, and the database doesn't check it.
- `workerDocuments.ts:243`: the client's request, unchecked, a custom client could send something else.

**Still unproven:** whether a browser honours the header, and whether hosted Storage or a CDN behaves the same. `REVIEW.md:25` and `FINAL_REPORT.md:49` list hosted behaviour as unverified.

### 2. Counts: CLOSED

`docs/b2c/FINAL_REPORT.md:125-132` matches my run: 129 files and 3,782 tests; 17 smokes with b2c 72 and b2c7 75; 162 files and 508 web tests; 33 mobile tests; Expo Doctor 20 of 20.

## Findings N1, N2 and N7: all CLOSED

| ID | Evidence |
|---|---|
| N1 | `FINAL_REPORT.md:35` now says the run was "driven by script by the agent building this", in line with `REVIEW.md:46` |
| N2 | `FINAL_REPORT.md:72` no longer says five, and names the `j19_b2c6_suspended_worker` change. No check was removed |
| N7 | `PLAN.md:3` now says section 14 lists L1 to L9 and the register has L1 to L17 |

## Evidence carried over from my earlier run, on code unchanged since

Since that run the changed files are the shared client, one smoke check, two unit tests and docs. No migration, pgTAP file or RPC changed, so I did not repeat these, as agreed.

**pgTAP mutation probes, in rolled-back transactions:**

| Mutation | ok / not ok | Failed test |
|---|---|---|
| Control, unmutated | 198 / 0 | none |
| Upload helper: remove `d.status = 'awaiting_upload'` | 197 / 1 | `upload_helper_false_once_slot_left_awaiting` |
| Read helper: remove `is_super_admin()` | 197 / 1 | `admin_read_helper_false_for_demoted_admin` |
| Read helper: remove `file_queued_at is null` | 197 / 1 | `admin_read_helper_false_once_file_is_queued` |
| Gate: remove the required-documents check | 190 / 8 | `verify_refused_with_no_documents` and others |
| Admin SELECT policy: remove the operation allow-list | 197 / 1 | `select_refused_on_every_other_route` |
| D-113: remove the opened-by-this-admin check | 171 / 3 | `approve_refused_until_admin_opened_file`, `approve_refused_when_object_version_changed`; the file also aborted on a later error, which is why the total is short |

**Smoke mutations, which could not be rolled back.** Storage uses its own connections, so these were committed on the local stack and removed by `db reset`:
- Upload helper without the status guard: `slow_upload_into_closed_slot_refused_403` failed, with `RESULT 200` and `landed=true`.
- Upload helper returning true, policy also open to anon: `upload_to_other_washers_folder_refused`, `customer_upload_refused` and `anon_refused` failed, among 8 failures.

**Also from that run:**
- Replaced smoke checks: `LOG.md:298-308` lists six. All six new names ran, and I read each check: the justifications hold. The sixth old name is recorded only in LOG.md, because the file is untracked.
- `mobile/app/worker/setup.tsx`: an empty id returns early and gives a real HTTP 400 `22P02` if sent. A washer with no profile gets the save-first message and no upload buttons. No screen test covers this.
- `b2c-browser-seed.mjs`: ran twice in a row, exit 0 both times, exactly three accounts afterwards. I ran it once more in this re-check, for the measurement.
- No change to `public.bookings`, shop documents or workforce tables. The only `alter table` on an existing table adds the flag to `platform_settings`.
- Legal register: `B2C7-L1` to `L17` all OPEN. The only earlier row changed is B2C6-L6, which gains a pointer.
- ROLLBACK blocks are present in all three migrations. I checked presence only, and did not re-apply them.
- No `--linked`, `--db-url` or `db push` in the diff or smoke scripts, except the refusal guard list. No `.env*` change, and neither `.env` file was read.

## State left behind

The stack is reset. The uploads flag is `f` with column default `false`. Documents, queue, bucket objects and auth users are all 0. The only repo file I changed is this one.

## Findings

No blocking findings remain.

| ID | Severity | Blocks? | File:line | Finding |
|---|---|---|---|---|
| N3 | LOW | No | `scripts/supabase-test/smoke-worker-document-attacks.mjs:19,58,59,63,72` | These still accept any error. Open since the earlier run |
| N4 | LOW | No | `loop/workforce/increments/B2C-7/LOG.md:307` | "The real late landing was proved in the first build's run" has no output in the log, so I can't confirm it. D-124 now refuses the token at mint, and that is tested |
| N5 | LOW | No | `${to}`, `CALUDE.md`, `.claude/launch.json` | Untracked strays. Don't include them with `git add -A` |
| N9 | LOW | No | `loop/workforce/increments/B2C-7/REVIEW.md:46` | New. The record stops at fix cycle 2 and doesn't say the shared upload option changed after the browser run. Add that the final upload path hasn't run in a browser |
| N10 | LOW | No | `loop/workforce/LOOP.md:113` | New. Says `(74 checks)`; the actual count is 75. This is an expected-count note in the protocol table, and the rule it sets, `0 failed`, holds. I don't treat it as blocking, unlike the report line headed "Latest run" |
| N6 | INFO | No | `scripts/supabase-test/b2c-api-smoke.mjs` | 413 lines, over about 350. It is a modified file and was already 409 lines at `5a3f769` |
| N8 | INFO | No | root `STATE.md` | Not updated, which belongs to the RECORD step |

## Not verified by anyone

Real devices (camera, library, permissions, `fetch(file://)`, HEIC, cache cleanup), whether a browser honours `no-store`, the final upload path in a real browser, the removal job's Deno wrapper, deployment and scheduling, and everything on hosted Supabase, including whether the storage operation names match there. Uploads stay off until a person changes that.
