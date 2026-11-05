import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import { Button, colors } from './index'

interface PinMapProps {
  readonly latitude: number | null
  readonly longitude: number | null
  readonly onPick?: (latitude: number, longitude: number) => void
  readonly height?: number
}

/** Browser preview only: native maps don't run in a browser, so this stands in with a fixed test pin. */
export function PinMap({ latitude, longitude, onPick, height = 160 }: PinMapProps): ReactElement {
  return (
    <View style={{ height, gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.ink200, justifyContent: 'center' }}>
      <Text style={{ color: colors.ink700 }}>
        {latitude !== null && longitude !== null ? `Pin: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : 'Map preview (native map on phones)'}
      </Text>
      {onPick ? <Button label="Drop test pin" variant="secondary" onPress={(): void => { onPick(14.6, 120.9844) }} /> : null}
    </View>
  )
}
