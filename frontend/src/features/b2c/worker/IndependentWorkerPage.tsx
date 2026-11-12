import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BriefcaseBusiness, CheckCircle2, History, MessageCircle, SlidersHorizontal, Star, Wallet } from 'lucide-react'
import type { AssignedBooking, B2cApi, DispatchRequest, WorkerAccount, WorkerSummary } from '@washlink/shared'
import { formatManilaTime, formatPesos, manilaDayKey, terminalServiceBookingStatuses, workerPausedNotice } from '@washlink/shared'
import { AuthenticatedTopBar } from '../../../presentation/components/AuthenticatedTopBar'
import { MonthCalendar } from '../../../presentation/components/calendar/MonthCalendar'
import { ViewToggle, useStoredBookingsView } from '../../../presentation/components/calendar/ViewToggle'
import { AppShell, Button, Card, Section, Skeleton, StatCard, StatusPill, Tabs, statusEdgeStyle } from '../../../presentation/design/ui'
import { joinClassNames } from '../../../presentation/design/classNames'
import { greeting } from '../greeting'
import { getSupabaseClient } from '../../../infrastructure/supabase/supabaseClient'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { DeleteAccountSection } from '../DeleteAccountSection'
import { useCurrentTime } from '../useCurrentTime'
import { AssignedJobCard } from './AssignedJobCard'
import { RequestCard } from './RequestCard'
import { WorkerDocumentsPanel } from './WorkerDocumentsPanel'
import { WorkerSetupPanel } from './WorkerSetupPanel'
import { WorkerGlance } from './WorkerGlance'
import { MessagesPanel } from '../messages/MessagesPanel'
import { useBookingChats } from '../messages/useBookingChats'

type WorkerTab = 'work' | 'history' | 'setup' | 'messages'
const tabItems = [
  { value: 'work' as const, label: 'Work', icon: <BriefcaseBusiness className="h-4 w-4" /> },
  { value: 'messages' as const, label: 'Messages', icon: <MessageCircle className="h-4 w-4" /> },
  { value: 'history' as const, label: 'History and earnings', icon: <History className="h-4 w-4" /> },
  { value: 'setup' as const, label: 'Profile and hours', icon: <SlidersHorizontal className="h-4 w-4" /> },
]

const statusText: Readonly<Record<WorkerAccount['verificationStatus'], string>> = {
  pending: 'WashLink reviews your account after you upload your verification photos in Profile and hours. You can go online once it is verified.',
  verified: 'Go online for as-soon-as-possible bookings. Scheduled requests inside your hours can still reach you.',
  rejected: 'WashLink did not verify your account.',
  suspended: 'Your account is suspended, so you cannot go online.',
}

interface IndependentWorkerPageProps {
  readonly workerId: string
  /** The washer's full name, for the greeting on the page band. */
  readonly workerName?: string
}

export function IndependentWorkerPage({ workerId, workerName }: IndependentWorkerPageProps): ReactElement {
  const [tab, setTab] = useState<WorkerTab>('work')
  const chats = useBookingChats(workerId)
  const [chatBookingId, setChatBookingId] = useState<string | null>(null)
  const openChat = (bookingId: string): void => {
    setChatBookingId(bookingId)
    setTab('messages')
  }
  const [account, setAccount] = useState<WorkerAccount | null | undefined>(undefined)
  const [requests, setRequests] = useState<readonly DispatchRequest[]>([])
  const [jobs, setJobs] = useState<readonly AssignedBooking[]>([])
  const [summary, setSummary] = useState<WorkerSummary | null>(null)
  const [reviews, setReviews] = useState<Awaited<ReturnType<B2cApi['workerReviews']>>>([])
  const [view, setView] = useStoredBookingsView('washlink.view.washerWork')
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const todayKey = manilaDayKey(useCurrentTime(60000).toISOString())
  const [isToggling, setIsToggling] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const api = getB2cApi()
      const nextAccount = await api.workerAccount(workerId)
      setAccount(nextAccount)
      if (nextAccount !== null) {
        const [nextRequests, nextJobs, nextSummary, nextReviews] = await Promise.all([api.dispatchRequests(), api.assignedBookings(), api.workerSummary(), api.workerReviews()])
        setReviews(nextReviews)
        setRequests(nextRequests)
        setJobs(nextJobs)
        setSummary(nextSummary)
      }
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [workerId])

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0)
    const poll = window.setInterval(() => void refresh(), 20000)
    const client = getSupabaseClient()
    const channel = client.channel(`worker-requests-${workerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_requests', filter: `worker_id=eq.${workerId}` }, () => void refresh())
      .subscribe()
    return (): void => {
      window.clearTimeout(initial)
      window.clearInterval(poll)
      void client.removeChannel(channel)
    }
  }, [workerId, refresh])

  // A stale session stops being matched: the server ignores an online worker with no recent heartbeat.
  const isOnline = account?.isOnline === true
  useEffect(() => {
    if (!isOnline) {
      return
    }
    const beat = window.setInterval(() => { getB2cApi().heartbeat().catch(() => undefined) }, 60000)
    return (): void => { window.clearInterval(beat) }
  }, [isOnline])

  const toggleOnline = async (): Promise<void> => {
    setIsToggling(true)
    try {
      await getB2cApi().setOnline(!isOnline)
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setIsToggling(false)
    }
  }

  // Soonest first, so the next job is on top (the server sends newest first).
  const activeJobs = jobs.filter((job) => !terminalServiceBookingStatuses.includes(job.status))
    .sort((first, second) => Date.parse(first.scheduledAt) - Date.parse(second.scheduledAt))
  const pastJobs = jobs.filter((job) => terminalServiceBookingStatuses.includes(job.status))
  const pausedNotice = account ? workerPausedNotice(account.verificationStatus, activeJobs.length) : null

  return (
    <AppShell topBar={<AuthenticatedTopBar />} mainClassName="space-y-5"
      title={greeting(workerName)}
      subtitle={account ? 'Your requests, bookings, earnings and hours.' : 'Set up your profile to start receiving bookings.'}
      headerAside={account ? (
        <span className={joinClassNames('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
          isOnline ? 'border-[color-mix(in_srgb,var(--color-success-500)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-success-500)_22%,transparent)] text-[var(--color-on-harbor)]' : 'border-white/15 bg-white/10 text-[var(--color-on-harbor-muted)]')}>
          <span aria-hidden="true" className={joinClassNames('h-2 w-2 rounded-full', isOnline ? 'bg-[var(--color-success-500)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-success-500)_30%,transparent)]' : 'bg-[var(--color-ink-400)]')} />
          {isOnline ? 'Online' : 'Offline'}
        </span>
      ) : undefined}
      navigation={account ? <Tabs variant="navigation" accessibleLabel="Your work" activeTabValue={tab} onTabChange={setTab}
        tabItems={tabItems.map((item) => (item.value === 'messages' && chats.unreadTotal > 0 ? { ...item, badgeContent: chats.unreadTotal } : item))} /> : undefined}
      summary={account && tab !== 'messages' ? <WorkerGlance todayKey={todayKey} activeJobs={activeJobs} requestCount={requests.length} totals={summary} /> : undefined}>
        {account === undefined ? <Skeleton heightClassName="h-32" /> : null}
        {account === null ? (
          <>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink-900)]">Set up your washer profile</h2>
            <WorkerDocumentsPanel verificationStatus={null} />
            <WorkerSetupPanel workerId={workerId} account={null} onSaved={refresh} />
          </>
        ) : null}
        {account ? (
          <>
            <Card className={joinClassNames('flex flex-wrap items-center justify-between gap-3 border-l-4 p-4',
              isOnline ? 'border-l-[var(--color-success-500)]' : 'border-l-[var(--color-ink-400)]')}>
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-ink-900)]">{isOnline ? 'You are online' : 'You are offline'}</h2>
                <p className="text-sm text-[var(--color-ink-700)]">{isOnline ? 'New booking requests can reach you.' : statusText[account.verificationStatus]}</p>
                {account.verificationNote !== null ? <p className="mt-1 text-sm text-[var(--color-ink-900)]">WashLink&apos;s note: {account.verificationNote}</p> : null}
              </div>
              <Button variant={isOnline ? 'secondary' : 'primary'} isLoading={isToggling} disabled={!isOnline && account.verificationStatus !== 'verified'} onClick={(): void => void toggleOnline()}>
                {isOnline ? 'Go offline' : 'Go online'}
              </Button>
            </Card>
            {pausedNotice !== null ? <p role="status" className="rounded-[var(--radius-control)] bg-[var(--color-warning-50)] p-3 text-sm text-[var(--color-ink-900)]">{pausedNotice}</p> : null}
            {tab === 'work' ? (
              <div className="space-y-5">
                <div className="flex justify-end"><ViewToggle view={view} onChange={setView} /></div>
                {view === 'calendar' ? (
                  <MonthCalendar label="Your work by day" todayKey={todayKey} selectedDayKey={selectedDayKey ?? todayKey} onSelectDay={setSelectedDayKey} hasRequests
                    entries={[
                      ...requests.map((request) => ({
                        id: `request-${request.id}`, dayKey: manilaDayKey(request.scheduledAt), status: 'searching_for_worker' as const, isRequest: true,
                        title: request.serviceName, timeLabel: request.isImmediate ? 'ASAP' : formatManilaTime(request.scheduledAt),
                      })),
                      ...jobs.map((job) => ({
                        id: job.id, dayKey: manilaDayKey(job.scheduledAt), status: job.status, title: job.serviceName, timeLabel: formatManilaTime(job.scheduledAt),
                      })),
                    ]}>
                    <WorkerDay dayKey={selectedDayKey ?? todayKey} requests={requests} activeJobs={activeJobs} pastJobs={pastJobs}
                      isPaused={pausedNotice !== null} canCancel={account.isPlatformOperator} onChanged={refresh} />
                  </MonthCalendar>
                ) : null}
                {view === 'list' ? (<>
                <Section title="Booking requests" count={requests.length} description="New bookings waiting for you to accept or decline.">
                  {requests.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No requests right now.</p> : null}
                  {requests.length > 0 ? (
                    <div className="grid items-start gap-3 xl:grid-cols-2">
                      {requests.map((request) => <RequestCard key={request.id} request={request} onChanged={refresh} />)}
                    </div>
                  ) : null}
                </Section>
                <Section title="Your bookings" count={activeJobs.length} description="Accepted jobs, soonest first.">
                  {activeJobs.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No accepted bookings.</p> : null}
                  {activeJobs.length > 0 ? (
                    <div className="grid items-start gap-3 xl:grid-cols-2">
                      {activeJobs.map((job) => <AssignedJobCard key={job.id} job={job} isPaused={pausedNotice !== null} canCancel={account.isPlatformOperator} onChanged={refresh} onMessage={openChat} />)}
                    </div>
                  ) : null}
                </Section>
                </>) : null}
              </div>
            ) : null}
            {tab === 'messages' ? (
              <MessagesPanel chats={chats} profileId={workerId} selectedBookingId={chatBookingId} onSelect={setChatBookingId}
                onViewBooking={(): void => { setTab('work') }} />
            ) : null}
            {tab === 'history' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatCard icon={<Wallet className="h-5 w-5" aria-hidden="true" />} accentTone="brand" label="Earnings" value={formatPesos(summary?.earningsCents ?? 0)} />
                  <StatCard icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />} accentTone="success" label="Completed" value={summary?.completedCount ?? 0} />
                  <StatCard icon={<Star className="h-5 w-5" aria-hidden="true" />} accentTone="warning" label="Rating" value={summary?.averageRating ?? 'None yet'} />
                </div>
                <Section title="Past bookings" count={pastJobs.length}>
                  <ul className="space-y-2">
                    {pastJobs.map((job) => (
                      <li key={job.id}>
                        <Card className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" style={statusEdgeStyle(job.status)}>
                          <span>{job.serviceName} · {job.reference}</span>
                          <span className="flex items-center gap-2 tabular-nums">{formatPesos(job.workerEarningsCents)}<StatusPill status={job.status} /></span>
                        </Card>
                      </li>
                    ))}
                    {pastJobs.length === 0 ? <li className="text-sm text-[var(--color-ink-700)]">No past bookings yet.</li> : null}
                  </ul>
                </Section>
                <Section title="Reviews" count={reviews.length}>
                  {reviews.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No reviews yet.</p> : null}
                  {reviews.map((review) => (
                    <Card key={review.createdAt} className="p-3 text-sm text-[var(--color-ink-900)]">
                      <span className="font-medium tabular-nums">{review.rating} out of 5</span>{review.comment !== '' ? `: ${review.comment}` : ''}
                    </Card>
                  ))}
                </Section>
              </div>
            ) : null}
            {tab === 'setup' ? (
              <div className="space-y-5">
                {account.isPlatformOperator ? (
                  <Card className="p-4 text-sm text-[var(--color-ink-700)]">
                    <h2 className="font-semibold text-[var(--color-ink-900)]">WashLink operator account</h2>
                    <p className="mt-1">This account is run by WashLink, so it needs no verification documents. You can accept, run and cancel bookings.</p>
                  </Card>
                ) : (
                  <WorkerDocumentsPanel verificationStatus={account.verificationStatus} />
                )}
                <WorkerSetupPanel workerId={workerId} account={account} onSaved={refresh} />
                <DeleteAccountSection />
              </div>
            ) : null}
          </>
        ) : null}
    </AppShell>
  )
}

interface WorkerDayProps {
  readonly dayKey: string
  readonly requests: readonly DispatchRequest[]
  readonly activeJobs: readonly AssignedBooking[]
  readonly pastJobs: readonly AssignedBooking[]
  readonly isPaused: boolean
  readonly canCancel: boolean
  readonly onChanged: () => Promise<void>
}

/** One day's work under the calendar: open requests and jobs with their usual actions, finished jobs as short rows. */
function WorkerDay({ dayKey, requests, activeJobs, pastJobs, isPaused, canCancel, onChanged }: WorkerDayProps): ReactElement {
  const onDay = <T extends { readonly scheduledAt: string }>(items: readonly T[]): T[] => items.filter((item) => manilaDayKey(item.scheduledAt) === dayKey)
  const dayRequests = onDay(requests)
  const dayJobs = onDay(activeJobs)
  const dayPast = onDay(pastJobs)
  if (dayRequests.length + dayJobs.length + dayPast.length === 0) {
    return <p className="text-sm text-[var(--color-ink-700)]">Nothing on this day.</p>
  }
  return (
    <div className="space-y-3">
      {dayRequests.map((request) => <RequestCard key={request.id} request={request} onChanged={onChanged} />)}
      {dayJobs.map((job) => <AssignedJobCard key={job.id} job={job} isPaused={isPaused} canCancel={canCancel} onChanged={onChanged} />)}
      {dayPast.map((job) => (
        <Card key={job.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" style={statusEdgeStyle(job.status)}>
          <span>{formatManilaTime(job.scheduledAt)} · {job.serviceName} · {job.reference}</span>
          <span className="flex items-center gap-2 tabular-nums">{formatPesos(job.workerEarningsCents)}<StatusPill status={job.status} /></span>
        </Card>
      ))}
    </div>
  )
}
