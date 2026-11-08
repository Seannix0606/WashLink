import { useCallback, useRef, useState } from 'react'
import type { AdminOversightService } from '../../application/services/AdminOversightService'
import type { RelationshipLookupKind, RelationshipLookupResult } from '../../domain/models/AdminOversight'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

export interface UseAdminRelationshipLookupResult {
  readonly result: RelationshipLookupResult | null
  readonly isLookingUp: boolean
  readonly errorMessage: string | null
  readonly lookUp: (kind: RelationshipLookupKind, profileId: string, purpose: string, note: string) => Promise<void>
}

/**
 * Super_admin relationship lookups (D-38, D-55). Each lookup is recorded with its purpose and
 * note by the database, so it runs only when the administrator submits the form.
 */
export function useAdminRelationshipLookup(adminOversightService: AdminOversightService): UseAdminRelationshipLookupResult {
  const [result, setResult] = useState<RelationshipLookupResult | null>(null)
  const [isLookingUp, setIsLookingUp] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isRunningRef = useRef<boolean>(false)

  const lookUp = useCallback(
    async (kind: RelationshipLookupKind, profileId: string, purpose: string, note: string): Promise<void> => {
      if (isRunningRef.current) {
        return
      }
      isRunningRef.current = true
      setIsLookingUp(true)
      setErrorMessage(null)
      try {
        setResult(await adminOversightService.lookupRelationships(kind, profileId, purpose, note))
      } catch (lookupError) {
        setResult(null)
        setErrorMessage(toDisplayErrorMessage(lookupError, 'Could not look up the relationships.'))
      } finally {
        isRunningRef.current = false
        setIsLookingUp(false)
      }
    },
    [adminOversightService],
  )

  return { result, isLookingUp, errorMessage, lookUp }
}
