import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { AssignedBooking, B2cApi, DispatchRequest, WorkerAccount, WorkerSummary } from '@washlink/shared'
import { formatPesos, terminalServiceBookingStatuses, workerPausedNotice } from '@washlink/shared'
import { AuthenticatedTopBar } from '../../../presentation/components/AuthenticatedTopBar'
import { Button, Card, Section, Skeleton, StatusPill, Tabs, statusEdgeStyle } from '../../../presentation/design/ui'
import { getSupabaseClient } from '../../../infrastructure/supabase/supabaseClient'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { DeleteAccountSection } from '../DeleteAccountSection'
import { AssignedJobCard } from './AssignedJobCard'
import { RequestCard } from './RequestCard'
import { WorkerDocumentsPanel } from './WorkerDocumentsPanel'
import { WorkerSetupPanel } from './WorkerSetupPanel'

type WorkerTab = 'work' | 'history' | 'setup'
const tabItems = [
  { value: 'work' as const, label: 'Work' },
  { value: 'history' as const, label: 'History and earnings' },
  { value: 'setup' as const, label: 'Profile and hours' },
]

const statusText: Readonly<Record<WorkerAccount['verificationStatus'], string>> = {
  pending: 'WashLink reviews your account after you upload your verification photos in Profile and hours. You can go online once it is verified.',
  verified: 'Go online for as-soon-as-possible bookings. Scheduled requests inside your hours can still reach you.',
  rejected: 'WashLink did not verify your account.',
  suspended: 'Your account is suspended, so you cannot go online.',
}

interface IndependentWorkerPageProps {
  readonly workerId: string
}

export function IndependentWorkerPage({ workerId }: IndependentWorkerPageProps): ReactElement {
  const [tab, setTab] = useState<WorkerTab>('work')
  const [account, setAccount] = useState<WorkerAccount | null | undefined>(undefined)
  const [requests, setRequests] = useState<readonly DispatchRequest[]>([])
  const [jobs, setJobs] = useState<readonly AssignedBooking[]>([])
  const [summary, setSummary] = useState<WorkerSummary | null>(null)
  const [reviews, setReviews] = useState<Awaited<ReturnType<B2cApi['workerReviews']>>>([])
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
    <div className="min-h-[100dvh] bg-[var(--color-surface-muted)]">
      <AuthenticatedTopBar />
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-12 pt-2 sm:px-6">
        {account === undefined ? <Skeleton heightClassName="h-32" /> : null}
        {account === null ? (
          <>
            <h1 className="text-2xl font-bold text-[var(--color-ink-900)]">Set up your washer profile</h1>
            <WorkerDocumentsPanel verificationStatus={null} />
            <WorkerSetupPanel workerId={workerId} account={null} onSaved={refresh} />
          </>
        ) : null}
        {account ? (
          <>
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h1 className="text-lg font-semibold text-[var(--color-ink-900)]">{isOnline ? 'You are online' : 'You are offline'}</h1>
                <p className="text-sm text-[var(--color-ink-700)]">{isOnline ? 'New booking requests can reach you.' : statusText[account.verificationStatus]}</p>
                {account.verificationNote !== null ? <p className="mt-1 text-sm text-[var(--color-ink-900)]">WashLink&apos;s note: {account.verificationNote}</p> : null}
              </div>
              <Button variant={isOnline ? 'secondary' : 'primary'} isLoading={isToggling} disabled={!isOnline && account.verificationStatus !== 'verified'} onClick={(): void => void toggleOnline()}>
                {isOnline ? 'Go offline' : 'Go online'}
              </Button>
            </Card>
            {pausedNotice !== null ? <p role="status" className="rounded-[var(--radius-control)] bg-[var(--color-warning-50)] p-3 text-sm text-[var(--color-ink-900)]">{pausedNotice}</p> : null}
            <Tabs accessibleLabel="Your work" tabItems={tabItems} activeTabValue={tab} onTabChange={setTab} />
            {tab === 'work' ? (
              <div className="space-y-5">
                <Section title="Booking requests" count={requests.length} description="New bookings waiting for you to accept or decline.">
                  {requests.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No requests right now.</p> : null}
                  {requests.map((request) => <RequestCard key={request.id} request={request} onChanged={refresh} />)}
                </Section>
                <Section title="Your bookings" count={activeJobs.length} description="Accepted jobs, soonest first.">
                  {activeJobs.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No accepted bookings.</p> : null}
                  {activeJobs.map((job) => <AssignedJobCard key={job.id} job={job} isPaused={pausedNotice !== null} canCancel={account.isPlatformOperator} onChanged={refresh} />)}
                </Section>
              </div>
            ) : null}
            {tab === 'history' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Card className="p-4"><p className="text-xs text-[var(--color-ink-500)]">Earnings</p><p className="text-xl font-semibold tabular-nums">{formatPesos(summary?.earningsCents ?? 0)}</p></Card>
                  <Card className="p-4"><p className="text-xs text-[var(--color-ink-500)]">Completed</p><p className="text-xl font-semibold tabular-nums">{summary?.completedCount ?? 0}</p></Card>
                  <Card className="p-4"><p className="text-xs text-[var(--color-ink-500)]">Rating</p><p className="text-xl font-semibold tabular-nums">{summary?.averageRating ?? 'None yet'}</p></Card>
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
      </main>
    </div>
  )
}
