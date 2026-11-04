# Legal review register: index (W0-W16; split in W13, D-75)

This register lists every legal-review flag raised by the workforce loop in W0-W16
(`loop/workforce/increments/*/LEGAL_FLAGS.md` and W5 PLAN section 11). Every item is **OPEN** and is for review by a
qualified Philippine labor-law professional (data-privacy items also by a qualified data-privacy professional). The loop
cannot resolve any of them.

This register makes no compliance claim. Nothing in WashLink's code, UI copy or docs claims legal
compliance for any feature, and no item here may be read as advice. Production use of the features named in an item requires that review
first (`DEPLOYMENT_READINESS.md`). Items are never deleted, merged or closed by the loop; only a human records an outcome.

Layout (D-75). This file is the index: status summary, sign-off table, overlap map, a list naming every item ID, and
the W13, W15 and W16 items in full (sections "W13 items", "W15 items" and "W16 items" at the end). The text, sources and cross-reference paragraphs of the 153
earlier items are in two parts. W13 moved them there verbatim from the single-file register (153 items before W13, all
OPEN, no duplicate IDs). Each item has exactly one full row, in one part or, for W13-L1..L11, W15-L1..L3 and W16-L1..L7, in this file:

- [`legal/REGISTER_PART_1_W0_W8.md`](legal/REGISTER_PART_1_W0_W8.md): W0, W2, W3, W4, W5, W6, W7, W8.
- [`legal/REGISTER_PART_2_W9_W14.md`](legal/REGISTER_PART_2_W9_W14.md): W9, W10, W11, W14, W12 (in the earlier order). The W13, W15 and W16 items are in this file, not in part 2.

Line-number pointers to `LEGAL_REVIEW_REGISTER.md` in earlier REVIEW / VERDICT files are historical (W13 PLAN R6). The
item IDs are stable; look an ID up in the index below.

Status key: OPEN = not reviewed. Source paths are relative to the repository root.

## Status summary

| Increment | Items | OPEN | Part |
|---|---|---|---|
| W0 (baseline review) | 7 | 7 | 1 |
| W2 (roles, worker profiles, roster links) | 5 | 5 | 1 |
| W3 (audit trail, notifications) | 5 | 5 | 1 |
| W4 (owner job openings) | 11 | 11 | 1 |
| W5 (marketplace and applications) | 11 | 11 | 1 |
| W6 (training programs, attendance, assessment) | 13 | 13 | 1 |
| W7 (shop-issued certifications) | 16 | 16 | 1 |
| W8 (contract templates and template versions) | 13 | 13 | 1 |
| W9 (worker contracts, acceptance records, snapshots, amendments) | 17 | 17 | 2 |
| W10 (owner relationships, three-distinct-owner progress goal) | 11 | 11 | 2 |
| W11 (WashLink certification review, contract problems, dashboards) | 15 | 15 | 2 |
| W14 (platform moderation, oversight reads, admin audit) | 17 | 17 | 2 |
| W12 (notification wiring and scheduled jobs) | 12 | 12 | 2 |
| W13 (hardening, final documentation; L8..L11 from the W13 review) | 11 | 11 | index |
| W15 (required-training booking gate keyed on roster link history; copy; L2, L3 from the W15 review) | 3 | 3 | index |
| W16 (gate hold rule, locked clause pin, final review K10 items; L7 from the W16 review) | 7 | 7 | index |
| **Total** | **174** | **174** | Part 1: 81, Part 2: 72, index: 21 |

W1 raised no legal flag (test harness only). Before W13 the register held 153 items; W13 added 11 (L1..L7 from the plan, L8..L11 from the W13 compliance review). W15 added 3 (W15-L1 from the plan, W15-L2 and W15-L3 from the W15 compliance review). W16 added 7 (W16-L1..L6 from the plan, W16-L7 from the W16 compliance review; F-C2 and F-C3 cross-reference W15-L1 and W15-L2). Nothing was removed.

## Human sign-off (blank; the loop fills in nothing)

A qualified reviewer records the outcome of each item in the "Human outcome" column of the ID list below, and the
review of each part here. Until a row is signed, every item in it stays OPEN and the matching gate in `DEPLOYMENT_READINESS.md`
stays unchecked.

| Scope | Review type | Reviewer (name, qualification) | Date | Outcome summary | Signature |
|---|---|---|---|---|---|
| Part 1 (W0-W8, 81 items) | Philippine labor law | | | | |
| Part 1 (W0-W8, 81 items) | Data privacy (RA 10173) | | | | |
| Part 2 (W9-W12, W14, 72 items) | Philippine labor law | | | | |
| Part 2 (W9-W12, W14, 72 items) | Data privacy (RA 10173) | | | | |
| W13 items in this index (11 items) | Philippine labor law | | | | |
| W13 items in this index (11 items) | Data privacy (RA 10173) | | | | |
| W15 items in this index (3 items) | Philippine labor law | | | | |
| W15 items in this index (W15-L3) | Data privacy (RA 10173) | | | | |
| W16 items in this index (7 items) | Philippine labor law | | | | |
| W16 items in this index (W16-L4) | Data privacy (RA 10173) | | | | |
| Accepted limitations (`LIMITATIONS.md`, W13-L6) | Labor law and data privacy | | | | |
| Deployment checklist (`DEPLOYMENT_READINESS.md`, W13-L6) | Project owner | | | | |

## Overlap map (related items; never merged or deleted)

Items below share a topic. Review them together; each keeps its own row and its own outcome.

| Topic | Related item IDs |
|---|---|
| Meaning of the three-distinct-owner count (informational only, D-3) | W0-L1, W10-L1, W10-L3, W10-L5, W10-L6, W10-L8, W10-L9, W10-L11, W11-L9, W12-L5 |
| Concurrent engagements across owners | W10-L2 |
| Free training versus productive work; training fees | W0-L2, W4-L3, W5-L3, W5-L9, W6-L1, W6-L2, W6-L3, W6-L9, W6-L10, W6-L11, W6-L12, W8-L11, W9-L9, W14-L13, W13-L11, W15-L1, W15-L2, W16-L1, W16-L2, W16-L7 |
| Relationship classification | W0-L3, W4-L2, W8-L3, W9-L2, W9-L13 |
| Acceptance without an e-signature (D-6) | W0-L4, W8-L4, W9-L1, W9-L12 |
| Certificate naming, validity and disclosure | W0-L5, W4-L5, W5-L5, W5-L11, W7-L1, W7-L2, W7-L4, W7-L5, W7-L9, W7-L11, W7-L15, W7-L16 |
| Fair process: training records, certificate suspension and review | W6-L6, W6-L13, W7-L3, W7-L7, W7-L12, W7-L13, W7-L14, W11-L1, W11-L2, W11-L3, W11-L11 |
| Shop verification records and loss of verification | W2-L3, W2-L4, W3-L4, W3-L5, W7-L6, W14-L10 |
| Owner free text: waivers, fees, deposits, unpaid trials | W4-L1, W4-L8, W4-L11, W5-L8, W6-L11, W8-L5, W8-L12, W8-L13, W9-L3, W9-L4, W9-L16, W14-L2 |
| Discrimination and publisher duties | W4-L4, W4-L7, W4-L9, W5-L4, W14-L1, W13-L7 |
| Recruitment and placement | W4-L10 |
| Template safeguards and statutory content | W8-L1, W8-L2, W8-L6, W8-L7, W8-L8, W8-L10, W12-L12, W16-L3 |
| Termination, notice and trusted repairs | W9-L6, W9-L14, W9-L15, W9-L17, W10-L7, W11-L7, W13-L2, W13-L3, W16-L5 |
| Contract and certificate expiry notices | W7-L10, W12-L2, W12-L3, W12-L4, W12-L8, W12-L9, W12-L10, W12-L11, W13-L1, W13-L8, W13-L9 |
| Retention periods (none defined) | W0-L6, W3-L1, W4-L6, W5-L10, W7-L8, W8-L9, W9-L5, W12-L6, W14-L8, W13-L5, W13-L10, W15-L3, W16-L4 |
| Personal data and access (RA 10173) | W0-L6, W2-L1, W2-L5, W5-L1, W5-L6, W5-L7, W6-L8, W10-L4, W10-L10, W11-L5, W11-L8, W14-L6, W14-L7, W14-L8, W14-L15, W15-L3, W16-L4 |
| Audit trail: evidence value and who may read it | W3-L3, W14-L9, W13-L4 |
| Notification channels and content | W3-L2, W12-L1, W12-L7, W16-L7 |
| Reported problems and moderation process | W11-L4, W11-L5, W11-L6, W11-L10, W11-L12, W11-L13, W11-L14, W11-L15, W14-L3, W14-L4, W14-L5, W14-L12, W14-L14, W14-L16, W14-L17 |
| Roster-link consent | W0-L7, W2-L2 |
| Single-administrator governance | W10-L5, W11-L10, W14-L11 |
| Contract lifecycle details | W5-L2, W9-L7, W9-L8, W9-L10, W9-L11 |
| Training operations and safety | W6-L4, W6-L5, W6-L7 |
| Human sign-off of limitations and readiness | W13-L6 |
| Claims about worker verification in marketing copy | W16-L6 |

## Every item ID

One line per item ID. "Where" names the file that holds the full row (item text and source): part 1, part 2, or the
"W13 items", "W15 items" or "W16 items" section of this file. The topic is a short label only; the full row is authoritative.

| Where | ID | Status | Topic | Human outcome |
|---|---|---|---|---|
| 1 | W0-L1 | OPEN | Meaning of the three-distinct-owner rule | |
| 1 | W0-L2 | OPEN | Free training versus productive work | |
| 1 | W0-L3 | OPEN | Worker relationship classification | |
| 1 | W0-L4 | OPEN | Acceptance without an e-signature as evidence of consent | |
| 1 | W0-L5 | OPEN | Certificates shop-issued only; validity and renewal | |
| 1 | W0-L6 | OPEN | Identity documents and worker personal data | |
| 1 | W0-L7 | OPEN | Worker consent to roster linking | |
| 1 | W2-L1 | OPEN | Worker profile and private contact data at collection | |
| 1 | W2-L2 | OPEN | Roster-link consent wording | |
| 1 | W2-L3 | OPEN | Shop re-verification and identity documents | |
| 1 | W2-L4 | OPEN | Deleting a reviewer and shop verification | |
| 1 | W2-L5 | OPEN | Profile visibility copy | |
| 1 | W3-L1 | OPEN | Audit row retention | |
| 1 | W3-L2 | OPEN | Notification content and channels | |
| 1 | W3-L3 | OPEN | Audit trail is not legal evidence | |
| 1 | W3-L4 | OPEN | Verification loss not snapshotted, workers not told | |
| 1 | W3-L5 | OPEN | Authoritative approver record | |
| 1 | W4-L1 | OPEN | Owner-typed pay and terms shown unchecked | |
| 1 | W4-L2 | OPEN | Job type is not an employment classification | |
| 1 | W4-L3 | OPEN | "Trainees welcome" and required-training wording | |
| 1 | W4-L4 | OPEN | Discriminatory requirements: age | |
| 1 | W4-L5 | OPEN | "Shop-issued certification required" wording | |
| 1 | W4-L6 | OPEN | Retention of drafts and archived openings | |
| 1 | W4-L7 | OPEN | Discriminatory requirements other than age | |
| 1 | W4-L8 | OPEN | Waivers, fees and unpaid trials in owner free text | |
| 1 | W4-L9 | OPEN | Publisher role and duties | |
| 1 | W4-L10 | OPEN | Recruitment and placement | |
| 1 | W4-L11 | OPEN | Piece-rate and open-ended pay display | |
| 1 | W5-L1 | OPEN | Applicant data shared with owners | |
| 1 | W5-L2 | OPEN | Meaning of an accepted application | |
| 1 | W5-L3 | OPEN | Free-training notice and stored acknowledgement | |
| 1 | W5-L4 | OPEN | Rejection without reasons; discrimination risk | |
| 1 | W5-L5 | OPEN | Certification-required openings before certificates existed | |
| 1 | W5-L6 | OPEN | Sensitive data in cover notes | |
| 1 | W5-L7 | OPEN | No contact exchange between owner and applicant | |
| 1 | W5-L8 | OPEN | Owner free text frozen in application snapshots | |
| 1 | W5-L9 | OPEN | Notice text on training fees and deductions | |
| 1 | W5-L10 | OPEN | Worker record of applications after deletion | |
| 1 | W5-L11 | OPEN | "No verified certification" warning | |
| 1 | W6-L1 | OPEN | The free required training arrangement | |
| 1 | W6-L2 | OPEN | Owner attestation and the booking gate | |
| 1 | W6-L3 | OPEN | Training pay shown unchecked | |
| 1 | W6-L4 | OPEN | Trainer designation | |
| 1 | W6-L5 | OPEN | Training record-keeping | |
| 1 | W6-L6 | OPEN | Assessment fairness, no appeal | |
| 1 | W6-L7 | OPEN | Occupational safety during training | |
| 1 | W6-L8 | OPEN | Personal data in training notes | |
| 1 | W6-L9 | OPEN | Training notice w6_v1 wording | |
| 1 | W6-L10 | OPEN | Booking gate lifts while no contract exists | |
| 1 | W6-L11 | OPEN | Owner free text against the free-training rule | |
| 1 | W6-L12 | OPEN | Training vs productive work copy (source updated W15) | |
| 1 | W6-L13 | OPEN | Fair process for training records | |
| 1 | W7-L1 | OPEN | Use of the name "certification" | |
| 1 | W7-L2 | OPEN | Certificate validity and renewal | |
| 1 | W7-L3 | OPEN | Fairness of suspension and revocation | |
| 1 | W7-L4 | OPEN | Certificate disclosure to other owners | |
| 1 | W7-L5 | OPEN | Certificate hiring gate | |
| 1 | W7-L6 | OPEN | Verification loss never voids certificates | |
| 1 | W7-L7 | OPEN | Evidence corrected after issue | |
| 1 | W7-L8 | OPEN | Certificate retention | |
| 1 | W7-L9 | OPEN | Issuer attestation | |
| 1 | W7-L10 | OPEN | Certificate expiry notices | |
| 1 | W7-L11 | OPEN | No public verification channel | |
| 1 | W7-L12 | OPEN | Conflict of interest in certificate review | |
| 1 | W7-L13 | OPEN | Stranded suspensions | |
| 1 | W7-L14 | OPEN | Retaliation across shops | |
| 1 | W7-L15 | OPEN | Access to certification depends on shops | |
| 1 | W7-L16 | OPEN | What other owners see about the issuer | |
| 1 | W8-L1 | OPEN | Starter contract template content | |
| 1 | W8-L2 | OPEN | Locked safeguard sentences | |
| 1 | W8-L3 | OPEN | Relationship-type vocabulary | |
| 1 | W8-L4 | OPEN | Section 14 acceptance wording | |
| 1 | W8-L5 | OPEN | Unfiltered owner clause text | |
| 1 | W8-L6 | OPEN | "Safeguards prevail" precedence clause | |
| 1 | W8-L7 | OPEN | Safety section of the template | |
| 1 | W8-L8 | OPEN | Statutory-benefits section of the template | |
| 1 | W8-L9 | OPEN | Template retention | |
| 1 | W8-L10 | OPEN | Which locked clauses are mandatory | |
| 1 | W8-L11 | OPEN | Wording of training compensation | |
| 1 | W8-L12 | OPEN | Editable text contradicting locked clauses | |
| 1 | W8-L13 | OPEN | Problem-term flagging scope | |
| 2 | W9-L1 | OPEN | Acceptance record as evidence of consent | |
| 2 | W9-L2 | OPEN | Per-contract relationship type; contractor option | |
| 2 | W9-L3 | OPEN | Problem-term list and keywords | |
| 2 | W9-L4 | OPEN | Keyword flags read as legal advice | |
| 2 | W9-L5 | OPEN | Contract retention after deletion | |
| 2 | W9-L6 | OPEN | Immediate termination; notice, final pay, clearance | |
| 2 | W9-L7 | OPEN | Owner alone records the start | |
| 2 | W9-L8 | OPEN | Owner or shop removal leaves contracts unchanged | |
| 2 | W9-L9 | OPEN | Training versus productive work at activation | |
| 2 | W9-L10 | OPEN | English only; download and print | |
| 2 | W9-L11 | OPEN | Every amendment treated as material | |
| 2 | W9-L12 | OPEN | Acknowledgement statements | |
| 2 | W9-L13 | OPEN | Reclassification by amendment | |
| 2 | W9-L14 | OPEN | Owner termination without a cause check | |
| 2 | W9-L15 | OPEN | Worker "end at any time" copy | |
| 2 | W9-L16 | OPEN | No keyword category for statutory-benefit exclusions | |
| 2 | W9-L17 | OPEN | Trusted status repair of contracts | |
| 2 | W10-L1 | OPEN | Display of the three-owner goal | |
| 2 | W10-L2 | OPEN | Several concurrent engagements | |
| 2 | W10-L3 | OPEN | What counts as a qualifying relationship | |
| 2 | W10-L4 | OPEN | Relationship data is personal data | |
| 2 | W10-L5 | OPEN | Governance of the minimum-owner policy | |
| 2 | W10-L6 | OPEN | Off-platform pressure about other relationships | |
| 2 | W10-L7 | OPEN | Forward-only repairs can still end a contract | |
| 2 | W10-L8 | OPEN | Links, applications, training and certificates never count | |
| 2 | W10-L9 | OPEN | Labels for relationships that do not count | |
| 2 | W10-L10 | OPEN | Policy change reason and profile id | |
| 2 | W10-L11 | OPEN | Per-relationship goal signal to owners | |
| 2 | W11-L1 | OPEN | WashLink review of shop certificate decisions | |
| 2 | W11-L2 | OPEN | Stranded suspensions without a time limit | |
| 2 | W11-L3 | OPEN | Cross-shop retaliation hold | |
| 2 | W11-L4 | OPEN | Time windows chosen by the loop | |
| 2 | W11-L5 | OPEN | Privacy of contract reads during a reported problem | |
| 2 | W11-L6 | OPEN | Dispute channel versus labour dispute bodies | |
| 2 | W11-L7 | OPEN | Review of owner terminations | |
| 2 | W11-L8 | OPEN | Free-text statements, responses and notes | |
| 2 | W11-L9 | OPEN | Dashboard wording | |
| 2 | W11-L10 | OPEN | Single-administrator decisions and identity | |
| 2 | W11-L11 | OPEN | Route to an independent decider | |
| 2 | W11-L12 | OPEN | 90-day reporting window read as a legal deadline | |
| 2 | W11-L13 | OPEN | Statements shown to the other side | |
| 2 | W11-L14 | OPEN | Hearing the other party before closing | |
| 2 | W11-L15 | OPEN | Unverified independence claim | |
| 2 | W14-L1 | OPEN | Publisher duties on posting reports | |
| 2 | W14-L2 | OPEN | Fee, deposit and unpaid-trial postings | |
| 2 | W14-L3 | OPEN | Fairness to owners on a pause or close | |
| 2 | W14-L4 | OPEN | Reporter protection versus the right to know | |
| 2 | W14-L5 | OPEN | Effect of a WashLink close on applicants | |
| 2 | W14-L6 | OPEN | Free text in moderation | |
| 2 | W14-L7 | OPEN | Per-user activity read | |
| 2 | W14-L8 | OPEN | Relationship lookups: purpose limitation | |
| 2 | W14-L9 | OPEN | Audit-log reads | |
| 2 | W14-L10 | OPEN | Unreviewed approved shops | |
| 2 | W14-L11 | OPEN | Standard-template publishing by one administrator | |
| 2 | W14-L12 | OPEN | N6 oversight flag thresholds | |
| 2 | W14-L13 | OPEN | "Unpaid trial work or training" report reason | |
| 2 | W14-L14 | OPEN | Unconditional reporter anonymity promise | |
| 2 | W14-L15 | OPEN | Relationship lookup transparency | |
| 2 | W14-L16 | OPEN | "WashLink is not a party to any contract" statement | |
| 2 | W14-L17 | OPEN | Owner response route after a pause | |
| 2 | W12-L1 | OPEN | In-app only notices | |
| 2 | W12-L2 | OPEN | Scheduled contract expiry record | |
| 2 | W12-L3 | OPEN | Certificate expiry warnings | |
| 2 | W12-L4 | OPEN | Scheduled jobs not registered | |
| 2 | W12-L5 | OPEN | No notice when a relationship stops counting | |
| 2 | W12-L6 | OPEN | Notification retention | |
| 2 | W12-L7 | OPEN | Owner-authored labels in notices | |
| 2 | W12-L8 | OPEN | First production run; Asia/Manila date | |
| 2 | W12-L9 | OPEN | W9 contract expiry notice wording | |
| 2 | W12-L10 | OPEN | Certificate expiry notice content and timing | |
| 2 | W12-L11 | OPEN | No advance notice before a contract end date | |
| 2 | W12-L12 | OPEN | Newer standard template notifies nobody | |
| index | W13-L1 | OPEN | Contract expiry notice wording (D-72) | |
| index | W13-L2 | OPEN | Worker termination copy (D-73) | |
| index | W13-L3 | OPEN | Owner termination caution (D-73) | |
| index | W13-L4 | OPEN | Audit access governance (D-70) | |
| index | W13-L5 | OPEN | Retention periods undefined | |
| index | W13-L6 | OPEN | Human sign-off of limitations and deployment checklist | |
| index | W13-L7 | OPEN | Report handling response time and paging order | |
| index | W13-L8 | OPEN | Owner expiry notice caveat | |
| index | W13-L9 | OPEN | UI labels for a contract past its end date | |
| index | W13-L10 | OPEN | Production rollback deletes worker records | |
| index | W13-L11 | OPEN | super_admin assigns a trainee to another owner's booking | |
| index | W15-L1 | OPEN | Training booking gate scope (link history) and trainee copy | |
| index | W15-L2 | OPEN | Trainee copy shown to owners and trainers; shop-side text | |
| index | W15-L3 | OPEN | Roster link history retention and purpose (RA 10173) | |
| index | W16-L1 | OPEN | Gate hold rule; recorded pass, cancel and active contract routes | |
| index | W16-L2 | OPEN | D-85 worker copy and leaving under pressure | |
| index | W16-L3 | OPEN | Locked clause text changes only by human-run migration | |
| index | W16-L4 | OPEN | Shop deletion removes applications and cover notes (RA 10173) | |
| index | W16-L5 | OPEN | Required reason to end a contract, seen by the shop | |
| index | W16-L6 | OPEN | Landing copy "Verified car wash professionals" | |
| index | W16-L7 | OPEN | Whether the worker is told enough about the hold and leaving | |

## W13 items (hardening, final documentation, legal-review register)

What W13 does (database local proof only, D-10): super_admin audit reads now go only through the audited
`admin_workforce_audit_log`, and the review-log view is readable by trusted SQL only (D-70). The posting-report queue
is paged, oldest first (D-71). The scheduled contract expiry notice says that WashLink "now shows" the contract as
expired from the end date written in it (D-72). The worker and owner termination copy no longer states an unconditional
right to end a contract (D-73). Accepted limitations are listed in `docs/workforce/LIMITATIONS.md` (D-74). This
register was split into an index and two parts (D-75). Nothing in the code, UI copy or docs may state that a contract
legally ended, that anyone was legally notified, or claim compliance for any feature. Notes (all stay **OPEN**):
**W12-L9 / W12-L2** -> W13-L1; **W9-L15** -> W13-L2; **W9-L14 / W11-L7** -> W13-L3; **W3-L3 / W14-L9** -> W13-L4;
**W3-L1 / W12-L6 / W14-L8** -> W13-L5; **W14-L1 / W14-L3** -> W13-L7. W13 review (compliance): **W13-L1** -> W13-L8 / W13-L9;
**W9-L5 / W13-L5** -> W13-L10; **W0-L2 / W6-L2** -> W13-L11.

| ID | Status | Item for review | Source |
|---|---|---|---|
| W13-L1 | OPEN | Contract expiry notice wording (D-72; extends W12-L9 and W12-L2). Worker: "Your contract with <shop> reached the end date written in it, so WashLink now shows it as expired. What this means for your work depends on the contract terms and the law."; owner (after W13 fix cycle 1): "A contract reached the end date written in it, so WashLink now shows it as expired. What this means for you and the worker depends on the contract terms and the law."; notice title unchanged "Contract expired" (the UI status label is "Past end date", see W13-L9). Review whether this wording and the title avoid stating that the work relationship legally ended, and whether expiry needs a formal notice outside WashLink. Notices already sent keep the W9 wording (true records). | `supabase/migrations/2026_10_30_w13d_contract_expiry_notice_wording.sql`; `supabase/tests/database/j15_w13_contract_expiry_notice_wording.test.sql` |
| W13-L2 | OPEN | Worker termination copy (D-73; W9-L15): "You can record the end of this contract on WashLink at any time. Give a short reason; the shop will see it. Notice periods or other duties under your contract or the law may still apply. Final pay and clearance are not handled on WashLink." The worker contracts intro now reads "You can decline an offer, or record the end of an accepted contract, on WashLink at any time." (W13 fix cycle 1, C1; before: "You can always decline an offer or end an accepted contract."). Review the accuracy of both texts and whether they are enough for a worker to understand what recording an end does and does not do. | `frontend/src/presentation/utilities/workerContractCopy.ts` (`workerTerminateText`, `myContractsIntroText`) |
| W13-L3 | OPEN | Owner termination caution (D-73; W9-L14, W11-L7): the owner sees "Ending a work relationship can have legal requirements such as a proper cause and notice. WashLink only records the end." Review whether a general caution is enough, or whether cause or notice steps are needed before an owner can record an end. | `frontend/src/presentation/utilities/workerContractCopy.ts` (`ownerTerminationCautionText`, appended to `ownerTerminateText`) |
| W13-L4 | OPEN | Audit access governance (D-70; W3-L3, W14-L9): super_admin reads of audit rows are logged (`workforce_audit.log_searched`); reads by database operators through trusted SQL (SQL editor, psql) are not logged. Review who may hold database access, under what controls, and whether operator reads must be recorded. | `supabase/migrations/2026_10_30_w13b_admin_audit_reads_only_through_rpc.sql`; `supabase/tests/database/j17_w13_admin_audit_reads.test.sql` |
| W13-L5 | OPEN | Retention periods remain undefined for audit events, notifications, contracts, acceptance records and training evidence (W3-L1, W12-L6, W14-L8; D-18, D-32). The trusted purge procedure exists but no period is set; the loop does not invent one. | `docs/workforce/AUDIT_AND_NOTIFICATIONS.md` (trusted retention purge); `docs/workforce/LIMITATIONS.md` |
| W13-L6 | OPEN | Accepted limitations (D-74) and the deployment checklist must be reviewed and signed by humans before production. The loop signs nothing and ticks no gate. | `docs/workforce/LIMITATIONS.md`; `docs/workforce/DEPLOYMENT_READINESS.md` |
| W13-L7 | OPEN | Report handling has no response-time commitment, and oldest-first paging (50 per page) can delay attention to new reports (D-71; W14-L1, W14-L3). Review whether a response standard or a priority rule is needed for reports such as discriminatory or fee-charging postings. | `supabase/migrations/2026_10_30_w13c_admin_moderation_queue_paging.sql`; `supabase/tests/database/j2_w13_moderation_queue_paging.test.sql` |
| W13-L8 | OPEN | (REVIEW, compliance) The owner expiry notice at first had no counterpart to the worker's "What this means for your work depends on the contract terms and the law." W13 fix cycle 1 (C2) changed it to "A contract reached the end date written in it, so WashLink now shows it as expired. What this means for you and the worker depends on the contract terms and the law." The owner is the party most likely to act on "expired" (for example by stopping work or pay, or by letting work continue past the end date without a new contract). Review whether this caveat is enough, and what an owner must do outside WashLink when a written end date passes. | `supabase/migrations/2026_10_30_w13d_contract_expiry_notice_wording.sql` (live body, owner branch) |
| W13-L9 | OPEN | (REVIEW, compliance) The contract UI described an expired contract as ended ("Ended (end date passed)", "Ended when the end date passed", "The contract reached its end date."). W13 fix cycle 1 (C3, C4) changed the labels to "Past end date" (status), "End date passed (recorded on WashLink)" (ended by) and "The contract's end date has passed (recorded on WashLink)." (relationship reason, worker and owner), and the w13d header now names "Past end date" as the UI label. Review these labels with W13-L1: whether they still read as a statement that the work relationship ended. | `frontend/src/presentation/utilities/workerContractDisplay.ts:23`, `:60`; `frontend/src/presentation/utilities/ownerRelationshipDisplay.ts:53`, `:65`; `supabase/migrations/2026_10_30_w13d_contract_expiry_notice_wording.sql` (header) |
| W13-L10 | OPEN | (REVIEW, compliance) A production rollback of W9, W7, W6 or W5 irreversibly deletes contracts, sealed versions and acceptance records, issued certificates, training attendance and assessment evidence, and applications. The guide requires an export and the project owner's written approval, but no legal or data-privacy review and no notice to the workers whose records are removed. Review what records must be kept or handed to workers before such a step, and whether a rollback that deletes them may be done at all once the module is in use. | `docs/workforce/ROLLBACK_GUIDE.md` (preconditions, "Per-increment blocks" W5..W9 rows) |
| W13-L11 | OPEN | (REVIEW, compliance) A super_admin can assign a worker who is in required (free) training with one owner to another owner's customer booking, outside the training booking gate (W6 REVIEW carry-forward, LIMITATIONS "W6 (admin assignment)"). This was never raised as a legal item. `ARCHITECTURE.md` stated without exception that a trainee in required training cannot be assigned to a customer booking (corrected in W13 fix cycle 1). Review whether productive work for any shop during required training must be refused for every role, including WashLink administrators. | w6h `bookings_guard_training_assignment`; `docs/workforce/LIMITATIONS.md` (free-training gaps); `docs/workforce/ARCHITECTURE.md` (key data rules) |

## W15 items (required-training booking gate, training copy, link history)

What W15 does (database local proof only, D-10): migration
`2026_11_03_w15a_training_gate_roster_link_history.sql` records every account ever linked to a roster row in an
internal table (`roster_link_history`, no client access) and keys the w6h training booking gate on that history, so an
owner or worker unlinking the trainee's roster row no longer lets the training shop assign that row (D-79, D-80). No
unlink is refused. The trainee copy `trainingVersusPaidWorkText` now states only what the gate enforces (D-81). Notes
(all stay **OPEN**): **W6-L12** (source note added, copy quoted as shipped) -> W15-L1; **W13-L11** (super_admin
assignment, unchanged) is related, not replaced. W15 review (compliance): **W15-L1** -> W15-L2 (the copy shown to owners
and trainers); **W3-L1 / W12-L6 / W13-L5** -> W15-L3 (retention). Later increments cross-reference W15-L1 for F-C2 /
F-C3 instead of adding duplicates.

| ID | Status | Item for review | Source |
|---|---|---|---|
| W15-L1 | OPEN | The training booking gate (w6h, W15 D-79) refuses the training shop's assignment of a roster row that is or was linked to a trainee in live required training. It cannot detect a row never linked to the trainee (name-only, or deleted and re-created), links ended before the W3 audit trail, work for other shops, super_admin assignment to another owner's booking (W13-L11) or trusted SQL sessions. Review whether this is enough for the free-training rule and whether the D-81 worker copy describes it fairly (F-C2, F-C3). The worker copy as shipped: "Training is not productive work for customers. While your required training is unfinished, WashLink refuses the training shop's requests to assign you to its customer bookings through a roster entry that is or was linked to your account. WashLink cannot detect a roster entry that was never linked to your account, or work arranged outside WashLink. Terms for any later customer work are agreed separately and are not part of this training." Fix cycle 1 additions (W15 REVIEW SEC-3, SEC-4, C-SF-2): (a) D-80 re-used rows: a later worker on a row once linked to a trainee is refused with the w6h texts, which read as if that worker were in training (owner: "This worker is in required training with your shop ..."; worker on start: "You are in required training with this shop ..."); the workaround is that the new worker unlinks the old row first (`workers_owner_user_unique` allows one row per owner per account), then the owner adds a new row; a leaked or misdirected link code accepted by a trainee taints that row while the training is live. (b) A booking already in progress on a row can be completed by a trainee who links to that row later (completion is never refused). | `supabase/migrations/2026_11_03_w15a_training_gate_roster_link_history.sql`; w6h `roster_worker_in_required_training`; `frontend/src/presentation/utilities/trainingNoticeCopy.ts` (`trainingVersusPaidWorkText`); `docs/workforce/LIMITATIONS.md` (free-training gaps) |
| W15-L2 | OPEN | (REVIEW, compliance) The D-81 trainee copy is written to the trainee ("your required training", "assign you", "your account"). It is also shown unchanged to owners and to designated trainers: the owner programs panel, the program manage view, the owner program preview and editor preview, and the trainer's "Training I run" panel. In those views it does not describe the reader. It also tells the shop that the gate restrains how it can be avoided ("WashLink cannot detect a roster entry that was never linked to your account"). The owner views no longer carry a rule statement that trainees must not be given customer work; before W15 they read the absolute W6 sentence quoted as "Copy before" in `loop/workforce/increments/W15/LEGAL_FLAGS.md` (not repeated here, so the W15 AC10 grep for it stays empty). Review the owner- and trainer-facing wording, and whether the detection limits should be disclosed to the shop. Fix cycle 1 (C-SF-1): owner and trainer views now show a separate shop-side text, `shopTrainingVersusPaidWorkText`, as shipped: "Training is not productive work for customers. The training shop may not assign trainees to customer bookings while their required training is unfinished. WashLink refuses such assignments through roster entries that are or were linked to the trainee's account. Terms for any later customer work are agreed separately and are not part of this training." Trainee views keep the D-81 text. Review this wording too, including whether naming the linked-row scope tells the shop too much. | `frontend/src/presentation/utilities/trainingNoticeCopy.ts` (`trainingVersusPaidWorkText`, `shopTrainingVersusPaidWorkText`); `frontend/src/presentation/components/training/TrainingNotices.tsx` (`audience`); `frontend/src/presentation/components/owner/training/OwnerTrainingProgramsPanel.tsx:112`, `:184`; `.../owner/training/TrainingProgramManageView.tsx:54`; `.../owner/training/TrainingProgramEditorModal.tsx:94` (via `TrainingProgramDetailsView.tsx:51`); `.../worker/training/TrainerProgramsPanel.tsx:83` |
| W15-L3 | OPEN | (REVIEW, compliance; data privacy) `roster_link_history` keeps a permanent record that an account was once linked to an owner's roster row. The record survives the worker's own unlink and is never shown to the worker. It is deleted only with the roster row or the account, and it has no retention period. Its stated purpose is the training booking gate, but it is kept after the training ends. Review the purpose limitation, the retention, and whether the worker must be told (with W3-L1, W12-L6 and W13-L5). | `supabase/migrations/2026_11_03_w15a_training_gate_roster_link_history.sql:38-52` (table), `:54-84` (recorder trigger), `:86-123` (backfill function and call; after W15 fix cycle 1) |

## W16 items (gate hold rule, locked clause pin, final review)

What W16 does (database local proof only, D-10): w16a keeps the training booking gate on until the enrollment ends or
truly completes (D-83, D-84); w16b refuses any added, removed or changed locked clause in a new platform version (D-87); the owner shop
removal confirm states what is deleted (D-86, no guard). Notes (all stay **OPEN**): F-C2 and F-C3 stay with **W15-L1 / W15-L2**,
which quote the W15 copy as shipped (D-85 text: W16-L2). **W6-L10 / W6-L12** have W16 notes in part 1.

| ID | Status | Item for review | Source |
|---|---|---|---|
| W16-L1 | OPEN | Training booking gate hold rule (D-83, D-84): the gate holds while the enrollment is accepted, required initial and not completed, also after a failed assessment or a shop deletion; there is no time limit. Review whether this fits the free-training rule; whether a cancel at 0 attended days followed by assignment, or a recorded pass the worker cannot dispute (W6-L13), leaves too wide a route; and whether an active contract should release the hold (today a contract can activate while assignment is refused). Fix cycle 1 additions (W16 REVIEW N2, N4): (a) a later worker on a re-used roster row (D-79, D-80) can be held permanently, has nothing of their own to leave, and reads a refusal message that is false for them; the workaround is a new roster row, and changing D-79 is a human decision. (b) An accepted booking pre-assigned to a held trainee at a deleted shop has no way forward except the trainee leaving; the customer's cancel is refused too. (c) The owner deleting their account also removes the gate (audited), with the enrollment still reading accepted. Related W15-L1, W6-L10, W9-L9. | `supabase/migrations/2026_11_04_w16a_training_gate_holds_until_enrollment_ends.sql`; `docs/workforce/LIMITATIONS.md` ("Final review outcomes") |
| W16-L2 | OPEN | D-85 worker copy and the leave action: whether leaving under owner pressure, or a `failed` display becoming `withdrawn`, disadvantages the worker; whether the worker is told enough. The owner cannot lift a `shop_removed` hold alone, so may press the worker to leave; shop copy avoids suggesting it and WashLink cannot detect it. Texts as shipped (after W16 fix cycle 1). Worker note: "Training is not productive work for customers. While your required training is unfinished, WashLink refuses requests by the training shop's owner to assign you to that owner's customer bookings through a roster entry that is or was linked to your account. This continues after a not-passed assessment or if the shop is removed, until the training is completed, is cancelled or you leave it; once the shop is removed, only leaving ends it. WashLink cannot detect a roster entry that was never linked to your account, or work arranged outside WashLink. Terms for any later customer work are agreed separately and are not part of this training." Shop note: "Training is not productive work for customers. The training shop's owner may not assign trainees to that owner's customer bookings while their required training is unfinished. WashLink refuses such assignments through roster entries that are or were linked to the trainee's account. This continues after a not-passed assessment or a shop removal, until the training is completed, is cancelled or the trainee leaves. Terms for any later customer work are agreed separately and are not part of this training." Failed: "Your assessment is recorded as not passed. This training stays open until the shop records a passing correction or cancels it, or you leave it. While it stays open, WashLink refuses this owner's requests to assign you to their customer bookings through a linked roster entry. You can leave at any time: close this window and press "Leave training" on this training in your list." Failed after a shop removal, where only the worker can end the training: "Your assessment is recorded as not passed and the shop is no longer on WashLink. This training stays open until you leave it. While it stays open, WashLink refuses this owner's requests to assign you to their customer bookings through a linked roster entry. You can leave at any time: close this window and press "Leave training" on this training in your list." Shop removed: "This shop is no longer on WashLink. Your training records are kept for you; nobody can add new records. This training stays open until you leave it. While it stays open, WashLink refuses this owner's requests to assign you to their customer bookings through a linked roster entry. You can leave at any time: close this window and press "Leave training" on this training in your list." Leave confirm: "Your training ends unfinished. Your records stay visible to you. This cannot be undone; the shop would need to invite you again. This training's owner may then be able to assign you to their customer bookings. If a not-passed assessment is recorded, it can no longer be corrected once you leave. A new invitation starts again at 0 attended days." Related W15-L2, W6-L13, W16-L7. | `frontend/src/presentation/utilities/trainingNoticeCopy.ts`; `frontend/src/presentation/utilities/trainingDisplay.ts` (`failedTrainingExplanation`, `shopRemovedExplanation`); `frontend/src/domain/utilities/trainingEnrollmentLifecycle.ts` |
| W16-L3 | OPEN | F-C1 (D-87, widened in W16 fix cycle 1): a non-trusted session cannot add, remove or change any locked safeguard clause in a new platform version, so that text changes only by a human-run migration. Nothing requires a second reviewer on that migration, and no such migration has been run. Added or changed editable clauses are still allowed and can contradict a safeguard (W8-L12). Clause order is not compared, so an administrator can reorder locked clauses within a section. Versions published before the pin are not re-checked. Related W8-L1, W8-L10, W8-L11, W8-L12. | `supabase/migrations/2026_11_04_w16b_contract_template_core_text_pin.sql` |
| W16-L4 | OPEN | F-S2 (D-86): shop deletion deletes not-accepted applications and cover notes; accepted applications keep a copy without the note; applicants are told only that an application ended. Whether workers must keep more, and for how long (RA 10173). Related W5-L10, W9-L5, W13-L5. | `frontend/src/presentation/utilities/shopRemovalCopy.ts`; w9i `job_applications_retain_accepted` |
| W16-L5 | OPEN | F-C6: a worker must give a 10..500 character reason to end a contract, and the shop sees it. Related W13-L2, W7-L14. | `frontend/src/presentation/utilities/workerContractCopy.ts`; w9 `terminate_worker_contract` |
| W16-L6 | OPEN | F-C5: pre-existing landing copy "Verified car wash professionals" against no worker identity verification. | `frontend/src/features/auth/AuthLandingPage.tsx:143` |
| W16-L7 | OPEN | (REVIEW, compliance) Whether the worker is told enough, at the moment it matters, about the hold and about leaving. W16-L2 asks this in general; this item lists the specific gaps. No notification is sent when the training shop is deleted (audit only). The not-passed notification says only "Not passed." and mentions neither the hold nor leaving. The hold explanation is inside "View progress and records", while "Leave training" is on the list card behind that dialog, and the explanation does not name the button. The refusal on starting a booking says "until the training ends" and does not name the leave action. The leave confirm does not say that the same owner can then assign customer bookings with no contract required (W6-L10), that a not-passed record can no longer be corrected after leaving, or that attended days count only for that enrollment, so a new invitation starts again at 0 days. Nothing tells the worker that leaving is their own choice, which matters where the owner presses them to leave. Review whether these notices are needed, and their wording. Related W16-L1, W16-L2, W6-L10, W6-L13. Fix cycle 1 (C-S1, C-S2) changed part of this: the hold explanations now name the "Leave training" button and where it is, and the leave confirm now states that the owner may then be able to assign customer bookings, that a not-passed record can no longer be corrected and that a new invitation starts at 0 attended days (texts in W16-L2). It does not say that no contract is required, or that leaving is the worker's own choice. The notification gaps and the refusal message are unchanged. | w6i training enrollment audit trigger (`training_enrollment.shop_removed`) and `training_evidence_audit`; w6g `insert_training_assessment`; w6d `training_enrollment_attended_days`; w6h `bookings_guard_training_assignment`; `frontend/src/presentation/components/worker/training/MyTrainingsPanel.tsx:97-102`, `:142`; `frontend/src/presentation/utilities/trainingDisplay.ts`; `docs/workforce/TRAINING.md:40-41` |
