# 04 · Design system: tokens, primitives and where they break down

> Documented 2026-11-10 from `main` at `4012ce7`.

## Where the design lives
| File | What it holds |
|---|---|
| `frontend/src/index.css` | Tailwind v4 `@theme` tokens (the source of truth), keyframes, Leaflet marker styles |
| `frontend/src/presentation/design/tokens.ts` | TypeScript names for the CSS variables |
| `packages/shared/src/designTokens.ts` | Hex copies of brand colors, spacing and radius for the Expo app. `frontend/src/features/b2c/sharedPackage.b2c.test.ts` checks brand-700 matches `index.css` |
| `frontend/src/features/b2c/landing/landing.css` | The landing page's own dark palette (`--landing-*`), scoped to `.wl-landing` |
| `frontend/src/presentation/design/ui/` | The UI primitives |

Tailwind `^4.2.2` via `@tailwindcss/vite`, no `tailwind.config`. **No dark mode**: no `dark:` classes,
`prefers-color-scheme`, `data-theme` or `color-scheme` anywhere.

## Tokens (`@theme` in `index.css`)
| Group | Tokens and values |
|---|---|
| Font | `--font-sans`: Inter, Segoe UI, system-ui |
| Brand (teal) | 50 `#f0fdfa` · 100 `#ccfbf1` · 200 `#99f6e4` · 300 `#5eead4` · 400 `#2dd4bf` · 500 `#14b8a6` · 600 `#0d9488` · **700 `#0f766e`** · 800 `#115e59` · 900 `#134e4a` · 950 `#042f2e` |
| Surface | `surface` `#ffffff` · `surface-muted` `#f8fafc` · `surface-sunken` `#f1f5f9` (page background) |
| Ink (slate) | 900 `#0f172a` · 700 `#334155` · 500 `#64748b` · 400 `#94a3b8` · 300 `#cbd5e1` · 200 `#e2e8f0` · 100 `#f1f5f9` |
| Success | 50 `#ecfdf5` · 500 `#16a34a` · 600 `#15803d` |
| Warning | 50 `#fffbeb` · 500 `#d97706` · 600 `#b45309` |
| Danger | 50 `#fef2f2` · 500 `#dc2626` · 600 `#b91c1c` |
| Info | **none**; Badge `info` hardcodes Tailwind `sky-50` / `sky-700` |
| Radius | `control` 12px · `surface` 16px · `pill` 9999px |
| Shadow | `card`, `card-hover`, `popover` (slate-tinted, low opacity) |

Landing palette: `--landing-night` `#03100f`, `--landing-text` `#f4faf9`, `--landing-soft` `#c4d6d3`,
`--landing-muted` `#93aaa6`, `--landing-line` white 14%, `--landing-accent` `#5eead4`; its buttons hardcode
`#042f2e` and `#ccfbf1`.

## Primitives (`frontend/src/presentation/design/ui/`)
| Primitive | Variants / props | Notes |
|---|---|---|
| Button | `primary` · `secondary` · `ghost` · `danger`; sizes `sm` `md` `lg`; `isLoading`, `leadingIcon`, `trailingIcon`, `isFullWidth` | `secondary` hardcodes `bg-white` |
| Badge | tones `neutral` · `brand` · `success` · `warning` · `danger` · `info` | Pill, `text-xs font-medium`; `info` uses raw sky colors |
| Card | elevation `flat` (border) · `raised` (shadow, default) · `interactive` (hover shadow) | All `bg-white`; fixed `p-5` |
| Input / Select | `label`, `helperText`, `errorText`; Input adds `leadingIcon`, `trailingAccessory` | `bg-white`; required fields show a red `*` |
| Tabs | pill segmented control, `badgeContent` | Active tab is a white pill on a slate track |
| Skeleton | `rect` · `circle` · `text` | |
| BrandMark | `sm` · `md` · `lg`, `showWordmark` | See [02 · Branding](02-branding.md) |
| Others | AppShell, Avatar, BottomNav, Drawer, EmptyState, IconButton, Modal, PageHeader, StatCard, Toast | IconButton and StatCard hardcode `bg-white`; Toast sets its font inline |

Toasts come from `sonner`; maps from Leaflet with OpenStreetMap tiles.

## Hardcoded colors (what blocks a dark theme)
93 uses of `bg-white` and 49 of `text-white` across `frontend/src/**/*.tsx`, plus raw `sky-*` in Badge and white or
slate in the Leaflet styles. A theme switch needs these moved onto semantic tokens first, starting with Card, Input,
Select, Tabs, Button `secondary`, IconButton and StatCard.

## Status colors today (inconsistent)
`packages/shared/src/bookingStatus.ts` has labels but no colors, so each screen picks its own:

| Screen | File | Rule |
|---|---|---|
| Customer booking card | `features/b2c/customer/BookingCard.tsx:47` | completed → success, no washer → warning, **everything else → info** (including Cancelled) |
| Washer job card | `features/b2c/worker/AssignedJobCard.tsx:75` | **always info** |
| Washer history | `features/b2c/worker/IndependentWorkerPage.tsx:152` | completed → success, else neutral |
| Old B2B booking panel | `presentation/components/booking/BookingSuccessPanel.tsx:25` | full map, but for the older B2B statuses |
| Admin bookings filter | `features/b2c/admin/B2cOperationsPanel.tsx` | raw status keys with underscores replaced by spaces |

The result is visible in [customer bookings](screenshots/customer-bookings-phone.png): six of seven statuses use
the same pale blue label.

## Layout conventions
- Page width `max-w-3xl` (customer and washer pages); the admin dashboard uses its own wider layout. Gutters `px-4 sm:px-6`.
- Sections are a heading plus a stack of raised Cards (`space-y-3`); sections aren't outlined or tinted, so they
  run together.
- Tabs sit at the top of each signed-in page under `AuthenticatedTopBar` (brand, notifications bell with count,
  avatar initials).
- No calendar or date grid anywhere; times are lists.
