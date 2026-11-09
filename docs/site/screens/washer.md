# Screen · Washer (operator)

> Documented 2026-11-10 at `4012ce7`, local stack with test data. Screenshots:
> work [phone](../screenshots/washer-work-phone.png) · [desktop](../screenshots/washer-work-desktop.png);
> history and earnings [phone](../screenshots/washer-history-phone.png) · [desktop](../screenshots/washer-history-desktop.png);
> profile and hours [phone](../screenshots/washer-profile-phone.png) · [desktop](../screenshots/washer-profile-desktop.png)

**Who sees it:** `worker` accounts; today that means WashLink's operator account. **Files:**
`frontend/src/features/b2c/worker/IndependentWorkerPage.tsx`, `RequestCard.tsx`, `AssignedJobCard.tsx`,
`WorkerSetupPanel.tsx`, `WorkerDocumentsPanel.tsx`; statuses and steps in `packages/shared/src/bookingStatus.ts`.

| Work | History and earnings | Profile and hours |
|---|---|---|
| ![](../screenshots/washer-work-phone.png) | ![](../screenshots/washer-history-phone.png) | ![](../screenshots/washer-profile-phone.png) |

## Frame
Same top bar as customers. Above the tabs, an **online card**: "You are online / New booking requests can reach
you." with **Go offline**, or "You are offline" and the reason, with **Go online**. A paused account shows an
amber notice. Tabs: Work, History and earnings, Profile and hours (they wrap on phones).

## Work
**Booking requests**: offer cards with service, "You earn ₱450" in teal, "Sedan · Mon, Nov 16, 9:00 AM · about 75
min · Within 2 km", "Reference WL-C622A9A9 · expires in 40:40" (a live countdown), **Accept** and **Decline**. No
address is shown until accepted. Empty: "No requests right now."

**Your bookings**: one card per accepted job: service, **status pill (always the same pale blue)**, time and
duration, vehicle, **address in bold**, landmark, instructions, customer name, "Collect ₱250 in cash. You earn
₱250." The single next step is the primary button (**Start travelling**, **Mark arrived**, **Start wash**,
**Complete wash**), with **Navigate** (opens maps) and **Call customer** when a phone exists. If it's too early,
the button is pale and a line explains ("This booking can't start yet. You can begin up to 2 hours before its
scheduled time."). Below: **Report a problem** and **Cancel booking** (operator; other washers see "I can't do
this booking"), which open a reason field (10–500 characters).

## History and earnings
Three stat cards (Earnings ₱450, Completed 1, Rating 5), past jobs as rows ("Full Wash · WL-EFC0429E ₱450
**Completed**", "Cancelled" in grey), then **Reviews** ("5 out of 5: Spotless, and right on time.").

## Profile and hours
1. **WashLink operator account** card: "This account is run by WashLink, so it needs no verification documents.
   You can accept, run and cancel bookings." (Other washers see the verification photos panel here.)
2. **About you:** Short bio, Skills and experience ("Separate with commas.").
3. **Service area:** "Pin where you usually start from. Customers never see this." map, "How far will you travel
   (km)?"
4. **Services you offer:** a checkbox per active service.
5. **Working hours:** each weekday from **Sunday** to Saturday with a checkbox and From/To selects.
6. **Save profile**, then the **Delete account** card.

## Notes for the redesign
- Every job's status pill is the same color, so "confirmed", "on the way" and "washing" look identical; the only
  difference is the button label.
- The disabled next-step button and its explanation look like an error.
- Known copy bug: an in-progress job scheduled later shows the arrival-window line ("It's too early for this step.
  You can mark arrival …") above **Complete wash** (`workerEarlyStepNotice`).
- On phones the Working hours rows break awkwardly: "From" sits right of the day and "To" drops to the next line.
- There is no day or month view of upcoming jobs; the owner wants a month calendar here.
