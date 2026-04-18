import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export interface PickedLocationValue {
  readonly latitude: number
  readonly longitude: number
}

interface LocationPickerMapProps {
  readonly pickedLocation: PickedLocationValue | null
  readonly onPickedLocationChanged: (next: PickedLocationValue) => void
  readonly fallbackCenter?: PickedLocationValue
  readonly zoomLevel?: number
  readonly heightClassName?: string
  readonly helperOverlayText?: string
}

const defaultFallbackCenter: PickedLocationValue = {
  latitude: 14.5995,
  longitude: 120.9842,
}

const customPinDivIcon = L.divIcon({
  className: 'wl-map-pin',
  html: `
    <span class="wl-map-pin__inner">
      <span class="wl-map-pin__dot"></span>
    </span>
  `,
  iconSize: [32, 40],
  iconAnchor: [16, 36],
})

export function LocationPickerMap({
  pickedLocation,
  onPickedLocationChanged,
  fallbackCenter = defaultFallbackCenter,
  zoomLevel = 14,
  heightClassName = 'h-64 sm:h-80',
  helperOverlayText = 'Tap the map to drop a pin',
}: LocationPickerMapProps): ReactElement {
  const mapCenterLatitude = pickedLocation?.latitude ?? fallbackCenter.latitude
  const mapCenterLongitude =
    pickedLocation?.longitude ?? fallbackCenter.longitude

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] ${heightClassName}`}
    >
      <MapContainer
        center={[mapCenterLatitude, mapCenterLongitude]}
        zoom={zoomLevel}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler
          onCoordinatesSelected={(latitude, longitude) =>
            onPickedLocationChanged({ latitude, longitude })
          }
        />
        <MapCenterSynchronizer
          latitude={pickedLocation?.latitude ?? null}
          longitude={pickedLocation?.longitude ?? null}
        />
        {pickedLocation ? (
          <Marker
            position={[pickedLocation.latitude, pickedLocation.longitude]}
            icon={customPinDivIcon}
            draggable
            eventHandlers={{
              dragend: (dragEvent) => {
                const nextLatLng = dragEvent.target.getLatLng()
                onPickedLocationChanged({
                  latitude: nextLatLng.lat,
                  longitude: nextLatLng.lng,
                })
              },
            }}
          />
        ) : null}
      </MapContainer>
      {helperOverlayText ? (
        <div className="pointer-events-none absolute left-3 top-3 z-[400] rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-[var(--color-ink-700)] shadow-[var(--shadow-card)] backdrop-blur">
          {helperOverlayText}
        </div>
      ) : null}
    </div>
  )
}

interface MapClickHandlerProps {
  readonly onCoordinatesSelected: (latitude: number, longitude: number) => void
}

function MapClickHandler({
  onCoordinatesSelected,
}: MapClickHandlerProps): null {
  useMapEvents({
    click: (mapMouseEvent) => {
      onCoordinatesSelected(mapMouseEvent.latlng.lat, mapMouseEvent.latlng.lng)
    },
  })
  return null
}

interface MapCenterSynchronizerProps {
  readonly latitude: number | null
  readonly longitude: number | null
}

function MapCenterSynchronizer({
  latitude,
  longitude,
}: MapCenterSynchronizerProps): null {
  const leafletMap = useMap()
  const lastCenteredKeyRef = useRef<string>('')
  useEffect(() => {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return
    }
    const nextCenteredKey = `${latitude.toFixed(5)}:${longitude.toFixed(5)}`
    if (lastCenteredKeyRef.current === nextCenteredKey) {
      return
    }
    lastCenteredKeyRef.current = nextCenteredKey
    leafletMap.flyTo([latitude, longitude], leafletMap.getZoom(), {
      duration: 0.6,
    })
  }, [latitude, longitude, leafletMap])
  return null
}
