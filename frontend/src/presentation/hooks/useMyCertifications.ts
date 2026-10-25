import { useCallback } from 'react'
import type { CertificationService } from '../../application/services/CertificationService'
import type { MyCertification } from '../../domain/models/Certification'
import type { WorkerVerifiedCertificationState } from '../../domain/models/VerifiedCertification'
import { useLatestResource } from './useLatestResource'

const noCertifications: readonly MyCertification[] = []

export interface UseMyCertificationsResult {
  readonly certifications: readonly MyCertification[]
  readonly isLoadingCertifications: boolean
  readonly certificationsErrorMessage: string | null
  readonly isCertificationListEmpty: boolean
  readonly reloadCertifications: () => Promise<void>
  readonly refreshCertifications: () => Promise<void>
}

/** The worker's own certificates (my_certifications); polled every 60 s while visible. */
export function useMyCertifications(certificationService: CertificationService): UseMyCertificationsResult {
  const loadCertifications = useCallback(
    async (): Promise<readonly MyCertification[]> => certificationService.listMyCertifications(),
    [certificationService],
  )
  const { resource, isLoading, errorMessage, reload, refresh } = useLatestResource({
    load: loadCertifications,
    initialResource: noCertifications,
    loadFailedMessage: 'Could not load your certifications.',
    isPolling: true,
  })
  return {
    certifications: resource,
    isLoadingCertifications: isLoading,
    certificationsErrorMessage: errorMessage,
    isCertificationListEmpty: !isLoading && errorMessage === null && resource.length === 0,
    reloadCertifications: reload,
    refreshCertifications: refresh,
  }
}

const loadingState: WorkerVerifiedCertificationState = { kind: 'loading' }

/** D-20 state for the apply flow: whether the worker holds a current certificate, from the server. */
export function useWorkerCertificationState(certificationService: CertificationService): WorkerVerifiedCertificationState {
  const loadState = useCallback(
    async (): Promise<WorkerVerifiedCertificationState> => certificationService.loadWorkerCertificationState(),
    [certificationService],
  )
  const { resource, isLoading, errorMessage } = useLatestResource({
    load: loadState,
    initialResource: loadingState,
    loadFailedMessage: 'Could not check your certifications.',
    isPolling: true,
  })
  if (isLoading) {
    return loadingState
  }
  return errorMessage !== null ? { kind: 'unavailable' } : resource
}
