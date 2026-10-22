import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'
import Leaflet from 'leaflet'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import type { Shop } from '../../../domain/models/Shop'
import { shopHasCompletePricing } from '../../../domain/utilities/shopPricing'
import 'leaflet/dist/leaflet.css'

export interface PickedLocationValue {
  readonly latitude: number
  readonly longitude: number
}

interface LocationPickerMapProps {
  readonly pickedLocation: PickedLocationValue | null
  readonly onPickedLocationChanged: (next: PickedLocationValue) => void
  readonly nearbyShops?: readonly Shop[]
  readonly selectedShopIdentifier?: string | null
  readonly onShopSelected?: (shopIdentifier: string) => void
  readonly isLoadingShops?: boolean
  readonly isShopPicker?: boolean
  readonly fallbackCenter?: PickedLocationValue
  readonly zoomLevel?: number
  readonly heightClassName?: string
}

const defaultFallbackCenter: PickedLocationValue = {
  latitude: 14.5995,
  longitude: 120.9842,
}

const customPinDivIcon = Leaflet.divIcon({
  className: 'wl-map-pin',
  html: `
    <span class="wl-map-pin__inner">
      <span class="wl-map-pin__dot"></span>
    </span>
  `,
  iconSize: [32, 40],
  iconAnchor: [16, 36],
})

function createShopMarkerIcon(
  isSelected: boolean,
  isBookable: boolean,
): Leaflet.DivIcon {
  return Leaflet.divIcon({
    className: [
      'wl-map-shop-marker',
      isSelected ? 'wl-map-shop-marker--selected' : '',
      isBookable ? '' : 'wl-map-shop-marker--unavailable',
    ].filter(Boolean).join(' '),
    html: '<span class="wl-map-shop-marker__inner"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 5 4h14l2 6.5V20h-6v-5h-4v5H5v-9.5M3 10.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2 2 0 0 0 4 0"/></svg></span>',
    iconSize: [38, 44],
    iconAnchor: [19, 40],
  })
}

export function LocationPickerMap({
  pickedLocation,
  onPickedLocationChanged,
  nearbyShops = [],
  selectedShopIdentifier = null,
  onShopSelected,
  isLoadingShops = false,
  isShopPicker = false,
  fallbackCenter = defaultFallbackCenter,
  zoomLevel = 14,
  heightClassName = 'h-[23rem] sm:h-[27rem]',
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
        zoomControl={false}
        scrollWheelZoom
        className="h-full w-full"
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewportController
          pickedLocation={pickedLocation}
          nearbyShops={nearbyShops}
          selectedShopIdentifier={selectedShopIdentifier}
          fallbackCenter={fallbackCenter}
          zoomLevel={zoomLevel}
        />
        <MapClickHandler
          onCoordinatesSelected={(latitude, longitude): void => {
            onPickedLocationChanged({ latitude, longitude })
          }}
        />
        {pickedLocation ? (
          <Marker
            position={[pickedLocation.latitude, pickedLocation.longitude]}
            icon={customPinDivIcon}
            draggable
            eventHandlers={{
              dragend: (dragEvent): void => {
                const markerTarget = dragEvent.target as {
                  getLatLng: () => { lat: number; lng: number }
                }
                const nextLatLng = markerTarget.getLatLng()
                onPickedLocationChanged({
                  latitude: nextLatLng.lat,
                  longitude: nextLatLng.lng,
                })
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -28]}>
              Your wash location · drag to adjust
            </Tooltip>
          </Marker>
        ) : null}
        {nearbyShops.map((shop) => {
          if (shop.latitude === null || shop.longitude === null) {
            return null
          }
          const isSelected = selectedShopIdentifier === shop.id
          const canBookAtShop = shopHasCompletePricing(shop)
          return (
            <Marker
              key={shop.id}
              position={[shop.latitude, shop.longitude]}
              icon={createShopMarkerIcon(isSelected, canBookAtShop)}
              title={shop.name}
              keyboard={canBookAtShop}
              eventHandlers={{
                click: (): void => {
                  if (canBookAtShop) {
                    onShopSelected?.(shop.id)
                  }
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -34]}>
                <span className="font-semibold">{shop.name}</span>
                <br />
                {canBookAtShop ? 'Tap to choose this car wash' : 'Rates not set up yet'}
              </Tooltip>
              {isSelected ? (
                <Popup>
                  <div className="min-w-36">
                    <p className="font-semibold">{shop.name}</p>
                    <p className="mt-0.5 text-xs">{shop.address}</p>
                    {shop.phoneNumber ? (
                      <p className="mt-1 text-xs">{shop.phoneNumber}</p>
                    ) : null}
                  </div>
                </Popup>
              ) : null}
            </Marker>
          )
        })}
      </MapContainer>
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[400] flex items-start justify-between gap-2">
        <div className="rounded-2xl bg-white/95 px-3 py-2 shadow-[var(--shadow-popover)] backdrop-blur">
          <p className="text-xs font-semibold text-[var(--color-ink-900)]">
            Choose your wash location
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--color-ink-500)]">
            {isShopPicker
              ? 'Drag the pin or tap the map. Tap a shop pin to select it.'
              : 'Tap the map to place a pin, then drag it to adjust.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {isShopPicker ? (
            <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-2 text-[10px] font-medium text-[var(--color-ink-700)] shadow-[var(--shadow-popover)] backdrop-blur">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-brand-700)]" />
              Car wash
            </div>
          ) : null}
          {nearbyShops.some((shop) => selectedShopIdentifier === shop.id) ? (
            <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-2 text-[10px] font-medium text-[var(--color-ink-700)] shadow-[var(--shadow-popover)] backdrop-blur">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-warning-600)]" />
              Selected
            </div>
          ) : null}
          {nearbyShops.some((shop) => !shopHasCompletePricing(shop)) ? (
            <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-2 text-[10px] font-medium text-[var(--color-ink-700)] shadow-[var(--shadow-popover)] backdrop-blur">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-ink-500)]" />
              Rates not ready
            </div>
          ) : null}
          {pickedLocation ? (
            <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-2 text-[10px] font-medium text-[var(--color-ink-700)] shadow-[var(--shadow-popover)] backdrop-blur">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--color-brand-700)] bg-white" />
              Your location
            </div>
          ) : null}
        </div>
      </div>
      <div className="pointer-events-auto absolute bottom-2 left-2 z-[400] rounded-md bg-white/90 px-1.5 py-1 text-[9px] leading-none text-[var(--color-ink-500)] shadow-sm">
        &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
      </div>
      {isShopPicker && isLoadingShops ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[400] rounded-xl bg-white/95 px-3 py-2 text-center text-xs text-[var(--color-ink-700)] shadow-[var(--shadow-popover)] backdrop-blur">
          Finding approved car washes…
        </div>
      ) : isShopPicker && nearbyShops.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[400] rounded-xl bg-white/95 px-3 py-2 text-center text-xs text-[var(--color-ink-700)] shadow-[var(--shadow-popover)] backdrop-blur">
          No car wash locations are mapped nearby yet. You can still choose one
          from the list below.
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
    click: (mapMouseEvent): void => {
      onCoordinatesSelected(mapMouseEvent.latlng.lat, mapMouseEvent.latlng.lng)
    },
  })
  return null
}

interface MapViewportControllerProps {
  readonly pickedLocation: PickedLocationValue | null
  readonly nearbyShops: readonly Shop[]
  readonly selectedShopIdentifier: string | null
  readonly fallbackCenter: PickedLocationValue
  readonly zoomLevel: number
}

function MapViewportController({
  pickedLocation,
  nearbyShops,
  selectedShopIdentifier,
  fallbackCenter,
  zoomLevel,
}: MapViewportControllerProps): null {
  const leafletMap = useMap()
  const lastViewportKeyRef = useRef<string>('')
  useEffect(() => {
    const shopCoordinates = nearbyShops.flatMap((shop) =>
      typeof shop.latitude === 'number' &&
      typeof shop.longitude === 'number'
        ? [[shop.latitude, shop.longitude] as [number, number]]
        : [],
    )
    const selectedShop = nearbyShops.find(
      (shop) => shop.id === selectedShopIdentifier,
    )
    const viewportKey = [
      pickedLocation
        ? `${pickedLocation.latitude.toFixed(5)}:${pickedLocation.longitude.toFixed(5)}`
        : 'no-location',
      selectedShopIdentifier ?? 'no-shop',
      shopCoordinates.map(([latitude, longitude]) =>
        `${latitude.toFixed(5)}:${longitude.toFixed(5)}`,
      ).join('|'),
    ].join(';')
    if (lastViewportKeyRef.current === viewportKey) {
      return
    }
    lastViewportKeyRef.current = viewportKey

    if (
      selectedShop &&
      typeof selectedShop.latitude === 'number' &&
      typeof selectedShop.longitude === 'number'
    ) {
      leafletMap.flyTo(
        [selectedShop.latitude, selectedShop.longitude],
        Math.max(leafletMap.getZoom(), 15),
        { duration: 0.55 },
      )
      return
    }

    const viewportCoordinates: [number, number][] = [
      ...(pickedLocation
        ? [[pickedLocation.latitude, pickedLocation.longitude] as [number, number]]
        : []),
      ...shopCoordinates,
    ]
    if (viewportCoordinates.length === 0) {
      leafletMap.setView(
        [fallbackCenter.latitude, fallbackCenter.longitude],
        zoomLevel,
      )
      return
    }
    if (viewportCoordinates.length === 1) {
      leafletMap.flyTo(viewportCoordinates[0], zoomLevel, { duration: 0.55 })
      return
    }
    leafletMap.fitBounds(Leaflet.latLngBounds(viewportCoordinates), {
      padding: [48, 48],
      maxZoom: 15,
      animate: true,
      duration: 0.55,
    })
  }, [
    fallbackCenter,
    leafletMap,
    nearbyShops,
    pickedLocation,
    selectedShopIdentifier,
    zoomLevel,
  ])
  return null
}
