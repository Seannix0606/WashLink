import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RosterLinkService } from '../../application/services/RosterLinkService'
import type { RosterLinkEntry } from '../../domain/models/RosterLink'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

const loadFailedMessage = 'Could not load your shop rosters.'

export interface UseMyRosterLinksResult {
  readonly rosterLinkEntries: readonly RosterLinkEntry[]
  /** The entry whose bookings are shown; the first entry unless the worker picks another. */
  readonly selectedRosterEntry: RosterLinkEntry | null
  readonly isLoadingRosterLinks: boolean
  readonly rosterLinksErrorMessage: string | null
  readonly unlinkingWorkerRowIdentifier: string | null
  readonly selectRosterEntry: (workerRowIdentifier: string) => void
  readonly reloadRosterLinks: () => Promise<void>
  readonly unlinkRosterEntry: (workerRowIdentifier: string) => Promise<boolean>
}

export function useMyRosterLinks(
  rosterLinkService: RosterLinkService,
): UseMyRosterLinksResult {
  const [rosterLinkEntries, setRosterLinkEntries] = useState<readonly RosterLinkEntry[]>(
    [],
  )
  const [selectedWorkerRowIdentifier, setSelectedWorkerRowIdentifier] = useState<
    string | null
  >(null)
  const [isLoadingRosterLinks, setIsLoadingRosterLinks] = useState<boolean>(true)
  const [rosterLinksErrorMessage, setRosterLinksErrorMessage] = useState<string | null>(
    null,
  )
  const [unlinkingWorkerRowIdentifier, setUnlinkingWorkerRowIdentifier] = useState<
    string | null
  >(null)

  const reloadRosterLinks = useCallback(async (): Promise<void> => {
    setIsLoadingRosterLinks(true)
    setRosterLinksErrorMessage(null)
    try {
      setRosterLinkEntries(await rosterLinkService.listMyRosterLinks())
    } catch (loadError) {
      setRosterLinksErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
    } finally {
      setIsLoadingRosterLinks(false)
    }
  }, [rosterLinkService])

  useEffect(() => {
    let isHookMounted = true
    const loadInitialRosterLinks = async (): Promise<void> => {
      try {
        const loadedRosterLinkEntries = await rosterLinkService.listMyRosterLinks()
        if (isHookMounted) {
          setRosterLinkEntries(loadedRosterLinkEntries)
        }
      } catch (loadError) {
        if (isHookMounted) {
          setRosterLinksErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
        }
      } finally {
        if (isHookMounted) {
          setIsLoadingRosterLinks(false)
        }
      }
    }
    void loadInitialRosterLinks()
    return (): void => {
      isHookMounted = false
    }
  }, [rosterLinkService])

  const selectedRosterEntry = useMemo<RosterLinkEntry | null>(
    () =>
      rosterLinkEntries.find(
        (rosterLinkEntry) =>
          rosterLinkEntry.workerRowIdentifier === selectedWorkerRowIdentifier,
      ) ??
      rosterLinkEntries.at(0) ??
      null,
    [rosterLinkEntries, selectedWorkerRowIdentifier],
  )

  const unlinkRosterEntry = useCallback(
    async (workerRowIdentifier: string): Promise<boolean> => {
      setUnlinkingWorkerRowIdentifier(workerRowIdentifier)
      const didUnlink = await runServiceActionWithToast(
        async () => {
          await rosterLinkService.unlinkMyRosterEntry(workerRowIdentifier)
          return true
        },
        {
          successMessage: 'Your account is no longer linked to this shop roster.',
          fallbackErrorMessage: 'Could not unlink this shop roster.',
        },
      )
      setUnlinkingWorkerRowIdentifier(null)
      if (didUnlink === null) {
        return false
      }
      setRosterLinkEntries((previousEntries) =>
        previousEntries.filter(
          (rosterLinkEntry) => rosterLinkEntry.workerRowIdentifier !== workerRowIdentifier,
        ),
      )
      return true
    },
    [rosterLinkService],
  )

  return {
    rosterLinkEntries,
    selectedRosterEntry,
    isLoadingRosterLinks,
    rosterLinksErrorMessage,
    unlinkingWorkerRowIdentifier,
    selectRosterEntry: setSelectedWorkerRowIdentifier,
    reloadRosterLinks,
    unlinkRosterEntry,
  }
}
