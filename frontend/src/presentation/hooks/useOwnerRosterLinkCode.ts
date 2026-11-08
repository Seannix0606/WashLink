import { useCallback, useState } from 'react'
import type { RosterLinkService } from '../../application/services/RosterLinkService'
import type { IssuedRosterLinkCode } from '../../domain/models/RosterLink'
import { applicationToast } from '../design/ui'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

export interface UseOwnerRosterLinkCodeResult {
  /** Held in memory only and shown once; it cannot be retrieved again. */
  readonly issuedRosterLinkCode: IssuedRosterLinkCode | null
  readonly isIssuingRosterLinkCode: boolean
  readonly issueRosterLinkCode: () => Promise<void>
  readonly copyIssuedRosterLinkCode: () => Promise<void>
  readonly dismissIssuedRosterLinkCode: () => void
}

export function useOwnerRosterLinkCode(
  rosterLinkService: RosterLinkService,
  workerRowIdentifier: string,
): UseOwnerRosterLinkCodeResult {
  const [issuedRosterLinkCode, setIssuedRosterLinkCode] =
    useState<IssuedRosterLinkCode | null>(null)
  const [isIssuingRosterLinkCode, setIsIssuingRosterLinkCode] = useState<boolean>(false)

  const issueRosterLinkCode = useCallback(async (): Promise<void> => {
    setIsIssuingRosterLinkCode(true)
    const nextIssuedCode = await runServiceActionWithToast(
      () => rosterLinkService.issueRosterLinkCode(workerRowIdentifier),
      {
        successMessage: 'Link code created. Any earlier code for this worker stops working.',
        fallbackErrorMessage: 'Could not create a link code for this worker.',
      },
    )
    setIsIssuingRosterLinkCode(false)
    if (nextIssuedCode !== null) {
      setIssuedRosterLinkCode(nextIssuedCode)
    }
  }, [rosterLinkService, workerRowIdentifier])

  const copyIssuedRosterLinkCode = useCallback(async (): Promise<void> => {
    if (issuedRosterLinkCode === null) {
      return
    }
    try {
      await navigator.clipboard.writeText(issuedRosterLinkCode.linkCode)
      applicationToast.success('Code copied.')
    } catch {
      applicationToast.error('Could not copy. Select the code and copy it manually.')
    }
  }, [issuedRosterLinkCode])

  const dismissIssuedRosterLinkCode = useCallback((): void => {
    setIssuedRosterLinkCode(null)
  }, [])

  return {
    issuedRosterLinkCode,
    isIssuingRosterLinkCode,
    issueRosterLinkCode,
    copyIssuedRosterLinkCode,
    dismissIssuedRosterLinkCode,
  }
}
