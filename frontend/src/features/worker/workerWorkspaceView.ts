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
