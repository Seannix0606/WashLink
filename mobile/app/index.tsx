import { Redirect } from 'expo-router'
import type { ReactElement } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../src/lib/AuthProvider'
import { Body, Button, colors, Screen } from '../src/ui'

export default function Index(): ReactElement {
  const { isLoading, session, role, profileError, reloadProfile, signOut } = useAuth()
  if (isLoading) {
    return (
      <View accessibilityLabel="Loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.brand700} />
      </View>
    )
  }
  if (session === null) {
    return <Redirect href="/sign-in" />
  }
  if (profileError) {
    return (
      <Screen>
        <Body>Your account could not be loaded. Check your connection and try again.</Body>
        <Button label="Try again" onPress={reloadProfile} />
        <Button label="Sign out" variant="ghost" onPress={(): void => void signOut()} />
      </Screen>
    )
  }
  if (role === 'worker') {
    return <Redirect href="/worker" />
  }
  if (role === 'customer') {
    return <Redirect href="/customer" />
  }
  return <Redirect href="/use-website" />
}
