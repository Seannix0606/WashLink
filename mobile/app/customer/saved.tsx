import { useFocusEffect } from 'expo-router'
import { useCallback, useState, type ReactElement } from 'react'
import { vehicleCategoryLabel, type SavedAddress, type SavedVehicle } from '@washlink/shared'
import { api, errorMessage } from '../../src/lib/api'
import { Body, Button, Card, Heading, Notice, Screen, Title } from '../../src/ui'

/** Saved items are added during booking, where the pin and vehicle are confirmed. */
export default function Saved(): ReactElement {
  const [addresses, setAddresses] = useState<readonly SavedAddress[]>([])
  const [vehicles, setVehicles] = useState<readonly SavedVehicle[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextAddresses, nextVehicles] = await Promise.all([api.listAddresses(), api.listVehicles()])
      setAddresses(nextAddresses)
      setVehicles(nextVehicles)
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [])
  useFocusEffect(useCallback(() => { void refresh() }, [refresh]))

  const remove = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action()
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <Screen>
      <Title>Saved</Title>
      <Notice tone="error" message={error} />
      <Heading>Vehicles</Heading>
      {vehicles.length === 0 ? <Body muted>Choose Save this vehicle while booking.</Body> : null}
      {vehicles.map((vehicle) => (
        <Card key={vehicle.id}>
          <Body>{vehicle.make} {vehicle.model}, {vehicleCategoryLabel[vehicle.category]}</Body>
          <Button label={`Remove ${vehicle.make} ${vehicle.model}`} variant="ghost" onPress={(): void => void remove(() => api.deleteVehicle(vehicle.id))} />
        </Card>
      ))}
      <Heading>Addresses</Heading>
      {addresses.length === 0 ? <Body muted>Choose Save this address while booking.</Body> : null}
      {addresses.map((address) => (
        <Card key={address.id}>
          <Body>{address.label}: {address.address}</Body>
          <Button label={`Remove ${address.label}`} variant="ghost" onPress={(): void => void remove(() => api.deleteAddress(address.id))} />
        </Card>
      ))}
    </Screen>
  )
}
