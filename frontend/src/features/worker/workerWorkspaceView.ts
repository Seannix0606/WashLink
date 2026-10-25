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
  | 'find_work'
  | 'applications'
  | 'training'
  | 'certifications'
  | 'training_i_run'
  | 'bookings'

export interface WorkerWorkspaceTabDefinition {
  readonly value: WorkerWorkspaceTabKey
  readonly label: string
}

/** "Training I run" is offered only to a worker who is a current designated trainer (D-16). */
export function workerWorkspaceTabDefinitions(isDesignatedTrainer: boolean): readonly WorkerWorkspaceTabDefinition[] {
  return [
    { value: 'find_work', label: 'Find work' },
    { value: 'applications', label: 'My applications' },
    { value: 'training', label: 'My training' },
    { value: 'certifications', label: 'My certifications' },
    ...(isDesignatedTrainer ? [{ value: 'training_i_run' as const, label: 'Training I run' }] : []),
    { value: 'bookings', label: 'Assigned bookings' },
  ]
}

/**
 * Linked workers land on their assigned bookings as before; everyone else starts on
 * Find work (the marketplace does not need a roster link).
 */
export function defaultWorkerWorkspaceTab(hasRosterLink: boolean): WorkerWorkspaceTabKey {
  return hasRosterLink ? 'bookings' : 'find_work'
}
