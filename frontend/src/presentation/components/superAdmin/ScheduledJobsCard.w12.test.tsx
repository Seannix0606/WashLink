import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScheduledJobService } from '../../../application/services/ScheduledJobService'
import type { WorkforceScheduledJob } from '../../../domain/models/WorkforceScheduledJob'
import type { ScheduledJobRepository } from '../../../domain/repositories/ScheduledJobRepository'
import { ScheduledJobsCard } from './ScheduledJobsCard'

function buildScheduledJob(overrides: Partial<WorkforceScheduledJob> = {}): WorkforceScheduledJob {
  return {
    jobKey: 'certification_expiry_notices',
    isEnabled: true,
    batchSize: 200,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastOutcome: null,
    lastProcessedCount: 0,
    lastChangedCount: 0,
    lastSkippedLockedCount: 0,
    lastSkippedFailedCount: 0,
    lastFailedSqlstates: [],
    lastPassCompletedAt: null,
    runCount: 0,
    pendingCount: 3,
    ...overrides,
  }
}

const neverRanJobs: WorkforceScheduledJob[] = [
  buildScheduledJob(),
  buildScheduledJob({ jobKey: 'worker_contract_expiry', batchSize: 25, pendingCount: 2 }),
  buildScheduledJob({ jobKey: 'owner_relationship_refresh', batchSize: 50, pendingCount: null }),
]

function createService(
  listScheduledJobs: ScheduledJobRepository['listScheduledJobs'],
  currentTimeMilliseconds?: () => number,
): ScheduledJobService {
  return new ScheduledJobService({ listScheduledJobs }, currentTimeMilliseconds)
}

/** Fixed "now" for the health checks: 2026-10-30T12:00:00Z. */
const fixedNowMilliseconds = Date.parse('2026-10-30T12:00:00+00:00')
const fixedClock = (): number => fixedNowMilliseconds
const recentStart = '2026-10-30T11:50:00+00:00'
const staleStart = '2026-10-30T09:59:00+00:00'

function ranJob(jobKey: string, lastStartedAt: string): WorkforceScheduledJob {
  return buildScheduledJob({
    jobKey,
    lastStartedAt,
    lastFinishedAt: lastStartedAt,
    lastOutcome: 'completed',
    runCount: 40,
    pendingCount: jobKey === 'owner_relationship_refresh' ? null : 0,
  })
}

async function renderJobItems(scheduledJobs: WorkforceScheduledJob[]): Promise<HTMLElement[]> {
  render(<ScheduledJobsCard scheduledJobService={createService(vi.fn().mockResolvedValue(scheduledJobs), fixedClock)} />)
  const jobList = await screen.findByRole('list', { name: 'Scheduled jobs' })
  return within(jobList).getAllByRole('listitem')
}

describe('Super_admin scheduled jobs card (W12)', () => {
  it('w12_admin_scheduled_jobs_card_states', async () => {
    const user = userEvent.setup()
    // Loading.
    const pendingLoad = render(<ScheduledJobsCard scheduledJobService={createService(() => new Promise(() => undefined))} />)
    expect(screen.getByLabelText('Loading the scheduled jobs')).toHaveAttribute('aria-busy', 'true')
    pendingLoad.unmount()

    // Empty: any role other than super_admin gets 0 rows from the database.
    const emptyLoad = render(<ScheduledJobsCard scheduledJobService={createService(vi.fn().mockResolvedValue([]))} />)
    expect(await screen.findByText('No scheduled job status to show')).toBeInTheDocument()
    emptyLoad.unmount()

    // Error, then a successful retry.
    const listScheduledJobs = vi
      .fn<ScheduledJobRepository['listScheduledJobs']>()
      .mockRejectedValueOnce(new Error('permission denied for function admin_workforce_scheduled_jobs'))
      .mockResolvedValue([
        buildScheduledJob({
          lastStartedAt: '2026-10-29T01:17:00+00:00',
          lastFinishedAt: '2026-10-29T01:17:01+00:00',
          lastOutcome: 'completed',
          lastProcessedCount: 4,
          lastChangedCount: 4,
          runCount: 12,
          pendingCount: 0,
        }),
        buildScheduledJob({ jobKey: 'worker_contract_expiry', isEnabled: false, batchSize: 25, lastStartedAt: '2026-10-29T01:20:00+00:00', lastOutcome: 'disabled', runCount: 3, pendingCount: 7 }),
        buildScheduledJob({
          jobKey: 'future_job',
          lastStartedAt: '2026-10-29T01:25:00+00:00',
          lastOutcome: 'something_new',
          lastSkippedFailedCount: 2,
          lastFailedSqlstates: ['23514', '40001'],
          runCount: 1,
          pendingCount: null,
        }),
      ])
    render(<ScheduledJobsCard scheduledJobService={createService(listScheduledJobs)} />)
    const errorNotice = await screen.findByRole('alert')
    expect(errorNotice).toHaveTextContent('The scheduled jobs could not be loaded')
    await user.click(within(errorNotice).getByRole('button', { name: 'Try again' }))

    const jobList = await screen.findByRole('list', { name: 'Scheduled jobs' })
    const jobItems = within(jobList).getAllByRole('listitem')
    expect(jobItems).toHaveLength(3)
    // Values exactly as returned: counts, outcomes, paused state and an unknown key / outcome shown as stored.
    expect(jobItems[0]).toHaveTextContent('Certificate expiry notices')
    expect(jobItems[0]).toHaveTextContent('Completed')
    expect(jobItems[0]).toHaveTextContent('processed 4, changed 4, skipped while busy 0, skipped after an error 0')
    expect(jobItems[0]).toHaveTextContent('Error codes in the last runNone')
    expect(jobItems[0]).toHaveTextContent('Runs recorded12')
    expect(jobItems[1]).toHaveTextContent('Status: Paused')
    expect(jobItems[1]).toHaveTextContent('Paused (job disabled)')
    expect(jobItems[1]).toHaveTextContent('Still due7')
    expect(jobItems[1]).toHaveTextContent('Expired contracts are shown from their end date even before this job records them.')
    expect(jobItems[2]).toHaveTextContent('future_job')
    expect(jobItems[2]).toHaveTextContent('something_new')
    // Fix cycle 1 N4 skip details, as stored.
    expect(jobItems[2]).toHaveTextContent('skipped after an error 2')
    expect(jobItems[2]).toHaveTextContent('Error codes in the last run23514, 40001')
    expect(jobItems[2]).toHaveTextContent('Not counted for this job')
    // Some jobs ran, so the "not running yet" notice is not shown.
    expect(screen.queryByText(/Scheduled jobs are not running yet/)).toBeNull()
    // Read only: no control to run, enable or resize a job.
    expect(within(jobList).queryAllByRole('button')).toEqual([])
  })

  it('w12_scheduled_jobs_card_says_registration_is_a_human_step', async () => {
    render(<ScheduledJobsCard scheduledJobService={createService(vi.fn().mockResolvedValue(neverRanJobs))} />)

    expect(await screen.findByText('Scheduled jobs are not running yet. A person must approve and register them.')).toBeInTheDocument()
    const jobItems = within(screen.getByRole('list', { name: 'Scheduled jobs' })).getAllByRole('listitem')
    expect(jobItems.map((jobItem) => within(jobItem).getByRole('heading').textContent)).toEqual([
      'Certificate expiry notices',
      'Worker contract expiry',
      'Owner relationship refresh',
    ])
    for (const jobItem of jobItems) {
      expect(jobItem).toHaveTextContent('Never ran')
    }
    expect(jobItems[2]).toHaveTextContent('Not counted for this job')
    const region = screen.getByRole('region', { name: 'Scheduled jobs' })
    expect(region).toHaveTextContent('registered, paused and resized by a person')
    // Every never-run job carries its own warning and the register-it copy.
    for (const jobItem of jobItems) {
      expect(jobItem).toHaveTextContent('Not run recently')
      expect(jobItem).toHaveTextContent('This job has never run. A person must approve and register it.')
    }
    // No claim that anyone was warned or messaged outside the app, and no legal-effect wording.
    expect(region.textContent).not.toMatch(/\b(email|sms|push)\b.*\bsent\b|\bwarned\b|legally|legal notice/i)
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('w12_scheduled_jobs_badge_says_enabled_in_washlink_not_running', async () => {
    const jobItems = await renderJobItems([
      ranJob('certification_expiry_notices', recentStart),
      buildScheduledJob({ jobKey: 'worker_contract_expiry', isEnabled: false, lastStartedAt: recentStart, lastOutcome: 'disabled', runCount: 5 }),
    ])
    expect(jobItems[0]).toHaveTextContent('Status: Enabled in WashLink')
    expect(jobItems[1]).toHaveTextContent('Status: Paused')
    const region = screen.getByRole('region', { name: 'Scheduled jobs' })
    expect(region).toHaveTextContent(
      'Registering it with the database cron scheduler is a separate step done by a person, and that registration is not visible here.',
    )
    // The bare word "Enabled" never stands alone as a status.
    expect(within(jobItems[0]).queryByText(/^Enabled$/)).toBeNull()
    expect(region.textContent).not.toMatch(/running now|is running|scheduled and running|jobs are running/i)
  })

  it('w12_scheduled_jobs_partial_registration_warns_per_job', async () => {
    // One job ran 10 minutes ago, two never ran: only those two warn, and the all-never-ran notice is not shown.
    const jobItems = await renderJobItems([
      ranJob('certification_expiry_notices', recentStart),
      buildScheduledJob({ jobKey: 'worker_contract_expiry', batchSize: 25 }),
      buildScheduledJob({ jobKey: 'owner_relationship_refresh', batchSize: 50, pendingCount: null }),
    ])
    expect(jobItems[0]).not.toHaveTextContent('Not run recently')
    expect(jobItems[1]).toHaveTextContent('Not run recently')
    expect(jobItems[1]).toHaveTextContent('This job has never run. A person must approve and register it.')
    expect(jobItems[2]).toHaveTextContent('Not run recently')
    expect(jobItems[2]).toHaveTextContent('This job has never run. A person must approve and register it.')
    expect(screen.queryByText(/Scheduled jobs are not running yet/)).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 scheduled jobs have not run in the last 2 hours.')
  })

  it('w12_scheduled_jobs_stale_when_all_ran_over_two_hours_ago', async () => {
    // All three ran before (run_count 40) and then stopped: each warns, and none says it never ran.
    const jobItems = await renderJobItems([
      ranJob('certification_expiry_notices', staleStart),
      ranJob('worker_contract_expiry', staleStart),
      ranJob('owner_relationship_refresh', staleStart),
    ])
    for (const jobItem of jobItems) {
      expect(jobItem).toHaveTextContent('Not run recently')
      expect(jobItem).toHaveTextContent('This job has not started in the last 2 hours. Its cron registration may be missing or stopped; a person must check it.')
      expect(jobItem).not.toHaveTextContent('Never ran')
      expect(jobItem).toHaveTextContent('Completed')
    }
    expect(screen.queryByText(/Scheduled jobs are not running yet/)).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 scheduled jobs have not run in the last 2 hours.')
  })

  it('w12_scheduled_jobs_all_healthy_show_no_warning', async () => {
    const jobItems = await renderJobItems([
      ranJob('certification_expiry_notices', recentStart),
      ranJob('worker_contract_expiry', recentStart),
      ranJob('owner_relationship_refresh', recentStart),
    ])
    for (const jobItem of jobItems) {
      expect(jobItem).not.toHaveTextContent('Not run recently')
      expect(jobItem).toHaveTextContent('Status: Enabled in WashLink')
    }
    expect(screen.queryByRole('status')).toBeNull()
    // The cron registration note stays, because a recent start does not prove the registration still exists.
    expect(screen.getByRole('region', { name: 'Scheduled jobs' })).toHaveTextContent('that registration is not visible here')
  })
})
