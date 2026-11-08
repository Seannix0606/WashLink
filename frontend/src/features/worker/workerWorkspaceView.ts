export type WorkerWorkspaceView = 'loading' | 'onboarding' | 'profile_error' | 'jobs'

interface WorkerWorkspaceViewInput {
  readonly isLoadingRosterLinks: boolean
  readonly rosterLinkCount: number
  readonly isLoadingWorkerProfile: boolean
  readonly hasWorkerProfile: boolean
  readonly hasWorkerProfileError: boolean
  readonly hasSkippedOnboarding: boolean
}

/**
 * Pure routing rule for the worker workspace. A worker linked to any roster always
 * reaches the jobs page, with or without a profile, so existing linked workers are
 * never blocked by onboarding.
 */
export function decideWorkerWorkspaceView({
  isLoadingRosterLinks,
  rosterLinkCount,
  isLoadingWorkerProfile,
  hasWorkerProfile,
  hasWorkerProfileError,
  hasSkippedOnboarding,
}: WorkerWorkspaceViewInput): WorkerWorkspaceView {
  if (isLoadingRosterLinks) {
    return 'loading'
  }
  if (rosterLinkCount > 0) {
    return 'jobs'
  }
  if (isLoadingWorkerProfile) {
    return 'loading'
  }
  if (hasWorkerProfileError) {
    return 'profile_error'
  }
  if (!hasWorkerProfile && !hasSkippedOnboarding) {
    return 'onboarding'
  }
  return 'jobs'
}

export type WorkerWorkspaceTabKey =
  | 'overview'
  | 'find_work'
  | 'applications'
  | 'training'
  | 'certifications'
  | 'contracts'
  | 'training_i_run'
  | 'bookings'

export interface WorkerWorkspaceTabDefinition {
  readonly value: WorkerWorkspaceTabKey
  readonly label: string
}

/**
 * W11 (D-42): "Overview" comes first. "Training I run" is offered only to a worker who is a
 * current designated trainer (D-16).
 */
export function workerWorkspaceTabDefinitions(isDesignatedTrainer: boolean): readonly WorkerWorkspaceTabDefinition[] {
  return [
    { value: 'overview', label: 'Overview' },
    { value: 'find_work', label: 'Find work' },
    { value: 'applications', label: 'My applications' },
    { value: 'training', label: 'My training' },
    { value: 'certifications', label: 'My certifications' },
    { value: 'contracts', label: 'Contracts' },
    ...(isDesignatedTrainer ? [{ value: 'training_i_run' as const, label: 'Training I run' }] : []),
    { value: 'bookings', label: 'Assigned bookings' },
  ]
}

/**
 * W11 (D-42, J18): linked workers keep landing on their assigned bookings; everyone else starts
 * on the Overview (next action first).
 */
export function defaultWorkerWorkspaceTab(hasRosterLink: boolean): WorkerWorkspaceTabKey {
  return hasRosterLink ? 'bookings' : 'overview'
}
