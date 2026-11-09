# 07 · Tests that pin the UI

> Documented 2026-11-10 from `main` at `4012ce7`. A redesign must keep these green; change a test only when the
> behavior it checks is deliberately changing, and say so in the commit.

Run: `cd frontend && npx vitest run` (522 tests), plus `npx tsc -b` and `npm run lint`.

| Test file | What it locks down |
|---|---|
| `frontend/src/features/b2c/b2cScreens.test.tsx` | Request card (distance band, no address before accept, expiry); job card (one next action, start window, paused state, operator cancel); washer home notices; booking card (confirm before cancel, rating, overdue cancel); wizard Review and Service (draft prices); admin panel (add-on form, Hide, suspend reason, cancel reason ≥ 10 characters, operator badge) |
| `frontend/src/features/b2c/landing/PublicLandingPage.test.tsx` | Exactly one `h1`; book and sign-in buttons open the auth forms; live prices only; no app-store claim |
| `frontend/src/features/auth/AuthLandingPage.j1.test.tsx`, `RolePickerGrid.j1.test.tsx` | Sign-up flow and role picker (with washer sign-up on) |
| `frontend/src/features/auth/WasherSignUpClosed.test.tsx` | No account-type choice, customer sign-up, landing without the washer section |
| `frontend/src/features/install/useInstallPrompt.test.tsx` | Install button appears on the browser's offer and disappears once installed |
| `frontend/src/features/b2c/DeleteAccountSection.test.tsx` | Exact delete-account wording |
| `frontend/src/features/b2c/worker/WorkerDocumentsPanel.test.tsx` | Washer verification documents panel |
| `frontend/src/features/b2c/admin/WasherVerificationCard.test.tsx`, `WorkerDocumentReview.test.tsx` | Admin washer review |
| `frontend/src/features/b2c/admin/addonKey.test.ts` | Add-on keys and no motorcycle in customer vehicle choices |
| `frontend/src/features/b2c/sharedPackage.b2c.test.ts` | Shared tokens: brand-700 must match `index.css` |
| `frontend/src/features/superAdmin/SuperAdminDashboardPage.*.test.tsx` | Admin tab names and counts (B2B mode) |

Most tests find elements by role and accessible name (button and tab names, field labels), so a visual redesign is
safe as long as those names stay the same.
