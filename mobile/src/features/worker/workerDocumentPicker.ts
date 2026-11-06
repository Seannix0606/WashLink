import { File, Paths } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'

export type PhotoSource = 'camera' | 'library'

export type PickedPhoto =
  | { readonly kind: 'picked'; readonly bytes: ArrayBuffer }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'problem'; readonly message: string }

const cameraDeniedMessage = 'WashLink can\'t use your camera because permission was not given. Allow it in your phone\'s settings, or use Choose photo.'
const openFailedMessage = 'The photo picker could not open. Try again.'
const readFailedMessage = 'We could not read that photo. Try again, or choose a different one.'

/**
 * Read from expo-image-picker's source (~58.0.10):
 * - Compatible asks iOS for a JPEG instead of the original. ImageUtils.swift still passes a HEIC through as raw data if iOS offers it
 *   first, so the shared check can still see one and refuse it.
 * - Android's asset.fileSize is the source file's size, not the compressed output's (MediaHandler.kt), and asset.mimeType also describes
 *   the source. Neither is used: size and type come from the bytes.
 * - exif: false only leaves EXIF out of this result. It doesn't prove the file has none.
 */
const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  exif: false,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
}

async function launch(source: PhotoSource): Promise<ImagePicker.ImagePickerResult | 'denied'> {
  if (source === 'library') {
    // The system picker runs outside the app on both platforms, so the library needs no permission request.
    return ImagePicker.launchImageLibraryAsync(pickerOptions)
  }
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  return permission.granted ? ImagePicker.launchCameraAsync(pickerOptions) : 'denied'
}

/** Never .blob() or FormData, which storage-js says don't work on React Native. expo/fetch reads a file:// URI here. */
async function readBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri)
  if (!response.ok) {
    throw new Error('unreadable')
  }
  return response.arrayBuffer()
}

/**
 * The picker writes its result into the app's cache (MediaHandler.kt, MediaHandler.swift), so an ID would otherwise sit there after the
 * upload. Only a file:// path inside the cache is touched, which leaves the phone's own photo alone and skips the browser preview's
 * blob: URL. A failure must never stop the upload, and the system can clear this cache anyway.
 */
export function removePickedPhotoFromCache(uri: string): void {
  try {
    if (!uri.startsWith('file://') || uri.includes('/../') || !uri.startsWith(Paths.cache.uri)) {
      return
    }
    const file = new File(uri)
    if (file.exists) {
      file.delete()
    }
  } catch {
    // Quietly left for the system to clear.
  }
}

export async function pickWorkerDocumentPhoto(source: PhotoSource): Promise<PickedPhoto> {
  let result: ImagePicker.ImagePickerResult | 'denied'
  try {
    result = await launch(source)
  } catch {
    return { kind: 'problem', message: openFailedMessage }
  }
  if (result === 'denied') {
    return { kind: 'problem', message: cameraDeniedMessage }
  }
  const asset = result.canceled ? undefined : result.assets[0]
  if (asset === undefined) {
    return { kind: 'cancelled' }
  }
  try {
    return { kind: 'picked', bytes: await readBytes(asset.uri) }
  } catch {
    return { kind: 'problem', message: readFailedMessage }
  } finally {
    removePickedPhotoFromCache(asset.uri)
  }
}
