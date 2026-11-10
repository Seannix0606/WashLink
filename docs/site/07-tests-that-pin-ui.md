# 07 · Tests that pin the UI

> Documented 2026-11-10 from `feature/ui-redesign` (stages 1–4). Change a test only when the behavior it checks is
> deliberately changing, and say so in the commit.

Run: `cd frontend && npx vitest run` (556 tests), plus `npx tsc -b` and `npm run lint`.

| Test file | What it locks down |
|---|---|
| `frontend/src/features/b2c/b2cScreens.test.tsx` | Customer bookings groups and calendar view; admin Hidden group and history under its row; request card (distance band, no address before accept, expiry); job card (one next action, start window, paused state, operator cancel); washer home notices; booking card (confirm before cancel, rating, overdue cancel); wizard Review and Service (draft prices); admin panel (add-on form, Hide, suspend reason, cancel reason ≥ 10 characters, operator badge) |
| `frontend/src/features/b2c/landing/PublicLandingPage.test.tsx` | Exactly one `h1`; book and sign-in buttons open the auth forms; live prices only; no app-store claim |
| `frontend/src/features/auth/AuthLandingPage.j1.test.tsx`, `RolePickerGrid.j1.test.tsx` | Sign-up flow and role picker (with washer sign-up on) |
| `frontend/src/features/auth/WasherSignUpClosed.test.tsx` | No account-type choice, customer sign-up, landing without the washer section |
| `frontend/src/features/install/useInstallPrompt.test.tsx` | Install button appears on the browser's offer and disappears once installed |
| `frontend/src/features/b2c/DeleteAccountSection.test.tsx` | Exact delete-account wording |
| `frontend/src/features/b2c/worker/WorkerDocumentsPanel.test.tsx` | Washer verification documents panel |
| `frontend/src/features/b2c/admin/WasherVerificationCard.test.tsx`, `WorkerDocumentReview.test.tsx` | Admin washer review |
| `frontend/src/features/b2c/admin/addonKey.test.ts` | Add-on keys and no motorcycle in customer vehicle choices |
| `frontend/src/presentation/theme/theme.test.tsx` | Light / Dark / Auto rules, theme-init.js in step with the app, every color token has a dark value, storage failures, keyboard use of the switch |
| `frontend/src/presentation/design/ui/statusColors.test.tsx` | Every status in a group, AA contrast of status colors in both themes, distinct colors, StatusPill words, Section region and heading, Tabs keys and no wrapping |
| `frontend/src/presentation/components/calendar/MonthCalendar.test.tsx` | Monday-first grid, day labels, pills and "+N more", dashed requests, day selection, keyboard and month navigation, List / Calendar remembered |
| `frontend/src/features/b2c/manilaCalendar.test.ts` | Manila day boundaries, month grids, month names |
| `frontend/src/features/b2c/stage4Copy.test.ts` | Per-step washer notices, landing copy, description and sharing tags, robots.txt, sitemap, preview image, favicon |
| `frontend/src/features/b2c/sharedPackage.b2c.test.ts` | Shared tokens: brand-700 must match `index.css` |
| `frontend/src/features/superAdmin/SuperAdminDashboardPage.*.test.tsx` | Admin tab names and counts (B2B mode) |

Most tests find elements by role and accessible name (button and tab names, field labels), so a visual redesign is
safe as long as those names stay the same.
