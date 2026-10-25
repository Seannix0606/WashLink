# W4 - Job openings (owner) - LEGAL FLAGS

Written by the compliance REVIEW step. These are items for review by a qualified Philippine
labor-law professional. Nothing here states that anything is legally compliant. Copy each item
into `docs/workforce/LEGAL_REVIEW_REGISTER.md` (W13). Status of every item: OPEN.

## From PLAN section 11

| ID | Item | Where |
|---|---|---|
| W4-L1 | Pay, benefits, schedule and other terms are typed by the owner and shown exactly as entered. Nothing checks them against wage orders or labor standards, e.g. a rate below the regional minimum wage. Review whether postings need extra disclosures or validation, and whether the disclaimer "Details as entered by the shop. WashLink does not verify pay or employment terms." is enough. | `frontend/src/presentation/utilities/jobOpeningDisplay.ts:62-63`; `supabase/migrations/2026_10_24_w4c_job_openings.sql` |
| W4-L2 | `job_type` (full time / part time / temporary / other) is only a schedule category. A posting never decides the employment classification (W0-L3; W9 decides). Review whether "Temporary" or "Other" could suggest a classification to workers. | `jobOpeningDisplay.ts:30-35`; `JobOpeningBasicsSection.tsx:137` |
| W4-L3 | `trainees_welcome` and the free-text "Required training" field must not advertise unpaid work as training, or charge a training fee (W0-L2, spec D free-training rule). W4 has no free-training notice and no link to a W6 program yet. Review the wording before any worker-facing marketplace (W5) shows these fields. | `JobOpeningRequirementsSection.tsx:25-44,136-146`; `JobOpeningPreview.tsx:138-168` |
| W4-L4 | Free-text requirements are not filtered for discriminatory content, e.g. an age preference (RA 10911) or a sex requirement. Review the platform's moderation and notice duties. | `JobOpeningRequirementsSection.tsx:58-134`; `JobOpeningBasicsSection.tsx:56-93` |
| W4-L5 | "Shop-issued certification required" means a shop-issued certificate only, never a government-recognized one (W0-L5). Review whether asking applicants for a shop-issued certificate is acceptable as a hiring requirement. | `jobOpeningDisplay.ts:46-50`; `JobOpeningRequirementsSection.tsx:30` |
| W4-L6 | How long to keep deleted drafts, archived openings and their `job_opening.*` audit rows (with W3-L1). Audit rows outlive the opening. | `2026_10_24_w4d_job_opening_transitions_and_audit.sql` |

## New (REVIEW)

| ID | Item | Where |
|---|---|---|
| W4-L7 | Discriminatory requirements other than age: sex, civil status, pregnancy, disability, religion, ethnicity, appearance or height in the qualification, skills, experience and availability free text. Also the question of whether a lawful minimum age (child-labor rules for hazardous work, e.g. handling chemicals) is an allowed exception to an age-preference ban, and how a shop should state it. Proposed later work: helper text that tells owners not to add these requirements (W5 or W11), plus moderation and reporting (W11). | same fields as W4-L4 |
| W4-L8 | The "Other terms", "Benefits" and "Pay details in your words" fields are shown as entered. They could contain waivers of mandatory rights (statutory contributions, 13th-month pay), an "unpaid trial period", deposit or fee demands, or training-fee terms. Review whether postings need blocked terms or flagging, and whether verbatim display creates platform exposure. | `JobOpeningPayAndTermsSection.tsx:101-135`; `JobOpeningPreview.tsx:120-136` |
| W4-L9 | Publisher role. The age-advertising prohibition (RA 10911) also covers printing or publishing job notices. Review WashLink's duties as the party that publishes owner postings. | worker read policy `jo_select_published_for_workers` (w4c) |
| W4-L10 | Recruitment and placement. Review whether running a job-posting and application marketplace counts as recruitment and placement activity, which includes advertising for employment (Labor Code Art. 13(b)), and so needs DOLE registration or a license. This should be settled before W5 opens applications. | product-level; W5 |
| W4-L11 | Pay periods "per_task" and "hour", and a "From PHP X" display when only a minimum amount is entered. Review whether piece-rate or open-ended pay statements need extra disclosure in a posting. | `jobOpeningDisplay.ts:38-44,96-101` |
