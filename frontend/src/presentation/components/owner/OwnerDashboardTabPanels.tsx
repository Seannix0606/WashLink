import type { ReactElement } from 'react'
import { lazy, Suspense } from 'react'
import type { ApplicantPipelineService } from '../../../application/services/ApplicantPipelineService'
import type { JobOpeningService } from '../../../application/services/JobOpeningService'
import type { RosterLinkService } from '../../../application/services/RosterLinkService'
import type { ShopService } from '../../../application/services/ShopService'
import type { ShopVerificationService } from '../../../application/services/ShopVerificationService'
import type { WorkerService } from '../../../application/services/WorkerService'
import type { Shop } from '../../../domain/models/Shop'
import type { Worker } from '../../../domain/models/Worker'
import type { OwnerDashboardSummary } from '../../../domain/models/WorkforceDashboardSummary'
import type { OwnerNextActionTarget } from '../../../domain/utilities/workforceNextActions'
import type { CertificationDependencies } from '../../dependencyInjection/createCertificationDependencies'
import type { ContractTemplateDependencies } from '../../dependencyInjection/createContractTemplateDependencies'
import type { OversightDependencies } from '../../dependencyInjection/createOversightDependencies'
import type { TrainingDependencies } from '../../dependencyInjection/createTrainingDependencies'
import type { WorkerContractDependencies } from '../../dependencyInjection/createWorkerContractDependencies'
import { Skeleton } from '../../design/ui'
import type { UseWorkforceDashboardSummaryResult } from '../../hooks/useWorkforceDashboardSummary'
import { OwnerVerificationPanel } from '../verification/OwnerVerificationPanel'
import type { OwnerDashboardPrimaryTabKey } from './ownerDashboardTabs'
import { OwnerShopsPanel } from './OwnerShopsPanel'
import { OwnerWorkersPanel } from './OwnerWorkersPanel'

// W4: the job openings tab is loaded only when the owner opens it.
const OwnerJobOpeningsPanel = lazy(async () => {
  const jobOpeningsModule = await import('./jobOpenings/OwnerJobOpeningsPanel')
  return { default: jobOpeningsModule.OwnerJobOpeningsPanel }
})

// W6: the training tab is loaded only when the owner opens it.
const OwnerTrainingProgramsPanel = lazy(async () => {
  const trainingModule = await import('./training/OwnerTrainingProgramsPanel')
  return { default: trainingModule.OwnerTrainingProgramsPanel }
})

// W7: the certifications tab is loaded only when the owner opens it.
const OwnerCertificationsPanel = lazy(async () => {
  const certificationsModule = await import('./certifications/OwnerCertificationsPanel')
  return { default: certificationsModule.OwnerCertificationsPanel }
})

// W8: the contract templates tab is loaded only when the owner opens it.
const OwnerContractTemplatesPanel = lazy(async () => {
  const contractTemplatesModule = await import('./contractTemplates/OwnerContractTemplatesPanel')
  return { default: contractTemplatesModule.OwnerContractTemplatesPanel }
})

// W9: the worker contracts tab is loaded only when the owner opens it.
const OwnerWorkerContractsPanel = lazy(async () => {
  const workerContractsModule = await import('./workerContracts/OwnerWorkerContractsPanel')
  return { default: workerContractsModule.OwnerWorkerContractsPanel }
})

// W11: the workforce overview tab is loaded only when the owner opens it.
const OwnerWorkforceOverviewPanel = lazy(async () => {
  const workforceModule = await import('./dashboard/OwnerWorkforceOverviewPanel')
  return { default: workforceModule.OwnerWorkforceOverviewPanel }
})

export interface OwnerDashboardTabPanelsProps {
  /** Every tab except Bookings (rendered by OwnerDashboardContent with its drawer). */
  readonly selectedTab: Exclude<OwnerDashboardPrimaryTabKey, 'bookings'>
  readonly ownerIdentifier: string
  readonly workerService: WorkerService
  readonly shopService: ShopService
  readonly shopVerificationService: ShopVerificationService
  readonly rosterLinkService: RosterLinkService
  readonly jobOpeningService: JobOpeningService
  readonly applicantPipelineService: ApplicantPipelineService
  readonly trainingDependencies: TrainingDependencies
  readonly certificationDependencies: CertificationDependencies
  readonly contractTemplateDependencies: ContractTemplateDependencies
  readonly workerContractDependencies: WorkerContractDependencies
  readonly oversightDependencies?: OversightDependencies
  readonly workforceSummaryState: UseWorkforceDashboardSummaryResult<OwnerDashboardSummary>
  readonly ownerShopList: Shop[]
  readonly onOwnerShopListChanged: (nextOwnerShopList: Shop[]) => void
  readonly onOwnerShopUpdatedAfterVerificationChange: (updatedShop: Shop) => void
  readonly workers: Worker[]
  readonly onWorkersChanged: (nextWorkers: Worker[]) => void
  readonly onNextActionSelected: (target: OwnerNextActionTarget) => void
}

/** The owner dashboard tab bodies (split out of OwnerDashboardContent in W11 to stay under ~350 lines). */
export function OwnerDashboardTabPanels(props: OwnerDashboardTabPanelsProps): ReactElement {
  const panelFallback = <Skeleton heightClassName="h-40" />
  switch (props.selectedTab) {
    case 'workforce':
      return (
        <Suspense fallback={panelFallback}>
          <OwnerWorkforceOverviewPanel summaryState={props.workforceSummaryState} onActionSelected={props.onNextActionSelected} />
        </Suspense>
      )
    case 'shops':
      return (
        <OwnerShopsPanel
          ownerIdentifier={props.ownerIdentifier}
          shopService={props.shopService}
          ownerShopList={props.ownerShopList}
          onOwnerShopListChanged={props.onOwnerShopListChanged}
        />
      )
    case 'team':
      return (
        <OwnerWorkersPanel
          ownerIdentifier={props.ownerIdentifier}
          workerService={props.workerService}
          rosterLinkService={props.rosterLinkService}
          workers={props.workers}
          onWorkersChanged={props.onWorkersChanged}
        />
      )
    case 'jobs':
      return (
        <Suspense fallback={panelFallback}>
          <OwnerJobOpeningsPanel
            jobOpeningService={props.jobOpeningService}
            applicantPipelineService={props.applicantPipelineService}
            ownerShopList={props.ownerShopList}
            trainingDependencies={props.trainingDependencies}
          />
        </Suspense>
      )
    case 'training':
      return (
        <Suspense fallback={panelFallback}>
          <OwnerTrainingProgramsPanel
            trainingDependencies={props.trainingDependencies}
            ownerShopList={props.ownerShopList}
            rosterWorkers={props.workers}
            certificationDependencies={props.certificationDependencies}
          />
        </Suspense>
      )
    case 'certifications':
      return (
        <Suspense fallback={panelFallback}>
          <OwnerCertificationsPanel
            certificationDependencies={props.certificationDependencies}
            ownerShopList={props.ownerShopList}
            platformReviewService={props.oversightDependencies?.certificationPlatformReviewService}
          />
        </Suspense>
      )
    case 'contracts':
      return (
        <Suspense fallback={panelFallback}>
          <OwnerContractTemplatesPanel contractTemplateService={props.contractTemplateDependencies.contractTemplateService} />
        </Suspense>
      )
    case 'worker_contracts':
      return (
        <Suspense fallback={panelFallback}>
          <OwnerWorkerContractsPanel
            workerContractService={props.workerContractDependencies.workerContractService}
            ownerRelationshipService={props.workerContractDependencies.ownerRelationshipService}
            contractDisputeService={props.oversightDependencies?.contractDisputeService}
          />
        </Suspense>
      )
    case 'verification':
      return (
        <OwnerVerificationPanel
          ownerIdentifier={props.ownerIdentifier}
          ownerShopList={props.ownerShopList}
          shopVerificationService={props.shopVerificationService}
          onOwnerShopUpdatedAfterVerificationChange={props.onOwnerShopUpdatedAfterVerificationChange}
        />
      )
  }
}
