import { useCallback, useState } from 'react'
import type {
  ShopTrainingEligibility,
  TrainingProgramService,
} from '../../application/services/TrainingProgramService'
import {
  trainingProgramLimits,
  type SaveTrainingProgramInput,
  type TrainingProgram,
  type TrainingProgramStatus,
} from '../../domain/models/TrainingProgram'
import type { TrainingSession } from '../../domain/models/TrainingSession'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { useLatestResource } from './useLatestResource'

interface OwnerTrainingSnapshot {
  readonly programs: readonly TrainingProgram[]
  readonly sessions: readonly TrainingSession[]
  readonly shopEligibility: ShopTrainingEligibility
  /** When this snapshot was read; open readiness (dates) is judged against it. */
  readonly loadedAt: Date
}

const emptySnapshot: OwnerTrainingSnapshot = {
  programs: [],
  sessions: [],
  shopEligibility: {},
  loadedAt: new Date(0),
}

const transitionSuccessMessages: Readonly<Partial<Record<TrainingProgramStatus, string>>> = {
  open: 'Training program opened.',
  closed: 'Training program closed to new invitations.',
  archived: 'Training program archived.',
}

export interface UseOwnerTrainingProgramsResult {
  readonly programs: readonly TrainingProgram[]
  readonly sessions: readonly TrainingSession[]
  readonly shopEligibility: ShopTrainingEligibility
  readonly loadedAt: Date
  readonly isLoadingPrograms: boolean
  readonly programsErrorMessage: string | null
  readonly isProgramListEmpty: boolean
  readonly isProgramListTruncated: boolean
  readonly pendingProgramId: string | null
  readonly reloadPrograms: () => Promise<void>
  readonly refreshPrograms: () => Promise<void>
  readonly saveProgram: (
    existingProgram: TrainingProgram | null,
    shopId: string,
    saveInput: SaveTrainingProgramInput,
  ) => Promise<boolean>
  readonly deleteProgramDraft: (program: TrainingProgram) => Promise<boolean>
  readonly transitionProgram: (
    program: TrainingProgram,
    toStatus: TrainingProgramStatus,
    hasConfirmedFreeTraining: boolean,
  ) => Promise<boolean>
}

export function useOwnerTrainingPrograms(
  trainingProgramService: TrainingProgramService,
  ownerShopIds: readonly string[],
): UseOwnerTrainingProgramsResult {
  const ownerShopIdsKey = ownerShopIds.join(',')
  const [pendingProgramId, setPendingProgramId] = useState<string | null>(null)

  const loadSnapshot = useCallback(async (): Promise<OwnerTrainingSnapshot> => {
    const shopIds = ownerShopIdsKey === '' ? [] : ownerShopIdsKey.split(',')
    const [programs, shopEligibility] = await Promise.all([
      trainingProgramService.listOwnPrograms(),
      trainingProgramService.loadShopEligibility(shopIds),
    ])
    const sessions = await trainingProgramService.listSessions(programs.map((program) => program.id))
    return { programs, sessions, shopEligibility, loadedAt: new Date() }
  }, [ownerShopIdsKey, trainingProgramService])

  const { resource, isLoading, errorMessage, reload, refresh } = useLatestResource({
    load: loadSnapshot,
    initialResource: emptySnapshot,
    loadFailedMessage: 'Could not load your training programs.',
  })

  const saveProgram = useCallback(
    async (existingProgram: TrainingProgram | null, shopId: string, saveInput: SaveTrainingProgramInput): Promise<boolean> => {
      const savedProgram = await runServiceActionWithToast(
        () =>
          existingProgram === null
            ? trainingProgramService.createProgram(shopId, saveInput)
            : trainingProgramService.updateDraft(existingProgram, saveInput),
        { successMessage: 'Training program draft saved.', fallbackErrorMessage: 'Could not save the training program.' },
      )
      // Refresh either way: a failed second step of a create still leaves a draft, and a
      // failure is often a stale version ("changed. Refresh and try again.").
      await refresh()
      return savedProgram !== null
    },
    [refresh, trainingProgramService],
  )

  const deleteProgramDraft = useCallback(
    async (program: TrainingProgram): Promise<boolean> => {
      setPendingProgramId(program.id)
      const didDelete = await runServiceActionWithToast(
        async () => {
          await trainingProgramService.deleteDraft(program)
          return true
        },
        { successMessage: 'Draft deleted.', fallbackErrorMessage: 'Could not delete the draft.' },
      )
      await refresh()
      setPendingProgramId(null)
      return didDelete !== null
    },
    [refresh, trainingProgramService],
  )

  const transitionProgram = useCallback(
    async (program: TrainingProgram, toStatus: TrainingProgramStatus, hasConfirmedFreeTraining: boolean): Promise<boolean> => {
      setPendingProgramId(program.id)
      const transitionedProgram = await runServiceActionWithToast(
        () => trainingProgramService.transition(program, toStatus, hasConfirmedFreeTraining),
        {
          successMessage: transitionSuccessMessages[toStatus] ?? 'Training program updated.',
          fallbackErrorMessage: 'Could not change the training program status.',
        },
      )
      await refresh()
      setPendingProgramId(null)
      return transitionedProgram !== null
    },
    [refresh, trainingProgramService],
  )

  return {
    programs: resource.programs,
    sessions: resource.sessions,
    shopEligibility: resource.shopEligibility,
    loadedAt: resource.loadedAt,
    isLoadingPrograms: isLoading,
    programsErrorMessage: errorMessage,
    isProgramListEmpty: !isLoading && errorMessage === null && resource.programs.length === 0,
    isProgramListTruncated: resource.programs.length >= trainingProgramLimits.ownListMaximum,
    pendingProgramId,
    reloadPrograms: reload,
    refreshPrograms: refresh,
    saveProgram,
    deleteProgramDraft,
    transitionProgram,
  }
}
