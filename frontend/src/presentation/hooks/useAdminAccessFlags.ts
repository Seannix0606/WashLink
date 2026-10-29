import { useCallback } from 'react'
import type { AdminOversightService } from '../../application/services/AdminOversightService'
import type { AdminAccessFlag } from '../../domain/models/AdminOversight'
import { useLatestResource } from './useLatestResource'

const noFlags: readonly AdminAccessFlag[] = []

export interface UseAdminAccessFlagsResult {
  readonly flags: readonly AdminAccessFlag[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly reload: () => Promise<void>
}

/** N6: open contract disputes that stayed open long and whose case was read often (counts only). */
export function useAdminAccessFlags(adminOversightService: AdminOversightService): UseAdminAccessFlagsResult {
  const loadFlags = useCallback(async (): Promise<readonly AdminAccessFlag[]> => adminOversightService.listAccessFlags(), [adminOversightService])
  const flagsResource = useLatestResource({ load: loadFlags, initialResource: noFlags, loadFailedMessage: 'Could not load the flagged disputes.' })
  return {
    flags: flagsResource.resource,
    isLoading: flagsResource.isLoading,
    errorMessage: flagsResource.errorMessage,
    isEmpty: !flagsResource.isLoading && flagsResource.errorMessage === null && flagsResource.resource.length === 0,
    reload: flagsResource.reload,
  }
}
