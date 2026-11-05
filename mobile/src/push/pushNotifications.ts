import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { api } from '../lib/api'

let registeredToken: string | null = null

/** Only these screens can be opened from a notification, whatever its payload says. */
const allowedRoutes = ['/', '/customer/bookings', '/worker'] as const

export function routeFromNotification(data: unknown): (typeof allowedRoutes)[number] | null {
  const route = (data as { route?: unknown } | null)?.route
  return allowedRoutes.find((candidate) => candidate === route) ?? null
}

export type PushResult = 'registered' | 'denied' | 'unavailable'

/** Not yet proven on a real device: see docs/b2c/OPERATIONS.md. Sign-in still works if this returns anything but registered. */
export async function registerPush(): Promise<PushResult> {
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId
  if (Platform.OS === 'web' || !Device.isDevice || !projectId) {
    return 'unavailable'
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('bookings', { name: 'Bookings', importance: Notifications.AndroidImportance.HIGH })
  }
  const current = await Notifications.getPermissionsAsync()
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync()
  if (!permission.granted) {
    return 'denied'
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
  await api.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android')
  registeredToken = token
  return 'registered'
}

/** So a shared phone stops receiving this account's notifications after sign-out. */
export async function unregisterPush(): Promise<void> {
  if (registeredToken !== null) {
    await api.removePushToken(registeredToken).catch(() => undefined)
    registeredToken = null
  }
}
