# 06 · UX audit: where categories blur, and what the redesign must fix

> Written 2026-11-10 at `4012ce7` (before the redesign); the resolution table at the end was added from
> `feature/ui-redesign` after stages 1–4. Checked against the ui-ux-pro-max
> priorities: accessibility, touch, layout, color, hierarchy. This is the input for Phase B; it changes no code.

## The owner's complaint
"I can't differentiate where the categories are." The reference they liked (a shift calendar) separates categories
with **colored pills that carry a label and a time**, **outlined day and section boxes**, and a **month view**. The
owner chose (2026-11-10): color for **booking statuses only** (wash types stay neutral), a **month calendar for
the washer and the customer**, **light and dark themes** (follow the device, with a Light / Dark / Auto switch),
and **bordered, grouped cards**. The website and installed app only.

## Findings by area

### Washer Work screen ([washer](screens/washer.md))
| # | Finding | Evidence |
|---|---|---|
| W1 | Every job's status pill is the same pale blue; confirmed, on the way and washing look identical | `AssignedJobCard.tsx:75` always `info` |
| W2 | Requests and jobs are both white cards; the only difference is the section heading | washer-work screenshot |
| W3 | The disabled next-step button plus explanation reads like an error, not a schedule | "This booking can't start yet…" |
| W4 | In-progress jobs scheduled later show the arrival-window line above **Complete wash** | `workerEarlyStepNotice` |
| W5 | No day or month view; upcoming work is one long list | owner wants a month calendar |
| W6 | Working hours rows break on phones (From/To misaligned); week starts Sunday | washer-profile phone |

### Customer bookings ([customer](screens/customer.md))
| # | Finding | Evidence |
|---|---|---|
| C1 | Six of seven statuses use the same pale blue pill, **including Cancelled** | `BookingCard.tsx:47` |
| C2 | No grouping into upcoming, in progress and past; Bookings is one list | customer-bookings |
| C3 | No calendar | owner wants a month calendar |
| C4 | The four tabs wrap onto two rows on a 390 px phone | all customer phone shots |
| C5 | The add-vehicle form runs straight on from the list | customer-saved-details |

### Admin panel ([admin](screens/admin.md))
| # | Finding | Evidence |
|---|---|---|
| A1 | Booking statuses are lowercase plain text (from raw keys), with no pill or color | admin-bookings-and-washers |
| A2 | Prices, add-ons, washers and bookings are all identical white cards on one long page, with no section boxes | same |
| A3 | Hidden services sit between active ones in sort order | same |
| A4 | **Open case** shows the history at the bottom of the page, away from the row | admin-booking-case |
| A5 | The audit log's copy and examples are for the B2B workforce product | admin-audit-log |

### Landing and booking flow ([landing](screens/landing.md), [booking wizard](screens/booking-wizard.md))
| # | Finding | Evidence |
|---|---|---|
| L1 | Basic, Full and Premium are identical cards; the tiering is only in the text | wizard-3-service, landing |
| L2 | The landing hero says "Book an independent washer…" though WashLink now does the washes | landing |
| L3 | Wizard steps share one plain style; only the progress bar orients | wizard screenshots |
| L4 | Light app, dark landing, no theme choice | 04-design-system |

### Cross-cutting
| # | Finding |
|---|---|
| X1 | No dark theme; 93 hardcoded `bg-white`, Badge `info` uses raw sky colors (no info token) |
| X2 | No single status-to-color map; four screens each decide their own |
| X3 | Color must never be the only signal: every status pill keeps its text label (WCAG 1.4.1) |
| X4 | Both themes need AA contrast (4.5:1 text, 3:1 pill borders and icons) |
| X5 | Touch targets: tabs and small text buttons (Edit, Hide/Show) should stay ≥ 44 px tall on phones |
| X6 | SEO gaps: no description, sharing tags, robots or sitemap, and the Vite favicon ([03](03-seo-and-meta.md)) |

## Proposed status groups (for Phase B; colors to be chosen with the owner)
| Group | Statuses | Meaning |
|---|---|---|
| Waiting | `pending`, `searching_for_worker` | Not yet assigned |
| Needs action | `no_worker_available` | Customer must search again or cancel |
| Confirmed | `accepted` | A washer is assigned |
| On the way | `worker_on_the_way`, `arrived` | Washer travelling or at the car |
| Washing | `in_progress` | Job underway |
| Done | `completed` | Finished |
| Stopped | `cancelled`, `expired` | Won't happen |

Each group gets one hue with a light and a dark variant, a pill with the existing label text, and the same
color on calendar entries.

## Resolved by the redesign (`feature/ui-redesign`, stages 1–4)
| Finding | Resolution |
|---|---|
| W1, C1, A1, X2 | One shared status map with seven colors; `StatusPill` and a colored card edge on every screen; admin rows use pills |
| W2, A2, C5 | Outlined `Section`s with header bars and counts on washer Work and History, customer Bookings and saved details, admin, and the wizard step panel |
| W3 | Unchanged by design: the step stays disabled before its window, with a per-step explanation |
| W4 | `workerEarlyStepNotice` is worded per step (start travelling, mark arrival, start the wash, complete the wash) |
| W5, C3 | Month calendar with a List / Calendar switch on washer Work and customer Bookings |
| W6 | Working hours list Monday first, with From and To side by side on phones |
| C2 | Customer Bookings grouped into Needs action, In progress, Upcoming and Past |
| C4 | Tabs stay on one row and scroll sideways |
| A3 | Hidden services and add-ons collected in a collapsed **Hidden (n)** group |
| A4 | Booking history opens directly under its row; the status filter uses friendly names |
| L2 | Landing hero says "WashLink comes to your home, office, condo or parking spot…" |
| L3 | The wizard's current step sits in one outlined panel |
| L4, X1 | Light and dark themes with a Light / Dark / Auto switch; no hardcoded white cards left |
| X3, X4 | Pills always carry the status words; a test checks AA contrast in both themes |
| X6 | Description, sharing tags and image, canonical, robots.txt, sitemap and a WashLink favicon |

Still open: A5 (audit log copy is workforce-specific), L1 (wash tiers look alike — wash types stay neutral by the
owner's choice), X5 (small text buttons such as Edit and Hide/Show still need a touch-size check), and the Render response headers in
[03](03-seo-and-meta.md).
