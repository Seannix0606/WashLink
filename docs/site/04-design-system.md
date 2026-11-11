# 04 · Design system: tokens, themes, status colors and primitives

> Documented 2026-11-10 from `feature/ui-redesign` (stages 1–4 of the UI redesign). The baseline before the redesign
> is `1687f86` (`git show 1687f86:docs/site/04-design-system.md`).

## Where the design lives
| File | What it holds |
|---|---|
| `frontend/src/index.css` | Tailwind v4 `@theme static` tokens (light, the source of truth), the `:root[data-theme='dark']` overrides, status tokens, keyframes, Leaflet marker styles |
| `frontend/public/theme-init.js` | Picks light or dark before the first paint (external file because the CSP only allows same-site scripts) |
| `frontend/src/application/theme/themePreference.ts` | Light / Dark / Auto rules, storage key `washlink.theme`, browser bar colors |
| `frontend/src/presentation/theme/` | `ThemeProvider` / `useTheme` and `ThemeSwitch` |
| `frontend/src/infrastructure/storage/safeStorage.ts` | `localStorage` that never throws (theme and remembered views) |
| `packages/shared/src/bookingStatus.ts` | Status labels **and** status groups (`serviceBookingStatusGroup`) |
| `packages/shared/src/designTokens.ts` | Hex copies of the light brand colors for the Expo app; `sharedPackage.b2c.test.ts` checks brand-700 matches `index.css` |
| `frontend/src/features/b2c/landing/landing.css` | The landing page's own dark palette, the same in both themes |
| `frontend/src/presentation/design/ui/` | Primitives |
| `frontend/src/presentation/components/calendar/` | `MonthCalendar`, `ViewToggle` |

## Themes
- **Light** (the default for every visitor), **Dark**, and **Auto** (follow the device, live). The choice is
  stored per device under `washlink.theme`; the switch is in the account menu ("Appearance") and on the sign-in page.
- `theme-init.js` sets `data-theme` on `<html>` and the `theme-color` meta (`#0F766E` light, `#0A1315` dark) before
  paint; `ThemeProvider` keeps them in step afterwards. Toasts follow the theme.
- Dark redefines the **same variable names**, so components need no `dark:` classes: the ink scale is flipped (900 is
  still the strongest text), surfaces become dark slate-teal, brand tints darken and brand text lightens.
- **Fixed in both themes** (fills that carry white text): `--color-primary` `#0f766e`, `-primary-hover` `#115e59`,
  `-primary-strong` `#134e4a`, `-primary-soft` `#0d9488`, `--color-danger-solid`, `-danger-solid-hover`,
  `-success-solid`, `-warning-solid`, and the tints on them `--color-on-primary-soft` `#ccfbf1`,
  `--color-on-primary-accent` `#99f6e4`. Use these, never the brand scale, for button and hero backgrounds.
- **Cards** use `--color-card` and `--color-card-border` instead of white. Every card, section, input and divider is
  outlined with `--color-card-border` (light `#94a3b8`), never `--color-ink-200`, which is too faint on white. `bg-white` remains only as faint overlays
  (`/5`–`/30`) on teal hero panels.
- The public landing page stays dark in both themes.

## Tokens
| Group | Light | Dark |
|---|---|---|
| Brand | 50 `#f0fdfa` … **700 `#0f766e`** … 950 `#042f2e` | 50 `#0c2a28` … 700 `#5eead4` (text) … 950 `#f0fdfa` |
| Surface | `#ffffff` · muted `#f8fafc` · sunken `#f1f5f9` | `#121d20` · `#0f191c` · `#0a1315` |
| Card | `#ffffff`, border `#94a3b8` | `#121d20`, border `#2a3b41` |
| Ink | 900 `#0f172a` … 100 `#f1f5f9` | 900 `#e7eef0` … 100 `#1a282c` |
| Success / warning / danger | 50 · 500 · 600 | dark tints and lighter text |
| Info | 50 `#f0f9ff` · 200 `#bae6fd` · 600 `#0369a1` | `#0b2638` · `#1e4a66` · `#7dd3fc` |
| Radius | control 12px · surface 16px · pill 9999px | same |
| Shadow | card, card-hover, popover (slate, light) | deeper black shadows |

## Status colors
Every booking status belongs to one group (`serviceBookingStatusGroup`), and each group has one color everywhere:
a pill (`StatusPill`: dot + label) and a 4px left edge on cards (`statusEdgeStyle`). Color is never the only signal.

| Group | Statuses | Light line | Dark line |
|---|---|---|---|
| waiting | pending, searching_for_worker | amber `#d97706` | `#f59e0b` |
| action | no_worker_available | red `#dc2626` | `#f87171` |
| confirmed | accepted | blue `#2563eb` | `#60a5fa` |
| moving | worker_on_the_way, arrived | violet `#7c3aed` | `#a78bfa` |
| washing | in_progress | teal `#0d9488` | `#2dd4bf` |
| done | completed | green `#16a34a` | `#4ade80` |
| stopped | cancelled, expired | slate `#64748b` | `#8296a0` |

Tokens are `--status-<group>-bg`, `-fg`, `-line`. `statusColors.test.tsx` checks pill text ≥ 4.5:1, card edges ≥ 3:1
and a distinct line color per group, in both themes. Wash types (Basic / Full / Premium) are deliberately neutral.

## Primitives (`frontend/src/presentation/design/ui/`)
| Primitive | Variants / props | Notes |
|---|---|---|
| Button | `primary` · `secondary` · `ghost` · `danger`; `sm` `md` `lg`; `isLoading`, icons, `isFullWidth` | primary/danger use the fixed fills |
| Badge | `neutral` · `brand` · `success` · `warning` · `danger` · `info` | info uses the info tokens |
| **StatusPill** | `status`, optional `label` | Status dot + words in group colors |
| **Section** | `title`, `count`, `description`, `action` | Outlined group with a header bar; title is an `h2`, the section a labelled region |
| Card | `flat` · `raised` · `interactive`; accepts `style` (status edge) | `--color-card` |
| Input / Select | `label`, `helperText`, `errorText` | |
| Tabs | pill track | One row, scrolls sideways on phones, active tab kept in view, arrow / Home / End keys |
| Skeleton, BrandMark, AppShell, Avatar, BottomNav, Drawer, EmptyState, IconButton, Modal, PageHeader, StatCard, Toast | as before | all on tokens |

Components: `ThemeSwitch` (Light / Dark / Auto radio group), `MonthCalendar` (see [05 · Flows](05-flows.md) and the
[customer](screens/customer.md) and [washer](screens/washer.md) screens), `ViewToggle` + `useStoredBookingsView`
(List / Calendar, remembered per page under `washlink.view.customerBookings` / `washlink.view.washerWork`).

## Layout conventions
- Customer and washer pages: `max-w-3xl`, gutters `px-4 sm:px-6`; the admin dashboard is wider.
- Content is grouped in `Section`s (outlined, header bar with title and count) rather than loose headings.
- Booking and job cards carry their status pill top right and the status color on the left edge.
- The booking wizard shows the current step in one outlined panel under the progress bar.
