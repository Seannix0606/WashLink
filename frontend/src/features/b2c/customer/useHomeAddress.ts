import { useCallback, useEffect, useState } from 'react'
import {
  clearedHomeLocationSignUpData,
  findHomeAddress,
  HOME_ADDRESS_LABEL,
  homeLocationFromSignUpData,
  type HomeLocation,
  type SavedAddress,
} from '@washlink/shared'
import { getSupabaseClient } from '../../../infrastructure/supabase/supabaseClient'
import { getB2cApi } from '../b2cApiClient'

// One save per customer per page load, even when React runs effects twice.
const pendingSignUpSaves = new Map<string, Promise<void>>()

/**
 * The location chosen at sign-up is kept with the account until the customer first signs in, because with email
 * confirmation there is no session at sign-up. Here it becomes their Home address, and the sign-up copy is cleared so
 * deleting Home later doesn't bring it back. A customer who already has a Home address keeps it.
 */
export function saveHomeFromSignUp(customerId: string): Promise<void> {
  const pending = pendingSignUpSaves.get(customerId)
  if (pending !== undefined) {
    return pending
  }
  const run = (async (): Promise<void> => {
    const client = getSupabaseClient()
    const { data } = await client.auth.getUser()
    const fromSignUp = homeLocationFromSignUpData(data.user?.user_metadata)
    if (data.user?.id !== customerId || fromSignUp === null) {
      return
    }
    const api = getB2cApi()
    if (findHomeAddress(await api.listAddresses()) === null) {
      await api.saveAddress(customerId, { label: HOME_ADDRESS_LABEL, ...fromSignUp, landmark: '', instructions: '' })
    }
    await client.auth.updateUser({ data: clearedHomeLocationSignUpData })
  })()
  pendingSignUpSaves.set(customerId, run)
  // A failure can be retried on the next page load.
  run.catch(() => { pendingSignUpSaves.delete(customerId) })
  return run
}

interface HomeAddressState {
  /** undefined while loading, null when the customer has no Home address. */
  readonly home: SavedAddress | null | undefined
  readonly error: string | null
  readonly saveHome: (location: HomeLocation) => Promise<void>
}

export function useHomeAddress(customerId: string): HomeAddressState {
  const [home, setHome] = useState<SavedAddress | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    saveHomeFromSignUp(customerId).catch(() => undefined)
      .then(async () => getB2cApi().listAddresses())
      .then((addresses) => { if (isCurrent) setHome(findHomeAddress(addresses)) })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setHome(null)
          setError(caught instanceof Error ? caught.message : 'Your home location could not be loaded.')
        }
      })
    return (): void => { isCurrent = false }
  }, [customerId])

  const saveHome = useCallback(async (location: HomeLocation): Promise<void> => {
    const api = getB2cApi()
    const current = findHomeAddress(await api.listAddresses())
    if (current === null) {
      await api.saveAddress(customerId, { label: HOME_ADDRESS_LABEL, ...location, landmark: '', instructions: '' })
    } else {
      await api.updateAddress(current.id, location)
    }
    setError(null)
    setHome(findHomeAddress(await api.listAddresses()))
  }, [customerId])

  return { home, error, saveHome }
}
