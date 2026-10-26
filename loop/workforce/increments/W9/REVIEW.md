# W9 - Worker contracts, acceptance, snapshots, amendments - REVIEW

Reviewed 2026-10-27 over the uncommitted W9 diff (base `81be37d`). Both reviewers were read-only; the orchestrator
recorded their reports here verbatim in substance.

Result: **no BLOCKING findings** (security S1–S5, compliance C1–C6, all NON-BLOCKING or notes). New legal flags
W9-L13..L17 in `LEGAL_FLAGS.md`.

## Security review

**No BLOCKING findings.**

### Verified
- RLS on all 8 W9 tables: enabled; `revoke all` from public, anon, authenticated, service_role; select only for
  authenticated; deny-all insert / update / delete policies. `worker_contracts`: owner (role owner and `owner_id`) or the
  worker once sent. `contract_versions`: worker sees non-draft only. Clauses, flags, acceptances follow the version via
  nested RLS. Reference tables readable by signed-in users, writes only from a trusted no-JWT session.
  `retained_job_application_records`: worker only. No super_admin / customer policy, no `using (true)`.
- SECURITY DEFINER: all pin `search_path = public, pg_temp`; internal and trigger functions revoked from every client
  role incl. service_role; client RPCs granted to authenticated only. Owner RPCs via `worker_contract_lock_for_owner`
  (role owner, `owner_id`, current `shops.owner_id`); worker RPCs via `worker_contract_lock_for_worker` (role worker,
  `worker_id`, sent). Foreign ids -> 42501 `Contract not found.` The two definer reads are scoped to `auth.uid()` and return
  names only.
- Fabricated acceptance: `contract_acceptances_guard_write` runs for every session and requires the write flag,
  `party_id = auth.uid()`, matching role and party column, and the sealed hash; owner rows only while sealing in the same
  transaction, worker rows only for the pending version; statement text, name, `accepted_at`, label set by the server;
  expiry and retention never insert acceptances.
- Sealed immutability: after sealing only `state`, `responded_at`, `decline_note`, `updated_at` change, with fixed state
  changes; clauses and flags insertable only while their version is sealed (`sealed_txid = txid_current()`); deferred
  commit check rebuilds text and hash; owner values limited to 3 keys, `{{` / `}}` refused.
- Write flags are transaction-local; no public `set_config` wrapper; direct writes fail on grants and RLS anyway.
- Account deletion follows P53, D-32, D-35: unsent drafts deleted, accepted / active keep status (no fabricated
  termination), pending amendments withdrawn, worker can still decline / terminate, accepted applications copied to the
  worker-only retained table before the cascade.
- Audit payloads: ids, status / kind words, `flag_count`, `classification_key` only. Notifications: fixed wording plus
  `notification_safe_label(shop_name_snapshot)`; no contract text, pay, reasons or names. Trusted repairs send none. No W9
  table in `supabase_realtime`.
- Frontend: RPC-only writes; direct reads `worker_classification_options`, `contract_acknowledgement_texts`, the owner's own
  draft `contract_versions` row; no `service_role`, no `dangerouslySetInnerHTML` / `innerHTML` / `document.write`; sealed text
  rendered as React text in `<pre>`; download is a text/plain Blob; error mapping is a whitelist plus two capped patterns.
  Smoke reads keys from local `supabase status` and refuses non-loopback URLs.
- Existing policies unchanged; the only addition to an existing table is an AFTER DELETE copy trigger on `job_applications`.

### Findings
| ID | Severity | File:line | Scenario | Suggested fix |
|---|---|---|---|---|
| W9-S1 | NON-BLOCKING | `supabase/migrations/2026_10_26_w9c_worker_contracts.sql:184-193` | Trusted status repair has no transition rules: it can revive a terminated / declined / expired contract (against spec F, P52, D-35); a repair to terminated / expired leaves a sent amendment open, still offered as `accept_amendment` and refused by the RPC. | Refuse changes out of declined / withdrawn / expired / terminated; allow only accepted / active -> terminated / expired; close open versions on those moves; pgTAP "trusted repair cannot revive a terminated contract". (Same as C1.) |
| W9-S2 | NON-BLOCKING | `w9b_worker_contract_reference_data.sql:193-207`, `w9e_worker_contract_rules.sql:152-175` | Owner text may contain newlines and imitate header / section lines (`Relationship type: Employee`, `4. Relationship type`, notice or label lines) in the sealed plain text. Hash still binds the real text; risk is a misled worker. | Refuse such lines on server and client; mark shop-written blocks with a fixed prefix in the rendered text. |
| W9-S3 | NOTE | `w9d_contract_version_records.sql:259-264` | A DB superuser can fake `request.jwt.claims` and create an acceptance; not preventable in-database. Owner acceptance has no own audit row. | Document in `ROLE_AND_PROFILE_SECURITY.md`; optionally an AFTER INSERT audit on `contract_acceptances` with `session_user`. |
| W9-S4 | NOTE | `w9g_worker_contract_party_rpcs.sql:175-180` | Accept does not re-check `c.owner_id = shops.owner_id`; only matters after an admin shop transfer. | Add the ownership `exists` to the accept check and the `my_worker_contracts` accept hint. |
| W9-S5 | NOTE | `w9i_worker_contract_retention.sql:27-36` | Worker name kept in snapshots after worker deletion (intended, D-32). | None in code; keep W9-L5 OPEN. |

## Compliance review

Compliance: no BLOCKING. NON-BLOCKING: C1–C6. New legal flags: W9-L13..L17 (`LEGAL_FLAGS.md`, all OPEN). The reviewer is not a lawyer and makes no compliance statement.

### Checked, no finding
- Locked safeguards cannot be removed by owners: locked clauses always from the base platform version (w9e:54-74); `save_worker_contract_draft` refuses locked keys (w9f:170-173); commit-time validator requires every base clause, locked text equal to the standard, exact clause count (w9e:250-265); safeguard impersonation and locked-only placeholders refused (w9b:193-207).
- Accepted contents preserved: sealed versions immutable in every session (w9d:42-53); rendered text and sha256 stored in the version, template ids lineage only (w9d:81-92); clauses, flags, acceptances not updatable (w9d:209-211, 248-253).
- Material amendments need worker acceptance: every post-acceptance change is a new version, in force only on acceptance (w9g:193-201); on decline / withdrawal the current version stays (w9g:229-230, w9f:292-293); worker accepts the exact hash (w9g:172).
- Decline and terminate always possible: decline has no verification or shop-presence gate (w9g:208-235); worker terminate has no verification, notice or three-owner gate, reason 10..500 only (w9g:238-268; W9-L6); UI always shows Decline and End contract; Accept hidden when shop or owner is gone.
- Explicit classification: `classification_key` NOT NULL, no default, RPC parameter no default (w9c:88, w9f:70-75); contractor acknowledgements enforced at send (w9f:243-246), accept (w9g:184-187), re-checked by the acceptance trigger (w9d:273-279); radios unpreselected, server order.
- Problem-term flags inform only: never block sending, locked clauses excluded (w9e:184); guidance CHECK against claim words (w9b:46); disclaimer and no-match text make no validation claim (w9h:121-122).
- C7 gate: activation refused while a live accepted `required_initial` enrollment with the same owner exists (w9g:140-145).
- Free three-day training rule untouched: no committed migration changed; no fee, amount or deduction path; W8 locked training-free / training-pay clauses still apply.
- Three-owner rule: W9 adds no count and no gate on decline or terminate (counting is W10, D-3).
- No fabricated acceptance: acceptance row needs `auth.uid()` = party with the matching role under the write flag; a trusted session cannot insert one (w9d:260-264); helpers use real RPCs; pay never prefilled.
- No claims of legal validity, e-signature or compliance: "Acceptance record — not an e-signature" CHECK-enforced (w9d:180); UI copy and docs make no such claim.
- Legal register: W9-L1..L12 present and OPEN (LEGAL_REVIEW_REGISTER.md:191-202).

### Findings
| ID | Severity | File:line | Issue | Suggested fix |
|---|---|---|---|---|
| C1 | NON-BLOCKING | `supabase/migrations/2026_10_26_w9c_worker_contracts.sql:184-193` | Trusted-session status repair limits columns, not transitions: it can reopen a terminated / expired contract, move declined / withdrawn back to `sent_for_review`, or activate without verification and C7. Audited but not notified (w9j:75). No pgTAP test covers repair transitions. | Allow only forward repairs; notify both parties; add a pgTAP test. (W9-L17) |
| C2 | NON-BLOCKING | `frontend/src/presentation/utilities/workerContractCopy.ts:69-70`, `:30-31` | "You can end this contract at any time." states a legal right without condition; the locked clause says "as the law allows". | Reword to "You can record the end of this contract on WashLink at any time. Notice periods or other duties may apply..." (W9-L15) |
| C3 | NON-BLOCKING | `frontend/src/presentation/utilities/workerContractCopy.ts:72-73` | Owner termination copy gives no caution that ending a relationship may have legal requirements. | Add a caution (cause and notice; WashLink only records the end). (W9-L14) |
| C4 | NON-BLOCKING | `supabase/migrations/2026_10_26_w9f_worker_contract_owner_rpcs.sql:196-198`, `:232` | An amendment can change relationship type and dates (incl. a past start date); only worker acceptance guards it, with no special warning. | Prominent worker warning on reclassification / retroactive amendments; consider refusing reclassification by amendment until legal review. (W9-L13) |
| C5 | NON-BLOCKING | `supabase/migrations/2026_10_26_w9b_worker_contract_reference_data.sql:112-155` | No keyword category for exclusion of statutory benefits / wage rules (SSS, PhilHealth, Pag-IBIG, 13th month, overtime / holiday pay, minimum wage, "tips only", long probation). | Draft a `statutory_benefit_exclusion` category (English and Filipino) in a later migration after review. (W9-L16) |
| C6 | NON-BLOCKING (carry-forward W10) | `supabase/migrations/2026_10_26_w9i_worker_contract_retention.sql:27-35` | After owner / shop removal, accepted / active contracts stay `active` (D-35); a trusted repair can revive ended contracts. | W10 / D-3 counting must exclude contracts with null / removed owner or unverified owner, and count distinct owner ids. Add tests. |

### Carry-forward
- W10: C6, plus the D-3 counting policy (OPEN).
- W11: dispute access to contracts, including review of owner terminations.
- W12: scheduled `expire_worker_contracts`.
- RECORD: add W9-L13..L17 to the register as OPEN.
