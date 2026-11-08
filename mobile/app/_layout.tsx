import NetInfo from '@react-native-community/netinfo'
import * as Notifications from 'expo-notifications'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState, type ReactElement } from 'react'
import { Platform, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '../src/lib/AuthProvider'
import { isConfigured } from '../src/lib/api'
import { registerPush, routeFromNotification } from '../src/push/pushNotifications'
import { colors } from '../src/ui'

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: () => Promise.resolve({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  })
}

function OfflineBanner(): ReactElement | null {
  const [isOffline, setIsOffline] = useState(false)
  useEffect(() => NetInfo.addEventListener((state) => { setIsOffline(state.isConnected === false) }), [])
  if (!isOffline) {
    return null
  }
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.warning600, padding: 8, paddingTop: 44 }}>
      <Text style={{ color: '#ffffff', textAlign: 'center' }}>You are offline. Nothing can be booked or updated until you reconnect.</Text>
    </View>
  )
}

function PushSetup(): null {
  const { session } = useAuth()
  const router = useRouter()
  const userId = session?.user.id ?? null

  useEffect(() => {
    if (userId !== null) {
      // A refused permission or missing setup only means no push; the app still works and refreshes itself.
      void registerPush().catch(() => undefined)
    }
  }, [userId])

  useEffect(() => {
    if (Platform.OS === 'web') {
      return
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeFromNotification(response.notification.request.content.data)
      if (route !== null) {
        router.push(route)
      }
    })
    return (): void => { subscription.remove() }
  }, [router])
  return null
}

export default function RootLayout(): ReactElement {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <OfflineBanner />
        <PushSetup />
        {isConfigured ? null : (
          <Text style={{ padding: 16, paddingTop: 48, color: colors.danger600 }}>This build is missing its server settings. See mobile/README.md.</Text>
        )}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="book" options={{ presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
