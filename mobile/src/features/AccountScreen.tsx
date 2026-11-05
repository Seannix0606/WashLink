import { useState, type ReactElement } from 'react'
import { api, errorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/AuthProvider'
import { unregisterPush } from '../push/pushNotifications'
import { Body, Button, Card, Field, Heading, Notice, Screen, Title } from '../ui'

export function AccountScreen(): ReactElement {
  const { fullName, session, signOut } = useAuth()
  const [isDeleting, setIsDeleting] = useState(false)
  const [password, setPassword] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The password check guards an unlocked phone. The database still decides whether the account may be deleted.
  const deleteAccount = async (): Promise<void> => {
    setIsBusy(true)
    setError(null)
    try {
      const signIn = await supabase.auth.signInWithPassword({ email: session?.user.email ?? '', password })
      if (signIn.error) {
        setError('That password is not correct. Check it and try again.')
        return
      }
      // Tokens must go first: this needs the account to still exist. If deletion is then refused, the app registers again on next launch.
      await unregisterPush()
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
          This permanently removes your sign-in, profile, saved addresses and vehicles. WashLink keeps an anonymous record of past bookings
          (price, status and date), without your name, location or vehicle. This can&apos;t be undone.
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
