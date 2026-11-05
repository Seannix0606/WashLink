import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { supabase } from './api'
import { unregisterPush } from '../push/pushNotifications'

export type AccountRole = 'customer' | 'worker' | 'owner' | 'super_admin'

interface AuthValue {
  readonly isLoading: boolean
  readonly session: Session | null
  readonly role: AccountRole | null
  readonly fullName: string
  readonly profileError: boolean
  readonly reloadProfile: () => void
  readonly signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [role, setRole] = useState<AccountRole | null>(null)
  const [fullName, setFullName] = useState('')
  const [profileError, setProfileError] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)
  const userId = session?.user.id ?? null

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsSessionLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next) })
    return (): void => { data.subscription.unsubscribe() }
  }, [])

  // The role always comes from the database, never from what the app was told at sign-up.
  useEffect(() => {
    if (userId === null) {
      setRole(null)
      setFullName('')
      return
    }
    let isCurrent = true
    setProfileError(false)
    void supabase.from('profiles').select('role, full_name').eq('id', userId).maybeSingle().then(({ data, error }) => {
      if (!isCurrent) {
        return
      }
      if (error || !data) {
        setProfileError(true)
        return
      }
      setRole(data.role as AccountRole)
      setFullName(String(data.full_name ?? ''))
    })
    return (): void => { isCurrent = false }
  }, [userId, reloadCount])

  const signOut = useCallback(async (): Promise<void> => {
    await unregisterPush()
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthValue>(() => ({
    isLoading: isSessionLoading || (userId !== null && role === null && !profileError),
    session, role, fullName, profileError, signOut,
    reloadProfile: (): void => { setReloadCount((count) => count + 1) },
  }), [isSessionLoading, userId, role, profileError, session, fullName, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error('useAuth needs AuthProvider')
  }
  return value
}

export function useUserId(): string {
  return useAuth().session?.user.id ?? ''
}
