import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useId, useState } from 'react'
import { AppState } from 'react-native'
import type { AssignedBooking, DispatchRequest, WorkerAccount, WorkerSummary } from '@washlink/shared'
import { api, errorMessage, supabase } from '../../lib/api'

interface WorkerData {
  readonly account: WorkerAccount | null | undefined
  readonly requests: readonly DispatchRequest[]
  readonly jobs: readonly AssignedBooking[]
  readonly summary: WorkerSummary | null
  readonly error: string | null
  readonly isRefreshing: boolean
  readonly refresh: () => Promise<void>
}

export function useWorkerData(workerId: string): WorkerData {
  const [account, setAccount] = useState<WorkerAccount | null | undefined>(undefined)
  const [requests, setRequests] = useState<readonly DispatchRequest[]>([])
  const [jobs, setJobs] = useState<readonly AssignedBooking[]>([])
  const [summary, setSummary] = useState<WorkerSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Each mounted tab needs its own channel: the client refuses a second subscription to the same name.
  const channelSuffix = useId()

  const refresh = useCallback(async (): Promise<void> => {
    setIsRefreshing(true)
    try {
      const nextAccount = await api.workerAccount(workerId)
      setAccount(nextAccount)
      if (nextAccount !== null) {
        const [nextRequests, nextJobs, nextSummary] = await Promise.all([api.dispatchRequests(), api.assignedBookings(), api.workerSummary()])
        setRequests(nextRequests)
        setJobs(nextJobs)
        setSummary(nextSummary)
      }
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsRefreshing(false)
    }
  }, [workerId])

  useFocusEffect(useCallback(() => { void refresh() }, [refresh]))

  useEffect(() => {
    const poll = setInterval(() => void refresh(), 20000)
    const channel = supabase
      .channel(`mobile-worker-${workerId}-${channelSuffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_requests', filter: `worker_id=eq.${workerId}` }, () => void refresh())
      .subscribe()
    return (): void => {
      clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [workerId, refresh, channelSuffix])

  // Heartbeats only run while the app is open, so a closed app soon stops receiving as-soon-as-possible requests.
  const isOnline = account?.isOnline === true
  useEffect(() => {
    if (!isOnline) {
      return
    }
    const beat = setInterval(() => {
      if (AppState.currentState === 'active') {
        api.heartbeat().catch(() => undefined)
      }
    }, 60000)
    return (): void => { clearInterval(beat) }
  }, [isOnline])

  return { account, requests, jobs, summary, error, isRefreshing, refresh }
}
