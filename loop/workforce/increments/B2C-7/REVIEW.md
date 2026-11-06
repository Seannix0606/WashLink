# B2C-7 review record

Two read-only reviews ran on the uncommitted diff on 2026-11-06 and 2026-11-07, after the first build. Full build and fix notes are in `LOG.md`.

## Security review

No BLOCKING findings.

| Finding | Severity | Outcome |
|---|---|---|
| One stolen admin session could open every ID and mint ten-year signed links | HIGH | Fixed locally. 60 opens per admin per hour. The admin read policy allows only the authenticated download operation, so signing is refused. Hosted operation names are unverified (D-118) |
| Removal could report success when the file still exists, if the owner lacks BYPASSRLS | MEDIUM | Fixed: `row_security = off` makes those functions error instead |
| Pinned file version not checked after approval | MEDIUM, suspected | Swap ruled out on Storage v1.88.0 by a concurrent-upload smoke. Version checks added to open and verify anyway |
| The rule that the removal job must run first was only prose | MEDIUM | Fixed: uploads default off (D-123), changed only by human-run SQL. No client role or RPC can change it |
| Admin count understated stored files | LOW | Fixed. The count can now run high, and the screen says so |
| Upload cache header kept IDs in a browser cache | LOW | Fixed: uploads ask for `cache-control: no-store`, and a smoke check confirms the admin's download is served with it. That is the client's request, so the server doesn't enforce it and a custom client could send another value. Browser behaviour wasn't observed. Review documents only on a device WashLink controls (`OPERATIONS.md`) |
| Washer notice overclaimed who can open files | LOW | Fixed: the notice now mentions people who run WashLink's systems |
| Submit ignored an expired slot | LOW | Fixed |
| A worker promoted to super admin could review themselves | LOW | Fixed: refused on open and review |
| Approve stayed enabled after an image failed to load | LOW | Fixed on screen. The server's D-113 rule stays looser: it proves a file was opened |
| Picked photos stayed in the app's cache | LOW | Fixed in code; never run on a device |
| A washer can remove a rejected file by re-uploading | LOW | **Accepted**, recorded in D-120 |
| Slot cap is per account, so new accounts get more | LOW | **Accepted**, recorded in D-122 |

Still suspected or untested: CDN caching and asynchronous byte removal on hosted Storage, decompression bombs, partial TUS uploads, and dashboard-created storage policies that widen access. Route attacks ran locally and were refused, except that TUS PATCH and S3 multipart weren't exercised. All of this needs repeating on staging.

## Compliance review

No B2B rule is broken.

| Finding | Severity | Outcome |
|---|---|---|
| Upload notice didn't say how long files stay | BLOCKING | Fixed |
| Sign-in page overstated "verified" and promised "Secure payments" | BLOCKING | Fixed |
| New washers were told WashLink was reviewing them with nothing uploaded | BLOCKING | Fixed on web and mobile |
| "An admin looked at the files" contradicted D-113 | NON-BLOCKING | Fixed |
| Revoke warning left out started jobs; notification hid lost verification | NON-BLOCKING | Fixed |
| Status changes sent no notification | NON-BLOCKING | Fixed |
| Docs overstated deletion and "nothing changed" | NON-BLOCKING | Fixed |
| No contact channel or appeal; reasons overwritten | NON-BLOCKING | **Open** for a person: B2C6-L6, B2C7-L11, B2C7-L15 |

Legal items B2C7-L1 to L17 are in `docs/b2c/LEGAL_REVIEW_REGISTER.md`, all OPEN.

## Browser check

Run by the orchestrator on the local stack with synthetic images only. The verifier has no browser, so this record hasn't been independently repeated. The pane was hidden, so the page was driven by script against the real controls, and real files went through the real file input and upload path. Steps 1 to 5 ran last on the final code, after the upload header change: real browser uploads returned 200 with no CORS error, and both stored files show `cacheControl` `no-store`. Steps 7 to 13 were last run after fix cycle 1 and before that header change; since then only the upload header, tests, docs and one mobile guard changed, and the guard was re-checked. The removal job itself is covered by the smoke, not this check. Whether a browser honours `no-store` was not observed.

| Step | Result |
|---|---|
| 1. Both types, notice, save-profile message | Pass |
| 2. JPEG and PNG upload to under review, no file link | Pass |
| 3. HTML as `.jpg`, SVG and 12 MB refused with written messages | Pass |
| 4. Verify unavailable, and names what blocks it | Pass |
| 5. Admin opens: image in page, one `opened` audit row, no path | Pass: `blob:` URL, revoked on close, no storage links, Approve only while the file is showing |
| 6. Signed URL | **Replaced by D-118.** No link exists to paste. Refusal of signing is proven by the smoke, not the browser |
| 7. Reject: short reason refused, washer sees reason, notification without it | Pass |
| 8. Re-upload, approve, verify, washer online | Pass |
| 9. Replace an approved document: washer stays verified and online | Pass |
| 10. Revoke: washer to pending, reason shown, accepted job back to search | Pass |
| 11. Suspend needs a reason; washer sees it with no upload control | Pass |
| 12. Delete: copy says queued, account gone, audit row, queue rose | Pass. Running the job locally is covered by the smoke, not this check |
| 13. Mobile preview: both types, reason shown, upload to under review | Pass through the picker's web input. Camera remains unverified |

Evidence from the final run: 0 audit rows with a file path, 0 notifications holding a rejection or suspension reason, and the file queue rose after the deletion.

Two bugs found here and fixed. The mobile setup screen asked for the profile with an empty ID before the session loaded (HTTP 400, then a correct retry); after the fix a fresh load makes one request with the real ID, returning 200. And `b2c-browser-seed.mjs` said it was safe to re-run but looked users up by a column `profiles` doesn't have; it now finds them through the auth service, and was run twice in a row to prove it.

## Not verified

Native camera and library, permission prompts, `fetch(file://)`, HEIC on an iPhone, the cache cleanup on a device, the removal job's Deno wrapper, deployment and scheduling, and everything on hosted Supabase.
