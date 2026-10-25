import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { GraduationCap, Info, Plus, Store } from 'lucide-react'
import type { Shop } from '../../../../domain/models/Shop'
import { trainingProgramLimits, type TrainingProgram } from '../../../../domain/models/TrainingProgram'
import type { Worker } from '../../../../domain/models/Worker'
import type { TrainingDependencies } from '../../../dependencyInjection/createTrainingDependencies'
import { Button, Card, EmptyState, Modal, Skeleton } from '../../../design/ui'
import { useOwnerTrainingPrograms } from '../../../hooks/useOwnerTrainingPrograms'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { TrainingConfirmModal } from '../../training/TrainingConfirmModals'
import { TrainingProgramDetailsView } from '../../training/TrainingProgramDetailsView'
import { TrainingVersusPaidWorkNote } from '../../training/TrainingNotices'
import { OpenTrainingProgramConfirmModal } from './OpenTrainingProgramConfirmModal'
import { TrainingProgramEditorModal } from './TrainingProgramEditorModal'
import { TrainingProgramListItem, type TrainingProgramListAction } from './TrainingProgramListItem'
import { TrainingProgramManageView } from './TrainingProgramManageView'

type EditorTarget = { readonly mode: 'create' } | { readonly mode: 'edit'; readonly program: TrainingProgram }

type ConfirmableAction = 'delete' | 'closed' | 'archived'

const confirmCopy: Readonly<Record<ConfirmableAction, { readonly title: string; readonly message: string; readonly button: string }>> = {
  delete: { title: 'Delete this draft?', message: 'The draft and its training days are removed. This cannot be undone.', button: 'Delete draft' },
  closed: {
    title: 'Close to new invitations?',
    message: 'No new invitations can be sent. Enrolled workers continue and records can still be added. This cannot be undone.',
    button: 'Close program',
  },
  archived: {
    title: 'Archive this program?',
    message: 'Archived programs are kept for your records only. Training still in progress blocks archiving. This cannot be undone.',
    button: 'Archive',
  },
}

interface OwnerTrainingProgramsPanelProps {
  readonly trainingDependencies: TrainingDependencies
  readonly ownerShopList: readonly Shop[]
  readonly rosterWorkers: readonly Worker[]
}

export function OwnerTrainingProgramsPanel({ trainingDependencies, ownerShopList, rosterWorkers }: OwnerTrainingProgramsPanelProps): ReactElement {
  const ownerShopIds = useMemo(() => ownerShopList.map((ownerShop) => ownerShop.id), [ownerShopList])
  const programsState = useOwnerTrainingPrograms(trainingDependencies.trainingProgramService, ownerShopIds)
  const { programs, sessions, shopEligibility, loadedAt, pendingProgramId } = programsState
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null)
  const [previewedProgram, setPreviewedProgram] = useState<TrainingProgram | null>(null)
  const [programToOpen, setProgramToOpen] = useState<TrainingProgram | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState<{ readonly program: TrainingProgram; readonly action: ConfirmableAction } | null>(null)
  const [managedProgramId, setManagedProgramId] = useState<string | null>(null)
  const shopNameById = useMemo(() => new Map(ownerShopList.map((ownerShop) => [ownerShop.id, ownerShop.name])), [ownerShopList])
  const shopNameOf = (shopId: string | null): string => (shopId === null ? 'Shop removed' : (shopNameById.get(shopId) ?? 'Unknown shop'))
  const managedProgram = programs.find((program) => program.id === managedProgramId) ?? null
  const hasNoShops = ownerShopList.length === 0
  const hasUnverifiedShop =
    !programsState.isLoadingPrograms && programsState.programsErrorMessage === null && ownerShopIds.some((shopId) => shopEligibility[shopId] !== true)

  const handleAction = (program: TrainingProgram, action: TrainingProgramListAction): void => {
    if (action === 'edit') {
      setEditorTarget({ mode: 'edit', program })
    } else if (action === 'preview') {
      setPreviewedProgram(program)
    } else if (action === 'manage') {
      setManagedProgramId(program.id)
    } else if (action === 'open') {
      setProgramToOpen(program)
    } else if (action === 'delete' || action === 'closed' || action === 'archived') {
      setPendingConfirmation({ program, action })
    }
  }

  const confirmPendingAction = async (): Promise<void> => {
    if (pendingConfirmation === null) {
      return
    }
    const { program, action } = pendingConfirmation
    if (action === 'delete') {
      await programsState.deleteProgramDraft(program)
    } else {
      await programsState.transitionProgram(program, action, false)
    }
    setPendingConfirmation(null)
  }

  return (
    <Card elevation="raised" className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
            <GraduationCap className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
            Training programs
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
            Required initial training for applicants you accepted. It is always free for the worker.
          </p>
        </div>
        {!hasNoShops && managedProgram === null ? (
          <Button size="sm" leadingIcon={<Plus className="h-4 w-4" />} onClick={(): void => { setEditorTarget({ mode: 'create' }) }}>
            New training program
          </Button>
        ) : null}
      </header>
      <TrainingVersusPaidWorkNote />
      {hasUnverifiedShop && !hasNoShops ? (
        <p role="status" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-sm text-[var(--color-warning-600)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          You can save drafts now. Opening a program and inviting workers need an approved shop verification.
        </p>
      ) : null}

      {managedProgram !== null ? (
        <TrainingProgramManageView
          trainingDependencies={trainingDependencies}
          program={managedProgram}
          shopName={shopNameOf(managedProgram.shopId)}
          sessions={sessions}
          rosterWorkers={rosterWorkers}
          onScheduleChanged={(): void => { void programsState.refreshPrograms() }}
          onBack={(): void => { setManagedProgramId(null) }}
        />
      ) : hasNoShops ? (
        <EmptyState icon={<Store className="h-5 w-5" />} title="Add a shop first" description="Training programs belong to a shop. Add your shop in My shops, then come back here." />
      ) : programsState.isLoadingPrograms ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading training programs">
          <Skeleton heightClassName="h-20" />
          <Skeleton heightClassName="h-20" />
        </div>
      ) : programsState.programsErrorMessage !== null ? (
        <LoadErrorNotice title="Training programs could not be loaded" errorMessage={programsState.programsErrorMessage}
          onRetry={(): void => { void programsState.reloadPrograms() }} />
      ) : programsState.isProgramListEmpty ? (
        <EmptyState icon={<GraduationCap className="h-5 w-5" />} title="No training programs yet" description="Create a draft. Only you can see it until you open it." />
      ) : (
        <div className="space-y-3">
          {programsState.isProgramListTruncated ? (
            <p role="status" className="text-xs text-[var(--color-ink-500)]">
              Showing the {String(trainingProgramLimits.ownListMaximum)} most recently updated programs. Archived programs are not listed.
            </p>
          ) : null}
          <ul aria-label="Training programs" className="space-y-3">
            {programs.map((program) => (
              <TrainingProgramListItem
                key={program.id}
                program={program}
                shopName={shopNameOf(program.shopId)}
                sessions={sessions}
                isShopVerified={program.shopId !== null && shopEligibility[program.shopId] === true}
                evaluatedAt={loadedAt}
                isActionPending={pendingProgramId === program.id}
                onActionRequested={handleAction}
              />
            ))}
          </ul>
        </div>
      )}

      {editorTarget !== null ? (
        <TrainingProgramEditorModal
          key={editorTarget.mode === 'edit' ? editorTarget.program.id : 'new'}
          program={editorTarget.mode === 'edit' ? editorTarget.program : null}
          initialShopId={ownerShopList.length === 1 ? (ownerShopList[0]?.id ?? '') : ''}
          ownerShopList={ownerShopList}
          onSave={(shopId, saveInput): Promise<boolean> =>
            programsState.saveProgram(editorTarget.mode === 'edit' ? editorTarget.program : null, shopId, saveInput)
          }
          onClose={(): void => { setEditorTarget(null) }}
        />
      ) : null}

      <Modal isOpen={previewedProgram !== null} onClose={(): void => { setPreviewedProgram(null) }} title="Training program details" maxWidthClassName="max-w-2xl">
        {previewedProgram !== null ? (
          <div className="max-h-[70dvh] overflow-y-auto pr-1">
            <TrainingProgramDetailsView content={previewedProgram} shopName={shopNameOf(previewedProgram.shopId)} />
          </div>
        ) : null}
      </Modal>

      <OpenTrainingProgramConfirmModal
        program={programToOpen}
        isSubmitting={programToOpen !== null && pendingProgramId === programToOpen.id}
        onConfirm={(program, hasConfirmedFreeTraining): void => {
          void programsState.transitionProgram(program, 'open', hasConfirmedFreeTraining).then(() => { setProgramToOpen(null) })
        }}
        onCancel={(): void => { setProgramToOpen(null) }}
      />

      <TrainingConfirmModal
        isOpen={pendingConfirmation !== null}
        title={pendingConfirmation === null ? '' : confirmCopy[pendingConfirmation.action].title}
        subjectText={pendingConfirmation?.program.title ?? ''}
        message={pendingConfirmation === null ? '' : confirmCopy[pendingConfirmation.action].message}
        confirmButtonLabel={pendingConfirmation === null ? '' : confirmCopy[pendingConfirmation.action].button}
        isDestructive
        isSubmitting={pendingConfirmation !== null && pendingProgramId === pendingConfirmation.program.id}
        onConfirm={(): void => { void confirmPendingAction() }}
        onCancel={(): void => { setPendingConfirmation(null) }}
      />
    </Card>
  )
}
