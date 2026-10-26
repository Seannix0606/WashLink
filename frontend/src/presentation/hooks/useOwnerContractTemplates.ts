import { useCallback, useMemo, useState } from 'react'
import type { ContractTemplateService, OwnerContractTemplateOverview } from '../../application/services/ContractTemplateService'
import type {
  ContractTemplateStatus,
  OwnerContractTemplate,
  StandardContractTemplate,
} from '../../domain/models/ContractTemplate'
import { useLatestResource } from './useLatestResource'

const emptyOverview: OwnerContractTemplateOverview = { templates: [], standard: null }

export interface UseOwnerContractTemplatesResult {
  readonly allTemplates: readonly OwnerContractTemplate[]
  readonly visibleTemplates: readonly OwnerContractTemplate[]
  readonly standard: StandardContractTemplate | null
  readonly statusFilter: ContractTemplateStatus
  readonly setStatusFilter: (nextStatusFilter: ContractTemplateStatus) => void
  readonly activeCount: number
  readonly archivedCount: number
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

/**
 * The owner's templates and the current standard. Polled while visible, so "A newer
 * standard template is available" follows live server state (D-30, no notification).
 */
export function useOwnerContractTemplates(contractTemplateService: ContractTemplateService): UseOwnerContractTemplatesResult {
  const [statusFilter, setStatusFilter] = useState<ContractTemplateStatus>('active')
  const loadOverview = useCallback(
    async (): Promise<OwnerContractTemplateOverview> => contractTemplateService.loadOwnerOverview(),
    [contractTemplateService],
  )
  const overviewResource = useLatestResource({
    load: loadOverview,
    initialResource: emptyOverview,
    loadFailedMessage: 'Could not load your contract templates.',
    isPolling: true,
  })
  const allTemplates = overviewResource.resource.templates
  const visibleTemplates = useMemo(
    () => allTemplates.filter((template) => template.status === statusFilter),
    [allTemplates, statusFilter],
  )
  const activeCount = allTemplates.filter((template) => template.status === 'active').length
  return {
    allTemplates,
    visibleTemplates,
    standard: overviewResource.resource.standard,
    statusFilter,
    setStatusFilter,
    activeCount,
    archivedCount: allTemplates.length - activeCount,
    isLoading: overviewResource.isLoading,
    errorMessage: overviewResource.errorMessage,
    isEmpty: !overviewResource.isLoading && overviewResource.errorMessage === null && visibleTemplates.length === 0,
    reload: overviewResource.reload,
    refresh: overviewResource.refresh,
  }
}
