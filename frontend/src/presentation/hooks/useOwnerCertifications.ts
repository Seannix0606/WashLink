import { useCallback } from 'react'
import type { CertificationService } from '../../application/services/CertificationService'
import type { CertifiableEnrollment, CertificationHistoryEntry, OwnerCertification } from '../../domain/models/Certification'
import { useLatestResource } from './useLatestResource'

const noOwnerCertifications: readonly OwnerCertification[] = []
const noCertifiableEnrollments: readonly CertifiableEnrollment[] = []
const noHistoryEntries: readonly CertificationHistoryEntry[] = []

export interface CertificationListState<Item> {
  readonly items: readonly Item[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

function toListState<Item>(listResource: {
  readonly resource: readonly Item[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}): CertificationListState<Item> {
  return {
    items: listResource.resource,
    isLoading: listResource.isLoading,
    errorMessage: listResource.errorMessage,
    isEmpty: !listResource.isLoading && listResource.errorMessage === null && listResource.resource.length === 0,
    reload: listResource.reload,
    refresh: listResource.refresh,
  }
}

/** Certificates issued from one shop (open reviews first); polled every 60 s while visible. */
export function useOwnerCertifications(
  certificationService: CertificationService,
  shopId: string,
): CertificationListState<OwnerCertification> {
  const loadCertifications = useCallback(
    async (): Promise<readonly OwnerCertification[]> => certificationService.listOwnerCertifications(shopId),
    [certificationService, shopId],
  )
  return toListState(
    useLatestResource({
      load: loadCertifications,
      initialResource: noOwnerCertifications,
      loadFailedMessage: 'Could not load the certifications.',
      isPolling: true,
    }),
  )
}

/** Completed trainees of one program without an original certificate; polled while visible. */
export function useCertifiableEnrollments(
  certificationService: CertificationService,
  programId: string,
): CertificationListState<CertifiableEnrollment> {
  const loadEnrollments = useCallback(
    async (): Promise<readonly CertifiableEnrollment[]> => certificationService.listCertifiableEnrollments(programId),
    [certificationService, programId],
  )
  return toListState(
    useLatestResource({
      load: loadEnrollments,
      initialResource: noCertifiableEnrollments,
      loadFailedMessage: 'Could not load the trainees who can be certified.',
      isPolling: true,
    }),
  )
}

/** Status events and review requests of one certificate, oldest first. */
export function useCertificationHistory(
  certificationService: CertificationService,
  certificationId: string,
): CertificationListState<CertificationHistoryEntry> {
  const loadHistory = useCallback(
    async (): Promise<readonly CertificationHistoryEntry[]> => certificationService.listHistory(certificationId),
    [certificationService, certificationId],
  )
  return toListState(
    useLatestResource({
      load: loadHistory,
      initialResource: noHistoryEntries,
      loadFailedMessage: 'Could not load the certification history.',
    }),
  )
}
