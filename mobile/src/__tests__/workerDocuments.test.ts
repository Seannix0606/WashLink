import fs from 'node:fs'
import path from 'node:path'
import {
  createB2cApi,
  workerDocumentHeicMessage,
  workerDocumentTypeFromBytes,
  workerDocumentWrongTypeMessage,
  type B2cSupabaseClient,
} from '@washlink/shared'
import * as ImagePicker from 'expo-image-picker'
import { pickWorkerDocumentPhoto, removePickedPhotoFromCache } from '../features/worker/workerDocumentPicker'
import config from '../../app.config'

jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))

const mockCacheFile = { exists: true, delete: jest.fn() }
const mockMadeFiles: string[] = []
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    constructor(uri: string) {
      mockMadeFiles.push(uri)
      return mockCacheFile
    }
  },
}))

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]).buffer
const heic = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]).buffer
const pickedAsset = (uri: string, extra: object = {}) => ({ canceled: false, assets: [{ uri, width: 1, height: 1, ...extra }] }) as ImagePicker.ImagePickerResult
const originalFetch = global.fetch

function fakeFetch(bytes: ArrayBuffer, ok = true): { fetch: jest.Mock; blob: jest.Mock } {
  const blob = jest.fn()
  const fetchMock = jest.fn(() => Promise.resolve({ ok, arrayBuffer: () => Promise.resolve(bytes), blob }))
  global.fetch = fetchMock as unknown as typeof fetch
  return { fetch: fetchMock, blob }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockMadeFiles.length = 0
  mockCacheFile.exists = true
  mockCacheFile.delete.mockImplementation(() => undefined)
})

afterAll(() => {
  global.fetch = originalFetch
})

describe('picking a verification photo', () => {
  it('asks for the camera, and says what to do when refused', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as never)
    const result = await pickWorkerDocumentPhoto('camera')
    expect(result.kind).toBe('problem')
    expect(result).toMatchObject({ message: expect.stringContaining('permission was not given') as string })
    expect(picker.launchCameraAsync).not.toHaveBeenCalled()
  })

  it('takes a photo once allowed, with the agreed options and no video', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never)
    picker.launchCameraAsync.mockResolvedValue(pickedAsset('file:///cache/a.jpg'))
    fakeFetch(jpeg)
    const result = await pickWorkerDocumentPhoto('camera')
    expect(result).toEqual({ kind: 'picked', bytes: jpeg })
    expect(picker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], quality: 0.7, exif: false }))
  })

  it('opens the library without a permission prompt, and asks iOS for its compatible format', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(pickedAsset('file:///cache/b.jpg'))
    fakeFetch(jpeg)
    await pickWorkerDocumentPhoto('library')
    expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled()
    expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ preferredAssetRepresentationMode: 'compatible' }))
  })

  it('treats backing out as nothing happening', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null })
    const { fetch: fetched } = fakeFetch(jpeg)
    await expect(pickWorkerDocumentPhoto('library')).resolves.toEqual({ kind: 'cancelled' })
    expect(fetched).not.toHaveBeenCalled()
  })

  it('reads with fetch and arrayBuffer, never blob', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(pickedAsset('file:///cache/c.jpg'))
    const { fetch: fetched, blob } = fakeFetch(jpeg)
    await pickWorkerDocumentPhoto('library')
    expect(fetched).toHaveBeenCalledWith('file:///cache/c.jpg')
    expect(blob).not.toHaveBeenCalled()
  })

  it('does not trust the size or type the picker reports', async () => {
    // Android reports the source file's size, which can be far above the compressed output's.
    picker.launchImageLibraryAsync.mockResolvedValue(pickedAsset('file:///cache/d.jpg', { fileSize: 50 * 1024 * 1024, mimeType: 'image/heic' }))
    fakeFetch(jpeg)
    await expect(pickWorkerDocumentPhoto('library')).resolves.toEqual({ kind: 'picked', bytes: jpeg })
  })

  it.each([
    ['a response that is not ok', (): void => { fakeFetch(jpeg, false) }],
    ['a URI fetch can not read', (): void => { global.fetch = jest.fn(() => Promise.reject(new Error('content:// not supported'))) as unknown as typeof fetch }],
  ])('says so honestly on %s', async (_name, arrange) => {
    picker.launchImageLibraryAsync.mockResolvedValue(pickedAsset('content://media/1'))
    arrange()
    await expect(pickWorkerDocumentPhoto('library')).resolves.toMatchObject({ kind: 'problem', message: expect.stringContaining('could not read that photo') as string })
  })

  it('says so when the picker itself fails', async () => {
    picker.launchImageLibraryAsync.mockRejectedValue(new Error('native failure'))
    await expect(pickWorkerDocumentPhoto('library')).resolves.toMatchObject({ kind: 'problem', message: expect.stringContaining('could not open') as string })
  })
})

describe('clearing the picked photo from the cache', () => {
  it('deletes the cached copy once it has been read', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(pickedAsset('file:///cache/ImagePicker/e.jpg'))
    fakeFetch(jpeg)
    await expect(pickWorkerDocumentPhoto('library')).resolves.toEqual({ kind: 'picked', bytes: jpeg })
    expect(mockMadeFiles).toEqual(['file:///cache/ImagePicker/e.jpg'])
    expect(mockCacheFile.delete).toHaveBeenCalledTimes(1)
  })

  it('also deletes it when reading failed', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(pickedAsset('file:///cache/ImagePicker/f.jpg'))
    fakeFetch(jpeg, false)
    await expect(pickWorkerDocumentPhoto('library')).resolves.toMatchObject({ kind: 'problem' })
    expect(mockCacheFile.delete).toHaveBeenCalledTimes(1)
  })

  it('still hands over the photo when deleting fails', async () => {
    mockCacheFile.delete.mockImplementation(() => { throw new Error('locked') })
    picker.launchImageLibraryAsync.mockResolvedValue(pickedAsset('file:///cache/ImagePicker/g.jpg'))
    fakeFetch(jpeg)
    await expect(pickWorkerDocumentPhoto('library')).resolves.toEqual({ kind: 'picked', bytes: jpeg })
  })

  it('does not try to delete a file that is already gone', () => {
    mockCacheFile.exists = false
    removePickedPhotoFromCache('file:///cache/ImagePicker/h.jpg')
    expect(mockCacheFile.delete).not.toHaveBeenCalled()
  })

  it.each([
    ['the browser preview', 'blob:http://localhost/1'],
    ['a content URI', 'content://media/1'],
    ['a file outside the cache', 'file:///photos/IMG_1.jpg'],
    ['a path that climbs out of the cache', 'file:///cache/../photos/IMG_1.jpg'],
  ])('leaves %s alone', (_name, uri) => {
    removePickedPhotoFromCache(uri)
    expect(mockMadeFiles).toEqual([])
    expect(mockCacheFile.delete).not.toHaveBeenCalled()
  })
})

describe('sending a picked photo through the shared client', () => {
  function fakeClient(): { client: B2cSupabaseClient; rpc: jest.Mock; upload: jest.Mock } {
    const upload = jest.fn(() => Promise.resolve({ data: {}, error: null }))
    const rpc = jest.fn((name: string) => Promise.resolve({
      data: name === 'begin_worker_document_upload' ? [{ document_id: 'd1', object_name: 'w1/d1' }] : [{ document_id: 'd1', document_type: 'selfie', status: 'submitted' }],
      error: null,
    }))
    return { client: { rpc, from: jest.fn(), storage: { from: () => ({ upload, download: jest.fn() }) } } as unknown as B2cSupabaseClient, rpc, upload }
  }

  it('uses the sniffed type on the same sequence as web', async () => {
    const fake = fakeClient()
    await createB2cApi(fake.client).uploadWorkerDocument('selfie', jpeg)
    expect(fake.rpc.mock.calls.map(([name]) => name as string)).toEqual(['begin_worker_document_upload', 'submit_worker_document_upload'])
    expect(fake.upload).toHaveBeenCalledWith('w1/d1', jpeg, { contentType: 'image/jpeg', upsert: false, headers: { 'cache-control': 'no-store' } })
  })

  it('refuses HEIC with a clear message before starting a slot', async () => {
    const fake = fakeClient()
    await expect(createB2cApi(fake.client).uploadWorkerDocument('selfie', heic)).rejects.toThrow(workerDocumentHeicMessage)
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('sniffs the same way as web', () => {
    expect(workerDocumentTypeFromBytes(jpeg)).toBe('image/jpeg')
    expect(workerDocumentTypeFromBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(workerDocumentTypeFromBytes(heic)).toBeNull()
    expect(workerDocumentTypeFromBytes(new Uint8Array(0))).toBeNull()
    expect(workerDocumentWrongTypeMessage).toBe('Upload a JPEG or PNG photo.')
  })
})

describe('status copy', () => {
  it('does not say a pending washer is being reviewed, and names the Profile tab', () => {
    const screen = fs.readFileSync(path.join(__dirname, '../../app/worker/index.tsx'), 'utf8')
    expect(screen).toContain('WashLink reviews your account after you upload your verification photos in the Profile tab. You can go online once it is verified.')
    expect(screen).not.toContain('WashLink is reviewing your account')
    expect(fs.readFileSync(path.join(__dirname, '../../app/worker/_layout.tsx'), 'utf8')).toContain("name: 'setup', title: 'Profile'")
  })
})

describe('app permissions', () => {
  it('explains camera and photos, and blocks the microphone', () => {
    const plugin = (config.plugins ?? []).find((entry) => Array.isArray(entry) && entry[0] === 'expo-image-picker') as [string, Record<string, unknown>] | undefined
    expect(plugin?.[1].photosPermission).toEqual(expect.stringContaining('verification photo'))
    expect(plugin?.[1].cameraPermission).toEqual(expect.stringContaining('verification photo'))
    expect(plugin?.[1].microphonePermission).toBe(false)
  })
})
