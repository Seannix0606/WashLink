# W15 - LEGAL_FLAGS (BUILD step (frontend + docs), new item)

All items OPEN, for review by a qualified Philippine labor-law professional. The loop is not a lawyer and makes no
compliance statement. Nothing in the W15 code, UI copy or docs states that the training booking gate prevents all
productive work during required training, that free training is legally assured, that any human gate in
`docs/workforce/DEPLOYMENT_READINESS.md` is done, or claims compliance for any feature. W15-L1 is taken from PLAN.md
section 7. It was written against the plan's description of `2026_11_03_w15a_training_gate_roster_link_history.sql`
(D-79, D-80) and against the D-81 copy in `frontend/src/presentation/utilities/trainingNoticeCopy.ts`
(`trainingVersusPaidWorkText`) as present on 2026-11-03, while the DB step was still running; the DB step's results
are in the W15 LOG. The item is in `docs/workforce/LEGAL_REVIEW_REGISTER.md` (section "W15 items", OPEN; register
total 165). Notes in the register: W6-L12 (source note added in `docs/workforce/legal/REGISTER_PART_1_W0_W8.md`,
quoting the copy as shipped; "Training is not paid work." was removed in the W6 review polish, F-C3) -> W15-L1.
W13-L11 (super_admin assignment to another owner's booking) is related and unchanged. Every earlier item stays OPEN;
none was merged, closed or deleted. Later increments cross-reference W15-L1 for F-C2 / F-C3 instead of adding
duplicates.

Copy before (W6 review polish): "Training is not productive work for customers. Trainees cannot be assigned to
customer bookings while their required training is unfinished. Terms for any later customer work are agreed
separately and are not part of this training." The `w6_v1` notice and the owner attestation (`w6_owner_v1`) are
unchanged.

| ID | Status | Item for review | Source |
|---|---|---|---|
| W15-L1 | OPEN | The training booking gate (w6h, W15 D-79) refuses the training shop's assignment of a roster row that is or was linked to a trainee in live required training. It cannot detect a row never linked to the trainee (name-only, or deleted and re-created), links ended before the W3 audit trail, work for other shops, super_admin assignment to another owner's booking (W13-L11) or trusted SQL sessions. Review whether this is enough for the free-training rule and whether the D-81 worker copy describes it fairly (F-C2, F-C3). The worker copy as shipped: "Training is not productive work for customers. While your required training is unfinished, WashLink refuses the training shop's requests to assign you to its customer bookings through a roster entry that is or was linked to your account. WashLink cannot detect a roster entry that was never linked to your account, or work arranged outside WashLink. Terms for any later customer work are agreed separately and are not part of this training." Fix cycle 1 additions (W15 REVIEW SEC-3, SEC-4, C-SF-2): (a) D-80 re-used rows: a later worker on a row once linked to a trainee is refused with the w6h texts, which read as if that worker were in training (owner: "This worker is in required training with your shop ..."; worker on start: "You are in required training with this shop ..."); the workaround is that the new worker unlinks the old row first (`workers_owner_user_unique` allows one row per owner per account), then the owner adds a new row; a leaked or misdirected link code accepted by a trainee taints that row while the training is live. (b) A booking already in progress on a row can be completed by a trainee who links to that row later (completion is never refused). | `supabase/migrations/2026_11_03_w15a_training_gate_roster_link_history.sql`; w6h `roster_worker_in_required_training`; `frontend/src/presentation/utilities/trainingNoticeCopy.ts` (`trainingVersusPaidWorkText`); `docs/workforce/LIMITATIONS.md` (free-training gaps) |

## REVIEW (compliance) additions - 2026-11-03

Added by the W15 compliance review. All OPEN, for review by a qualified Philippine labor-law professional (W15-L3 also
by a qualified data-privacy professional, RA 10173). No compliance statement is made. They are not yet in
`docs/workforce/LEGAL_REVIEW_REGISTER.md`. The register total (and the `workforceDocs.w13.test.ts` pin) must go from 165 to
167 when they are added.

| ID | Status | Item for review | Source |
|---|---|---|---|
| W15-L2 | OPEN | (REVIEW, compliance) The D-81 trainee copy is written to the trainee ("your required training", "assign you", "your account"). It is also shown unchanged to owners and to designated trainers: the owner programs panel, the program manage view, the owner program preview and editor preview, and the trainer's "Training I run" panel. In those views it does not describe the reader. It also tells the shop that the gate restrains how it can be avoided ("WashLink cannot detect a roster entry that was never linked to your account"). The owner views no longer carry a rule statement that trainees must not be given customer work; before W15 they read "Trainees cannot be assigned ...". Review the owner- and trainer-facing wording, and whether the detection limits should be disclosed to the shop. Fix cycle 1 (C-SF-1): owner and trainer views now show a separate shop-side text, `shopTrainingVersusPaidWorkText`, as shipped: "Training is not productive work for customers. The training shop may not assign trainees to customer bookings while their required training is unfinished. WashLink refuses such assignments through roster entries that are or were linked to the trainee's account. Terms for any later customer work are agreed separately and are not part of this training." Trainee views keep the D-81 text. Review this wording too, including whether naming the linked-row scope tells the shop too much. | `frontend/src/presentation/utilities/trainingNoticeCopy.ts` (`trainingVersusPaidWorkText`, `shopTrainingVersusPaidWorkText`); `frontend/src/presentation/components/training/TrainingNotices.tsx` (`audience`); `frontend/src/presentation/components/owner/training/OwnerTrainingProgramsPanel.tsx:112`, `:184`; `.../owner/training/TrainingProgramManageView.tsx:54`; `.../owner/training/TrainingProgramEditorModal.tsx:94` (via `TrainingProgramDetailsView.tsx:51`); `.../worker/training/TrainerProgramsPanel.tsx:83` |
| W15-L3 | OPEN | (REVIEW, compliance; data privacy) `roster_link_history` keeps a permanent record that an account was once linked to an owner's roster row. The record survives the worker's own unlink and is never shown to the worker. It is deleted only with the roster row or the account, and it has no retention period. Its stated purpose is the training booking gate, but it is kept after the training ends. Review the purpose limitation, the retention, and whether the worker must be told (with W3-L1, W12-L6 and W13-L5). | `supabase/migrations/2026_11_03_w15a_training_gate_roster_link_history.sql:38-52` (table), `:54-84` (recorder trigger), `:86-123` (backfill function and call; after W15 fix cycle 1) |

## Fix cycle 1 (frontend + docs) - 2026-11-03

W15-L1 gains the D-80 side effects (SEC-3, C-SF-2) and SEC-4. W15-L2 records the owner / trainer text as shipped
(C-SF-1). W15-L1..L3 are now OPEN rows in `docs/workforce/LEGAL_REVIEW_REGISTER.md` ("W15 items"; register total 167,
index 14; `workforceDocs.w13.test.ts` pins 167). Rewording an item records what shipped; it resolves nothing.
