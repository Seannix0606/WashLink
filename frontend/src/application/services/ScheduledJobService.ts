import type { WorkforceScheduledJob } from '../../domain/models/WorkforceScheduledJob'
import type { ScheduledJobRepository } from '../../domain/repositories/ScheduledJobRepository'

/**
 * A job whose last start is older than this (or that never started) is shown as "Not run recently".
 * The jobs are meant to run every few minutes once a person registers them, so two hours without a
 * start means they are not registered, were unregistered, or have stopped (C1).
 */
export const scheduledJobNotRunRecentlyThresholdMilliseconds = 2 * 60 * 60 * 1000

/** "Never ran": no recorded run and no start time (w12e semantics). */
export function hasScheduledJobNeverRun(scheduledJob: WorkforceScheduledJob): boolean {
  return scheduledJob.runCount === 0 && scheduledJob.lastStartedAt === null
}

/**
 * True when the job has no recorded run, no start time, a start time that cannot be read, or a last
 * start older than {@link scheduledJobNotRunRecentlyThresholdMilliseconds}. A recorded start alone
 * never proves the job is still scheduled; this only flags what the stored status shows.
 */
export function isScheduledJobNotRunRecently(scheduledJob: WorkforceScheduledJob, nowMilliseconds: number): boolean {
  if (scheduledJob.runCount === 0 || scheduledJob.lastStartedAt === null) {
    return true
  }
  const lastStartedMilliseconds = Date.parse(scheduledJob.lastStartedAt)
  if (Number.isNaN(lastStartedMilliseconds)) {
    return true
  }
  return nowMilliseconds - lastStartedMilliseconds > scheduledJobNotRunRecentlyThresholdMilliseconds
}

/**
 * True when there are jobs and none has ever run: the jobs are not registered yet (D-63, a person
 * must approve and register them), so no expiry notice has been created by a schedule.
 */
export function areScheduledJobsNotRunning(scheduledJobs: readonly WorkforceScheduledJob[]): boolean {
  return scheduledJobs.length > 0 && scheduledJobs.every(hasScheduledJobNeverRun)
}

/** One job with its derived health, judged against the time the status was loaded. */
export interface ScheduledJobStatus {
  readonly scheduledJob: WorkforceScheduledJob
  readonly hasNeverRun: boolean
  readonly isNotRunRecently: boolean
}

export function describeScheduledJobs(
  scheduledJobs: readonly WorkforceScheduledJob[],
  nowMilliseconds: number,
): ScheduledJobStatus[] {
  return scheduledJobs.map((scheduledJob) => ({
    scheduledJob,
    hasNeverRun: hasScheduledJobNeverRun(scheduledJob),
    isNotRunRecently: isScheduledJobNotRunRecently(scheduledJob, nowMilliseconds),
  }))
}

/** W12 super_admin scheduled-job status (read only; rows in database order). */
export class ScheduledJobService {
  public constructor(
    private readonly scheduledJobRepository: ScheduledJobRepository,
    private readonly currentTimeMilliseconds: () => number = (): number => Date.now(),
  ) {}

  public async loadScheduledJobs(): Promise<WorkforceScheduledJob[]> {
    return this.scheduledJobRepository.listScheduledJobs()
  }

  /** Loads the jobs and judges "not run recently" against the time the rows arrived. */
  public async loadScheduledJobStatuses(): Promise<ScheduledJobStatus[]> {
    const scheduledJobs = await this.loadScheduledJobs()
    return describeScheduledJobs(scheduledJobs, this.currentTimeMilliseconds())
  }
}
