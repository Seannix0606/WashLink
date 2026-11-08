import type { ReactElement } from 'react'
import { StyleSheet, View } from 'react-native'
import MapView, { Marker, type LatLng } from 'react-native-maps'

interface PinMapProps {
  readonly latitude: number | null
  readonly longitude: number | null
  readonly onPick?: (latitude: number, longitude: number) => void
  readonly height?: number
}

const metroManila = { latitude: 14.5995, longitude: 120.9842 }

/** Uses Apple Maps on iPhone and Google Maps on Android (the Android key comes from the build settings). */
export function PinMap({ latitude, longitude, onPick, height = 260 }: PinMapProps): ReactElement {
  const pin: LatLng | null = latitude !== null && longitude !== null ? { latitude, longitude } : null
  return (
    <View style={[styles.frame, { height }]}>
      <MapView
        accessibilityLabel={onPick ? 'Map. Tap to place the pin, then drag it to the exact spot.' : 'Map showing the pinned location.'}
        style={StyleSheet.absoluteFill}
        region={{ ...(pin ?? metroManila), latitudeDelta: pin ? 0.01 : 0.12, longitudeDelta: pin ? 0.01 : 0.12 }}
        onPress={onPick ? (event): void => { onPick(event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude) } : undefined}
        scrollEnabled={onPick !== undefined}
        zoomEnabled={onPick !== undefined}
      >
        {pin ? (
          <Marker
            coordinate={pin}
            draggable={onPick !== undefined}
            onDragEnd={onPick ? (event): void => { onPick(event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude) } : undefined}
          />
        ) : null}
      </MapView>
    </View>
  )
}

const styles = StyleSheet.create({ frame: { borderRadius: 16, overflow: 'hidden' } })
