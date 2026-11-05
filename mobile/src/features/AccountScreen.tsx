import { useState, type ReactElement } from 'react'
import { api, errorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/AuthProvider'
import { Body, Button, Card, Field, Heading, Notice, Screen, Title } from '../ui'

export function AccountScreen(): ReactElement {
  const { fullName, session, signOut } = useAuth()
  const [isDeleting, setIsDeleting] = useState(false)
  const [password, setPassword] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The sign-in below is also what the database checks: delete_my_account needs a password sign-in from the last 5 minutes, and
  // this client carries that fresh token into the call. The database still decides whether the account may be deleted.
  const deleteAccount = async (): Promise<void> => {
    setIsBusy(true)
    setError(null)
    try {
      const signIn = await supabase.auth.signInWithPassword({ email: session?.user.email ?? '', password })
      if (signIn.error) {
        setError('That password is not correct. Check it and try again.')
        return
      }
      // Device tokens go with the profile on the server, so a refused deletion leaves push working.
      await api.deleteMyAccount()
      await supabase.auth.signOut({ scope: 'local' })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Screen>
      <Title>Account</Title>
      <Card>
        <Heading>{fullName || 'Your account'}</Heading>
        <Body muted>{session?.user.email}</Body>
      </Card>
      <Button label="Sign out" variant="secondary" onPress={(): void => void signOut()} />
      <Card>
        <Heading>Delete account</Heading>
        <Body>
          This permanently removes your sign-in, profile, saved addresses and vehicles. WashLink keeps a record of past bookings
          (price, status, date and vehicle type) and any rating you gave, without your name, location or vehicle details. Its audit log keeps your internal account ID. This can&apos;t be undone.
        </Body>
        <Body>
          You can&apos;t delete the account here if it has shop booking history or shop workforce records. Only WashLink can close these accounts.
        </Body>
        {isDeleting ? (
          <>
            <Field label="Enter your password to confirm" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
            <Notice tone="error" message={error} />
            <Button label="Permanently delete my account" variant="danger" isLoading={isBusy} isDisabled={password === ''} onPress={(): void => void deleteAccount()} />
            <Button label="Keep my account" variant="ghost" onPress={(): void => { setIsDeleting(false); setPassword(''); setError(null) }} />
          </>
        ) : (
          <Button label="Delete account" variant="secondary" onPress={(): void => { setIsDeleting(true) }} />
        )}
      </Card>
    </Screen>
  )
}
