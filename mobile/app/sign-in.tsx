import { Link, Redirect } from 'expo-router'
import { useState, type ReactElement } from 'react'
import { supabase } from '../src/lib/api'
import { useAuth } from '../src/lib/AuthProvider'
import { Body, Button, Field, Notice, Screen, Title } from '../src/ui'

export default function SignIn(): ReactElement {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (session !== null) {
    return <Redirect href="/" />
  }

  const signIn = async (): Promise<void> => {
    setIsBusy(true)
    setError(null)
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (result.error) {
      setError('That email and password did not match. Check them and try again.')
    }
    setIsBusy(false)
  }

  const resetPassword = async (): Promise<void> => {
    if (email.trim() === '') {
      setError('Enter your email first, then choose Forgot password.')
      return
    }
    setError(null)
    await supabase.auth.resetPasswordForEmail(email.trim())
    setNotice('If that email has an account, a reset link is on its way. It opens on the WashLink website.')
  }

  return (
    <Screen>
      <Title>Welcome back</Title>
      <Body>Sign in to book a wash or manage your work.</Body>
      <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" />
      <Notice tone="error" message={error} />
      <Notice message={notice} />
      <Button label="Sign in" isLoading={isBusy} isDisabled={email.trim() === '' || password === ''} onPress={(): void => void signIn()} />
      <Button label="Forgot password?" variant="ghost" onPress={(): void => void resetPassword()} />
      <Link href="/sign-up" asChild><Button label="Create an account" variant="secondary" onPress={(): void => undefined} /></Link>
    </Screen>
  )
}
