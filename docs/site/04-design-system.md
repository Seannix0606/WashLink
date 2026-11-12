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

## Visual identity: Harbor (redesign, 2026-11-12)
Chosen by the owner: the **Harbor** layout, a **sunlit amber** accent, **Archivo** headings and a **desktop sidebar**.

- **Harbor band:** every signed-in page (`AppShell`) starts with a deep navy-teal band (`.wl-harbor`:
  `--color-harbor-900/800` with soft teal and amber light pools) holding the top bar and the page title (`h1`, Archivo,
  white) with a subtitle in `--color-on-harbor-muted`. The customer and washer titles greet by Manila time
  ("Good morning, Bea", `features/b2c/greeting.ts`). The washer sees an Online/Offline chip on the band.
- **Navigation:** `AppShell`'s `navigation` slot takes `<Tabs variant="navigation">` with an icon per tab. Phones and
  tablets: a floating white bar overlapping the band's bottom edge, scrolling sideways. Desktop (1024px+): an app
  layout, with a full-height dark rail (`--color-harbor-950`) against the left edge holding the brand and the tabs (the
  selected tab in brand teal), and the band plus content filling the rest, up to 90rem wide.
- **Wide screens (1280px+):** booking and job cards sit two per row, and `AppShell`'s `summary` slot shows a glance
  panel on the right (customer: next wash, upcoming, completed, spent; washer: today's jobs, requests waiting,
  earnings, completed, rating). The admin page puts its overview (open/closed, money, counts, "Needs attention") in a
  right column beside services, washers and bookings. Below 1280px these panels are not rendered at all
  (`useMediaQuery`), so nothing is duplicated for screen readers or tests. It is one tab list (rendered once), so behavior and tests are unchanged; Up/Down keys work
  as well as Left/Right. The selected item uses `--color-selected` (navy in light, brand teal in dark).
- **Page:** cool mist neutrals (`--color-surface-sunken #e6eef0`, `--color-surface-muted #f3f7f8`); cards stay white with
  the strong outline the owner asked for (`--color-card-border #94a3b8`) and a soft layered shadow tinted with the
  harbor navy (`--shadow-card`, `--shadow-card-hover`).
- **Sections:** a teal-tinted header strip (`--color-section-head`) with a short teal marker, an Archivo title and a
  count chip in `--color-selected`.
- **Accent (amber):** `--color-accent #f5b83d` with `--color-on-accent`, `--color-accent-soft`, `--color-accent-ink`.
  Highlights only: the `accent` Button variant for the one main action ("Book a car wash"), the admin money figures,
  the wordmark's "Link" on the band, the active sidebar icon. Never for booking status.
- **Buttons:** primary is a gently lit teal gradient with `--shadow-button`; `accent` is amber with dark text; all
  buttons respond to presses (`active:scale-[0.98]`, off under reduced motion). Secondary/ghost hover with a teal tint.
- **Admin summary:** a bento grid: the two money tiles lead on the harbor color with amber figures, then six count
  tiles with an icon chip each.
- **Empty and loading:** empty states get a soft tinted panel and an icon in an amber ring (`Inbox` by default);
  skeletons use a moving sheen (`.wl-skeleton`, still under reduced motion).
- **Type:** `--font-display` (Archivo, normal width 600/700) for page, section and card titles and key figures; Inter
  for everything else. `index.html` loads Archivo `wdth,wght@100,600;100,700;125,800`.
- **Motion:** `--duration-quick 160ms`, `--duration-base 220ms`, `--ease-out-soft`.

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
