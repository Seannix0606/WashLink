import { Ionicons } from '@expo/vector-icons'
import { Redirect, Tabs } from 'expo-router'
import type { ReactElement } from 'react'
import { useAuth, type AccountRole } from '../lib/AuthProvider'
import { colors } from '../ui'

interface TabDefinition {
  readonly name: string
  readonly title: string
  readonly icon: keyof typeof Ionicons.glyphMap
}

/** Navigation only: what each account may read or change is enforced by the database. */
export function RoleTabs({ role, tabs }: { readonly role: AccountRole; readonly tabs: readonly TabDefinition[] }): ReactElement {
  const auth = useAuth()
  if (!auth.isLoading && auth.role !== role) {
    return <Redirect href="/" />
  }
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brand700, tabBarInactiveTintColor: colors.ink500 }}>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.title, tabBarIcon: ({ color, size }): ReactElement => <Ionicons name={tab.icon} color={color as string} size={size} /> }}
        />
      ))}
    </Tabs>
  )
}
