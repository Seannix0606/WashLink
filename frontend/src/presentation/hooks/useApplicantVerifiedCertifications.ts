import { useCallback, useEffect, useState } from 'react'
import type { ApplicantPipelineService } from '../../application/services/ApplicantPipelineService'
import type { VerifiedCertification } from '../../domain/models/VerifiedCertification'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

const loadFailedMessage = 'Could not load verified certifications.'

interface CertificationsState {
  readonly requestKey: string
  readonly certifications: readonly VerifiedCertification[]
  readonly errorMessage: string | null
}

export interface UseApplicantVerifiedCertificationsResult {
  readonly certifications: readonly VerifiedCertification[]
  readonly isLoadingCertifications: boolean
  readonly certificationsErrorMessage: string | null
  readonly reloadCertifications: () => void
}

/** Workflow-issued certifications of one applicant; always empty until W7. */
export function useApplicantVerifiedCertifications(
  applicantPipelineService: ApplicantPipelineService,
  applicationId: string,
): UseApplicantVerifiedCertificationsResult {
  const [reloadNumber, setReloadNumber] = useState<number>(0)
  const [certificationsState, setCertificationsState] = useState<CertificationsState | null>(null)
  const requestKey = `${String(reloadNumber)}:${applicationId}`

  useEffect(() => {
    let isEffectCurrent = true
    const loadCertifications = async (): Promise<void> => {
      try {
        const loadedCertifications =
          await applicantPipelineService.listVerifiedCertifications(applicationId)
        if (isEffectCurrent) {
          setCertificationsState({ requestKey, certifications: loadedCertifications, errorMessage: null })
        }
      } catch (loadError) {
        if (isEffectCurrent) {
          setCertificationsState({
            requestKey,
            certifications: [],
            errorMessage: toDisplayErrorMessage(loadError, loadFailedMessage),
          })
        }
      }
    }
    void loadCertifications()
    return (): void => {
      isEffectCurrent = false
    }
  }, [applicantPipelineService, applicationId, requestKey])

  const reloadCertifications = useCallback((): void => {
    setReloadNumber((previousNumber) => previousNumber + 1)
  }, [])

  const isCurrent = certificationsState?.requestKey === requestKey
  return {
    certifications: isCurrent ? certificationsState.certifications : [],
    isLoadingCertifications: !isCurrent,
    certificationsErrorMessage: isCurrent ? certificationsState.errorMessage : null,
    reloadCertifications,
  }
}
