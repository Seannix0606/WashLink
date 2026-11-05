# B2C-6 review record

Two read-only reviews ran on the uncommitted diff on 2026-11-06, after the DB, web and mobile build and before fix cycle 1.

## Security re-review

No BLOCKING or HIGH findings. Status of the original findings: H2, M1, M2, M6 and both BUGs fixed. H1, H3, M4 and the null actor partly fixed, for the reasons below.

| Finding | Severity | Outcome |
|---|---|---|
| N1 washer can mark arrival at T-120, blocking the customer's cancel for hours | MEDIUM | Fixed: arrival window, D-107 |
| N1 washer can mark `completed` with no duration or presence check | MEDIUM | **Open.** Follow-up, needs a product decision on evidence of work |
| S1 a stolen session may change the password, then pass the deletion check | MEDIUM, suspected | Open: deployment step added to `DEPLOYMENT.md`, untested locally |
| N2 `set_independent_worker_online` could deadlock | LOW | Fixed: `for no key update` |
| N3 cap trigger reveals another customer's saved count | LOW | Fixed: trigger leaves other customers' rows to RLS |
| N4 radius probing | LOW | Open, accepted in the plan; B2C6-L9 |
| N5 hidden offers lock the base location | LOW | Fixed |
| N6 a refused deletion silently stops push | LOW | Fixed: tokens go with the profile by cascade |
| N7 acceptance criterion 11 omits the j18 pin | LOW, process | Fixed in `PLAN.md` |
| S2 `Buffer` annotation may fail a Deno type check | LOW, suspected | Fixed: `Uint8Array`. Still never run on Deno |

H3 stays partly fixed by design: those accounts are refused, and manual closure is undefined (B2C6-L1, L2). The audit row on system transitions still names the session (D-106).

## Compliance review

| Finding | Severity | Outcome |
|---|---|---|
| B1 copy told users WashLink "must keep" records, a duty nobody has decided | BLOCKING | Fixed in web, mobile and `b2ck`. The refusal is now neutral |
| B2 "anonymous" and "without the person's identity" were not accurate | BLOCKING | Fixed in web, mobile and `OPERATIONS.md`: the copy says what stays, including the audit log's internal ID |
| Overstated dispute record in `OPERATIONS.md` | NON-BLOCKING | Fixed |
| No contact channel behind "Contact WashLink" | NON-BLOCKING | Refusal reworded for deletion. Launch requirement recorded. `bookingStatus.ts` and `b2ci` still say "Contact WashLink" for a paused washer |
| Precise-distance claim omitted radius probing | NON-BLOCKING | Fixed in `ARCHITECTURE.md` |
| Hard-coded "2 hours" and "30 minutes" in messages | NON-BLOCKING | **Open.** A changed setting needs matching message and client changes; documented beside the constants |
| Incomplete irreversible-change list in `DEPLOYMENT.md` | NON-BLOCKING | Fixed |
| Offers set to `declined` on suspension, though the washer never responded | NON-BLOCKING | Documented in B2C6-L6 |

Decisions for a person, and the nine legal items, are in `docs/b2c/LEGAL_REVIEW_REGISTER.md`.

## Browser check

Driven by hand on the local stack at 375px, with the seeded test accounts:

- Washer offer shows "Within 2 km" and no address.
- Accepting reveals the address and customer.
- After suspension mid-job: the server returns a null address, the screen drops the address and customer, and the paused notice shows.
- The server refused `advance_service_booking` with the written message (HTTP 400, the only console error). The button stayed enabled, so it is now disabled when paused.
- Admin sees the started job and the note. A 5-character reason is refused and the booking is unchanged. A valid reason cancels it.
- Saving an add-on price of ₱10,000 succeeds; this failed before the fix.

Not driven in a browser: the deletion refusal, overdue cancel, and the early-start notice (component tests only). The mobile changes have type-check and logic tests only.

## Verification

First independent verifier: **FAIL** (`VERDICT.md` at that time). Both failures came from the fix-cycle edit script, not from database behaviour. `String.replaceAll` treats `$$` in a replacement as `$`, which broke four new pgTAP lines, and one web test still expected the old copy. The suites were not re-run after that edit. Repaired and re-run. See `LOG.md`.
