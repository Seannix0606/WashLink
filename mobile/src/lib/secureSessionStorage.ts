import * as SecureStore from 'expo-secure-store'

// SecureStore warns above 2048 bytes and a Supabase session is larger, so a value is split across keys.
const CHUNK_SIZE = 1800
const countKey = (key: string): string => `${key}.count`
const chunkKey = (key: string, index: number): string => `${key}.${String(index)}`
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }

/** Keeps the session in the device keychain or keystore, never in ordinary app storage. */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(countKey(key), options)
    if (count === null) {
      return null
    }
    const parts = await Promise.all(
      Array.from({ length: Number(count) }, (_unused, index) => SecureStore.getItemAsync(chunkKey(key, index), options)),
    )
    return parts.some((part) => part === null) ? null : parts.join('')
  },
  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key)
    const total = Math.ceil(value.length / CHUNK_SIZE)
    await Promise.all(
      Array.from({ length: total }, (_unused, index) =>
        SecureStore.setItemAsync(chunkKey(key, index), value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE), options)),
    )
    await SecureStore.setItemAsync(countKey(key), String(total), options)
  },
  async removeItem(key: string): Promise<void> {
    const count = await SecureStore.getItemAsync(countKey(key), options)
    if (count === null) {
      return
    }
    await Promise.all(Array.from({ length: Number(count) }, (_unused, index) => SecureStore.deleteItemAsync(chunkKey(key, index), options)))
    await SecureStore.deleteItemAsync(countKey(key), options)
  },
}
