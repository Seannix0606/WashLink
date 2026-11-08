import { useRouter } from 'expo-router'
import { useState, type ReactElement } from 'react'
import { supabase } from '../src/lib/api'
import { featureFlags } from '../src/lib/featureFlags'
import { Body, Button, Choice, Field, Notice, Screen, Title } from '../src/ui'

export default function SignUp(): ReactElement {
  const router = useRouter()
  const [role, setRole] = useState<'customer' | 'worker'>('customer')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const create = async (): Promise<void> => {
    if (fullName.trim().length < 2 || phone.trim().length < 7 || !email.includes('@') || password.length < 8) {
      setError('Enter your name, phone number and email, and a password of at least 8 characters.')
      return
    }
    setIsBusy(true)
    setError(null)
    // The role here is only a request. The database accepts customer or worker and never an admin role, and while washer
    // sign-up is closed it turns a worker request into a customer.
    const result = await supabase.auth.signUp({
      email: email.trim(), password, options: { data: { role, full_name: fullName.trim(), phone_number: phone.trim() } },
    })
    setIsBusy(false)
    if (result.error) {
      setError('This account could not be created. The email may already be in use.')
    } else if (result.data.session) {
      router.replace('/')
    } else {
      setNotice('Check your email to confirm your account, then sign in.')
    }
  }

  return (
    <Screen>
      <Title>Create your account</Title>
      {featureFlags.isWasherSignUpEnabled ? (
        <>
          <Body>How will you use WashLink?</Body>
          <Choice label="Book car washes" isSelected={role === 'customer'} onPress={(): void => { setRole('customer') }} />
          <Choice label="Work as a washer" detail="WashLink reviews each washer before their first booking." isSelected={role === 'worker'} onPress={(): void => { setRole('worker') }} />
        </>
      ) : (
        <Body>Book a professional car wash at your home, office or parking spot.</Body>
      )}
      <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" />
      <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
      <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
      <Field label="Password" helper="At least 8 characters." value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Notice tone="error" message={error} />
      <Notice message={notice} />
      <Button label="Create account" isLoading={isBusy} onPress={(): void => void create()} />
      <Button label="I already have an account" variant="ghost" onPress={(): void => { router.replace('/sign-in') }} />
    </Screen>
  )
}
