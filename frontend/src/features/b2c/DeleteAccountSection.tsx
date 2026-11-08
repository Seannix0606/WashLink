import type { ReactElement } from 'react'
import { useState } from 'react'
import { getSupabaseClient } from '../../infrastructure/supabase/supabaseClient'
import { Button, Card, Input } from '../../presentation/design/ui'
import { errorMessage, getB2cApi } from './b2cApiClient'

/**
 * The sign-in below is also what the database checks: delete_my_account needs a password sign-in from the last 5 minutes, and
 * this client carries that fresh token into the call. The database still decides whether the account may be deleted.
 */
export function DeleteAccountSection(): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deleteAccount = async (): Promise<void> => {
    setIsBusy(true)
    setError(null)
    try {
      const client = getSupabaseClient()
      const { data } = await client.auth.getSession()
      const signIn = await client.auth.signInWithPassword({ email: data.session?.user.email ?? '', password })
      if (signIn.error) {
        setError('That password is not correct. Check it and try again.')
        return
      }
      await getB2cApi().deleteMyAccount()
      // The account is gone, so only this device's session needs clearing.
      await client.auth.signOut({ scope: 'local' })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold text-[var(--color-ink-900)]">Delete account</h2>
      <p className="text-sm text-[var(--color-ink-700)]">
        This permanently removes your sign-in, profile, saved addresses and vehicles. WashLink keeps a record of past bookings
        (price, status, date and vehicle type) and any rating you gave, without your name, location or vehicle details. Its audit log keeps your internal account ID. This can&apos;t be undone.
      </p>
      <p className="text-sm text-[var(--color-ink-700)]">
        If you uploaded washer verification photos, they are queued for permanent removal from file storage. This doesn&apos;t happen instantly: they stay in private storage until WashLink runs its removal job, which has no fixed date yet.
      </p>
      <p className="text-sm text-[var(--color-ink-700)]">
        You can&apos;t delete the account here if it has shop booking history or shop workforce records. Only WashLink can close these accounts.
      </p>
      {isOpen ? (
        <>
          <Input label="Enter your password to confirm" type="password" autoComplete="current-password" value={password}
            onChange={(event): void => { setPassword(event.target.value) }} />
          {error !== null ? <p role="alert" className="text-sm text-[var(--color-danger-600)]">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" isLoading={isBusy} disabled={password === ''} onClick={(): void => void deleteAccount()}>Permanently delete my account</Button>
            <Button variant="ghost" onClick={(): void => { setIsOpen(false); setPassword(''); setError(null) }}>Keep my account</Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" onClick={(): void => { setIsOpen(true) }}>Delete account</Button>
      )}
    </Card>
  )
}
