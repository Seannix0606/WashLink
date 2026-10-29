import { useCallback, useRef, useState } from 'react'
import { emptyAdminAuditLogFilterInput, type AdminAuditLogFilterInput, type AdminOversightService } from '../../application/services/AdminOversightService'
import type { AdminAuditLogEvent, AdminAuditLogFilters } from '../../domain/models/AdminOversight'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

export type AdminAuditLogState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly errorMessage: string }
  | {
      readonly kind: 'loaded'
      readonly filters: AdminAuditLogFilters
      readonly events: readonly AdminAuditLogEvent[]
      readonly hasMore: boolean
    }

export interface UseAdminAuditLogResult {
  readonly state: AdminAuditLogState
  /** A filter problem found before searching (nothing was read). */
  readonly filterErrorMessage: string | null
  readonly isLoadingOlder: boolean
  readonly search: (filterInput: AdminAuditLogFilterInput) => Promise<void>
  readonly loadOlder: () => Promise<void>
  /** Repeats the last search (a new audited search). */
  readonly retry: () => Promise<void>
}

const searchFailedMessage = 'Could not search the audit log.'

/**
 * Super_admin audit log. Every search is audited by the database, so nothing is read until the
 * administrator searches, and paging reads only the next older page.
 */
export function useAdminAuditLog(adminOversightService: AdminOversightService): UseAdminAuditLogResult {
  const [state, setState] = useState<AdminAuditLogState>({ kind: 'idle' })
  const [filterErrorMessage, setFilterErrorMessage] = useState<string | null>(null)
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false)
  const lastFilterInputRef = useRef<AdminAuditLogFilterInput>(emptyAdminAuditLogFilterInput)

  const search = useCallback(
    async (filterInput: AdminAuditLogFilterInput): Promise<void> => {
      lastFilterInputRef.current = filterInput
      let filters: AdminAuditLogFilters
      try {
        filters = adminOversightService.toAuditLogFilters(filterInput)
      } catch (filterError) {
        setFilterErrorMessage(toDisplayErrorMessage(filterError, 'Check the filters.'))
        return
      }
      setFilterErrorMessage(null)
      setState({ kind: 'loading' })
      try {
        const page = await adminOversightService.searchAuditLog(filters, null)
        setState({ kind: 'loaded', filters, events: page.events, hasMore: page.hasMore })
      } catch (searchError) {
        setState({ kind: 'error', errorMessage: toDisplayErrorMessage(searchError, searchFailedMessage) })
      }
    },
    [adminOversightService],
  )

  const loadOlder = useCallback(async (): Promise<void> => {
    if (state.kind !== 'loaded' || isLoadingOlder) {
      return
    }
    const oldestEvent = state.events.at(-1)
    if (oldestEvent === undefined) {
      return
    }
    setIsLoadingOlder(true)
    try {
      const page = await adminOversightService.searchAuditLog(state.filters, oldestEvent.eventId)
      setState({ kind: 'loaded', filters: state.filters, events: [...state.events, ...page.events], hasMore: page.hasMore })
    } catch (searchError) {
      setState({ kind: 'error', errorMessage: toDisplayErrorMessage(searchError, searchFailedMessage) })
    } finally {
      setIsLoadingOlder(false)
    }
  }, [adminOversightService, isLoadingOlder, state])

  const retry = useCallback(async (): Promise<void> => search(lastFilterInputRef.current), [search])

  return { state, filterErrorMessage, isLoadingOlder, search, loadOlder, retry }
}
