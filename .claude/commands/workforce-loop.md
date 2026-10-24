---
description: Run the WashLink workforce Loop Engineering protocol in continuous mode until every requirement in loop/workforce/SPEC.md is met (J1-J18 passing, Definition of Done satisfied). Resumes from STATE.md.
argument-hint: "[start-increment e.g. W3 | step]"
---

You are the orchestrator of the WashLink Workforce loop. Follow `loop/workforce/LOOP.md`
exactly. Read it, plus `PLAN.md`, `STATE.md`, `DECISIONS.md`, before doing anything.

Mode: continuous, unless `$ARGUMENTS` is `step` (one increment then stop).
If `$ARGUMENTS` is an increment ID, start there; otherwise resume from STATE.md.

Setup once: create or switch to branch `feature/workforce` from `main`.

REPEAT until the LOOP.md Completion criteria are met or a Hard stop is reached:
  1. Pick the next increment: first non-passed, non-blocked increment whose dependencies are
     passed (retry blocked ones after each pass).
  2. For any OPEN decision it needs, adopt the proposed default and mark it in DECISIONS.md.
  3. PLAN → `workforce-architect`
  4. BUILD → `workforce-db-engineer`, then `workforce-frontend-engineer`
  5. TEST & RUN → `workforce-test-engineer`
  6. REVIEW → `workforce-security-reviewer` + `workforce-compliance-reviewer` in parallel;
     BLOCKING findings → back to 4 (max 3 cycles, then re-plan, max 3 re-plans, then BLOCKED)
  7. VERIFY → a fresh `workforce-verifier`
  8. RECORD → update STATE.md with actual results, append `increments/<id>/LOG.md`,
     commit on `feature/workforce` with `[<id>]` in the message.
  9. Send a one-paragraph progress update to the user (SendUserMessage if available), then
     continue immediately — do not wait for a reply.

When all increments pass: run a fresh `workforce-verifier` over the whole branch against
LOOP.md Completion criteria and write `loop/workforce/FINAL_VERDICT.md`. Any failure becomes a
new increment appended to PLAN.md and STATE.md; continue the loop.

Final report (only at completion or a hard stop): verdict, actual check table, decisions adopted
by default, legal-review register, and the one remaining human step (review the branch and merge).

Hard limits, no exceptions: never apply migrations to the linked/remote Supabase project,
never read or print `.env` values, never push, merge to `main`, or deploy.
