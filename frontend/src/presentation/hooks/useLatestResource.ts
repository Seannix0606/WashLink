import { useCallback, useEffect, useRef, useState } from 'react'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'
import { usePollWhileVisible } from './usePollWhileVisible'

export interface UseLatestResourceResult<Resource> {
  readonly resource: Resource
  readonly isLoading: boolean
  readonly errorMessage: string | null
  /** Shows the loading state again, then loads. */
  readonly reload: () => Promise<void>
  /** Re-reads without the loading state (after an action, on poll and on focus). */
  readonly refresh: () => Promise<void>
}

interface UseLatestResourceOptions<Resource> {
  readonly load: () => Promise<Resource>
  readonly initialResource: Resource
  readonly loadFailedMessage: string
  /** Poll every 60 s while visible and on focus (workforce lists are not on Realtime). */
  readonly isPolling?: boolean
}

/**
 * Loads a resource once per `load` identity. Only the latest request may update state,
 * so a slow, older response never overwrites a newer one.
 */
export function useLatestResource<Resource>({
  load,
  initialResource,
  loadFailedMessage,
  isPolling = false,
}: UseLatestResourceOptions<Resource>): UseLatestResourceResult<Resource> {
  const [resource, setResource] = useState<Resource>(initialResource)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const latestRequestNumberRef = useRef<number>(0)
  const isHookMountedRef = useRef<boolean>(true)

  const refresh = useCallback(async (): Promise<void> => {
    latestRequestNumberRef.current += 1
    const requestNumber = latestRequestNumberRef.current
    const isLatestRequest = (): boolean =>
      isHookMountedRef.current && requestNumber === latestRequestNumberRef.current
    try {
      const loadedResource = await load()
      if (isLatestRequest()) {
        setResource(loadedResource)
        setErrorMessage(null)
      }
    } catch (loadError) {
      if (isLatestRequest()) {
        setErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
      }
    } finally {
      if (isLatestRequest()) {
        setIsLoading(false)
      }
    }
  }, [load, loadFailedMessage])

  useEffect(() => {
    isHookMountedRef.current = true
    void refresh()
    return (): void => {
      isHookMountedRef.current = false
    }
  }, [refresh])

  const refreshInBackground = useCallback((): void => {
    void refresh()
  }, [refresh])
  usePollWhileVisible(refreshInBackground, isPolling)

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setErrorMessage(null)
    await refresh()
  }, [refresh])

  return { resource, isLoading, errorMessage, reload, refresh }
}
