import type { ReactElement } from 'react'
import { useAuth } from '../lib/AuthProvider'
import { Body, Button, Card, Heading, Screen, Title } from '../ui'

export function AccountScreen(): ReactElement {
  const { fullName, session, signOut } = useAuth()
  return (
    <Screen>
      <Title>Account</Title>
      <Card>
        <Heading>{fullName || 'Your account'}</Heading>
        <Body muted>{session?.user.email}</Body>
      </Card>
      <Button label="Sign out" variant="secondary" onPress={(): void => void signOut()} />
    </Screen>
  )
}
