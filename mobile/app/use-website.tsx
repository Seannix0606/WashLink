import type { ReactElement } from 'react'
import { useAuth } from '../src/lib/AuthProvider'
import { Body, Button, Screen, Title } from '../src/ui'

/** The mobile app is for customers and washers. Admin and shop accounts use the website. */
export default function UseWebsite(): ReactElement {
  const { signOut } = useAuth()
  return (
    <Screen>
      <Title>Use the website</Title>
      <Body>This account is managed on the WashLink website. The app is for customers and washers.</Body>
      <Button label="Sign out" variant="secondary" onPress={(): void => void signOut()} />
    </Screen>
  )
}
