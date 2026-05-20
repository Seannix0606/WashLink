export function buildGoogleMapsSearchUrlForAddress(rawAddress: string): string {
  const encodedAddress = encodeURIComponent(rawAddress.trim())
  return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`
}

export function openExternalUrlInNewTab(externalUrl: string): void {
  if (typeof window === 'undefined') {
    return
  }
  window.open(externalUrl, '_blank', 'noopener,noreferrer')
}
