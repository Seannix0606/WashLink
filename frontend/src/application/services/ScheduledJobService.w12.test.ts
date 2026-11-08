import { describe, expect, it, vi } from 'vitest'
import type { WorkforceScheduledJob } from '../../domain/models/WorkforceScheduledJob'
import {
  ScheduledJobService,
  isScheduledJobNotRunRecently,
  scheduledJobNotRunRecentlyThresholdMilliseconds,
} from './ScheduledJobService'

const nowMilliseconds = Date.parse('2026-10-30T12:00:00+00:00')

function job(overrides: Partial<WorkforceScheduledJob>): WorkforceScheduledJob {
  return {
    jobKey: 'worker_contract_expiry',
    isEnabled: true,
    batchSize: 25,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastOutcome: null,
    lastProcessedCount: null,
    lastChangedCount: null,
    lastSkippedLockedCount: null,
    lastSkippedFailedCount: null,
    lastFailedSqlstates: null,
    lastPassCompletedAt: null,
    runCount: 0,
    pendingCount: 0,
    ...overrides,
  }
}

describe('Scheduled job health (W12 C1)', () => {
  it('w12_not_run_recently_threshold_is_two_hours', () => {
    expect(scheduledJobNotRunRecentlyThresholdMilliseconds).toBe(2 * 60 * 60 * 1000)
    const atThreshold = new Date(nowMilliseconds - scheduledJobNotRunRecentlyThresholdMilliseconds).toISOString()
    const pastThreshold = new Date(nowMilliseconds - scheduledJobNotRunRecentlyThresholdMilliseconds - 1).toISOString()
    expect(isScheduledJobNotRunRecently(job({ runCount: 3, lastStartedAt: atThreshold }), nowMilliseconds)).toBe(false)
    expect(isScheduledJobNotRunRecently(job({ runCount: 3, lastStartedAt: pastThreshold }), nowMilliseconds)).toBe(true)
  })

  it('w12_not_run_recently_when_run_count_zero_or_start_missing_or_unreadable', () => {
    const recentStart = '2026-10-30T11:59:00+00:00'
    expect(isScheduledJobNotRunRecently(job({ runCount: 0, lastStartedAt: recentStart }), nowMilliseconds)).toBe(true)
    expect(isScheduledJobNotRunRecently(job({ runCount: 4, lastStartedAt: null }), nowMilliseconds)).toBe(true)
    expect(isScheduledJobNotRunRecently(job({ runCount: 4, lastStartedAt: 'not a time' }), nowMilliseconds)).toBe(true)
    expect(isScheduledJobNotRunRecently(job({ runCount: 4, lastStartedAt: recentStart }), nowMilliseconds)).toBe(false)
  })

  it('w12_statuses_are_judged_against_the_load_time', async () => {
    const service = new ScheduledJobService(
      { listScheduledJobs: vi.fn().mockResolvedValue([job({ runCount: 1, lastStartedAt: '2026-10-30T11:00:00+00:00' }), job({})]) },
      () => nowMilliseconds,
    )
    const statuses = await service.loadScheduledJobStatuses()
    expect(statuses.map(({ hasNeverRun, isNotRunRecently }) => ({ hasNeverRun, isNotRunRecently }))).toEqual([
      { hasNeverRun: false, isNotRunRecently: false },
      { hasNeverRun: true, isNotRunRecently: true },
    ])
  })
})
