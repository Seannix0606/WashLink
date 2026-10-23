import { useCallback, useState } from 'react'
import type { RosterLinkService } from '../../application/services/RosterLinkService'
import type { RosterLinkCodePreview } from '../../domain/models/RosterLink'
import { describeRosterLinkOutcome } from '../utilities/rosterLinkResultDisplay'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'
import { applicationToast } from '../design/ui'

/** entering -> checking -> confirming -> linking -> linked; failures return to entering. */
export type AcceptRosterLinkCodePhase =
  | 'entering'
  | 'checking'
  | 'confirming'
  | 'linking'
  | 'linked'

interface UseAcceptRosterLinkCodeOptions {
  readonly rosterLinkService: RosterLinkService
  readonly onRosterLinked?: () => void
}

export interface UseAcceptRosterLinkCodeResult {
  readonly enteredLinkCode: string
  readonly phase: AcceptRosterLinkCodePhase
  readonly validPreview: RosterLinkCodePreview | null
  readonly feedbackMessage: string | null
  readonly isFeedbackError: boolean
  readonly setEnteredLinkCode: (nextLinkCode: string) => void
  readonly checkLinkCode: () => Promise<void>
  readonly confirmRosterLink: () => Promise<void>
  readonly startOver: () => void
}

export function useAcceptRosterLinkCode({
  rosterLinkService,
  onRosterLinked,
}: UseAcceptRosterLinkCodeOptions): UseAcceptRosterLinkCodeResult {
  const [enteredLinkCode, setEnteredLinkCodeState] = useState<string>('')
  const [phase, setPhase] = useState<AcceptRosterLinkCodePhase>('entering')
  const [validPreview, setValidPreview] = useState<RosterLinkCodePreview | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [isFeedbackError, setIsFeedbackError] = useState<boolean>(false)

  const showFailure = useCallback((failureMessage: string): void => {
    setFeedbackMessage(failureMessage)
    setIsFeedbackError(true)
    setValidPreview(null)
    setPhase('entering')
  }, [])

  const setEnteredLinkCode = useCallback((nextLinkCode: string): void => {
    setEnteredLinkCodeState(nextLinkCode)
    setFeedbackMessage(null)
    setIsFeedbackError(false)
  }, [])

  const checkLinkCode = useCallback(async (): Promise<void> => {
    setPhase('checking')
    setFeedbackMessage(null)
    try {
      const codePreview = await rosterLinkService.previewRosterLinkCode(enteredLinkCode)
      if (codePreview.result !== 'valid') {
        showFailure(describeRosterLinkOutcome(codePreview.result))
        return
      }
      setValidPreview(codePreview)
      setFeedbackMessage(describeRosterLinkOutcome('valid'))
      setIsFeedbackError(false)
      setPhase('confirming')
    } catch (previewError) {
      showFailure(toDisplayErrorMessage(previewError, 'Could not check this link code.'))
    }
  }, [enteredLinkCode, rosterLinkService, showFailure])

  const confirmRosterLink = useCallback(async (): Promise<void> => {
    setPhase('linking')
    try {
      const linkResult = await rosterLinkService.acceptRosterLinkCode(enteredLinkCode)
      if (linkResult !== 'linked') {
        showFailure(describeRosterLinkOutcome(linkResult))
        return
      }
      setFeedbackMessage(describeRosterLinkOutcome('linked'))
      setIsFeedbackError(false)
      setPhase('linked')
      applicationToast.success(describeRosterLinkOutcome('linked'))
      onRosterLinked?.()
    } catch (acceptError) {
      showFailure(toDisplayErrorMessage(acceptError, 'Could not link your account.'))
    }
  }, [enteredLinkCode, onRosterLinked, rosterLinkService, showFailure])

  const startOver = useCallback((): void => {
    setEnteredLinkCodeState('')
    setValidPreview(null)
    setFeedbackMessage(null)
    setIsFeedbackError(false)
    setPhase('entering')
  }, [])

  return {
    enteredLinkCode,
    phase,
    validPreview,
    feedbackMessage,
    isFeedbackError,
    setEnteredLinkCode,
    checkLinkCode,
    confirmRosterLink,
    startOver,
  }
}
