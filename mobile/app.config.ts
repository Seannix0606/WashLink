import type { ExpoConfig } from 'expo/config'

// No key or project id is stored in this file. They come from the environment or EAS: see README.md.
const googleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY
const easProjectId = process.env.EAS_PROJECT_ID

const config: ExpoConfig = {
  name: 'WashLink',
  slug: 'washlink',
  scheme: 'washlink',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  backgroundColor: '#ffffff',
  ios: {
    bundleIdentifier: 'com.washlink.app',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'WashLink uses your location to help you pin where your vehicle is, or where you start work.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.washlink.app',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
    ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
  },
  web: { bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-notifications',
    ['expo-location', { locationWhenInUsePermission: 'WashLink uses your location to help you pin where your vehicle is, or where you start work.' }],
    ['expo-image-picker', {
      photosPermission: 'WashLink uses your photos so you can choose a verification photo to send for review.',
      cameraPermission: 'WashLink uses your camera so you can take a verification photo to send for review.',
      microphonePermission: false,
    }],
    ['expo-splash-screen', { backgroundColor: '#134e4a', resizeMode: 'contain' }],
  ],
  experiments: { typedRoutes: false },
  extra: { eas: { projectId: easProjectId } },
}

export default config
