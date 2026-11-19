import { describe, expect, it } from 'vitest'
import { drainWorkerDocumentQueue } from '../../../../supabase/functions/purge-worker-documents/drainWorkerDocumentQueue.ts'
import type { PurgeClient } from '../../../../supabase/functions/purge-worker-documents/purgeWorkerDocumentFiles.ts'

// Audit finding F2: the scheduled job drains the queue. The fake keeps a queue and a set of stored files, like the database
// and Storage do: claim hands out queued names, remove deletes files (unless told to fail), confirm drops removed names.
interface FakeStorage {
  readonly client: PurgeClient
  readonly queue: string[]
  readonly stored: Set<string>
}

function fakeStorage(queued: string[], options: { readonly failing?: ReadonlySet<string>; readonly claimError?: string } = {}): FakeStorage {
  const queue = [...queued]
  const stored = new Set(queued)
  const client: PurgeClient = {
    rpc: (name, args) => {
      if (name === 'worker_document_files_claim') {
        if (options.claimError !== undefined) return Promise.resolve({ data: null, error: { message: options.claimError } })
        const limit = args.p_limit as number
        return Promise.resolve({ data: queue.slice(0, limit).map((object_name) => ({ object_name })), error: null })
      }
      const names = args.p_names as string[]
      const gone = names.filter((name) => !stored.has(name))
      for (const name of gone) queue.splice(queue.indexOf(name), 1)
      return Promise.resolve({ data: gone.length, error: null })
    },
    storage: {
      from: () => ({
        remove: (paths: string[]): Promise<{ data: unknown; error: { message: string } | null }> => {
          if (paths.some((objectName) => options.failing?.has(objectName))) return Promise.resolve({ data: null, error: { message: 'storage unavailable' } })
          for (const objectName of paths) stored.delete(objectName)
          return Promise.resolve({ data: [], error: null })
        },
      }),
    },
  }
  return { client, queue, stored }
}

describe('drainWorkerDocumentQueue', () => {
  it('drains a backlog bigger than one claim, then reports complete', async () => {
    const names = Array.from({ length: 450 }, (_unused, index) => `worker-1/doc-${String(index)}`)
    const { client, queue, stored } = fakeStorage(names)
    const result = await drainWorkerDocumentQueue(client)
    expect(result).toEqual({ rounds: 4, claimed: 450, confirmed: 450, failedBatches: 0, complete: true })
    expect(queue).toHaveLength(0)
    expect(stored.size).toBe(0)
  })

  it('is idempotent: an empty queue does nothing', async () => {
    const { client } = fakeStorage([])
    expect(await drainWorkerDocumentQueue(client)).toEqual({ rounds: 1, claimed: 0, confirmed: 0, failedBatches: 0, complete: true })
  })

  it('keeps a file that keeps failing queued, stops instead of looping, and reports it incomplete', async () => {
    const { client, queue, stored } = fakeStorage(['worker-1/stuck'], { failing: new Set(['worker-1/stuck']) })
    const result = await drainWorkerDocumentQueue(client, { maxRounds: 50 })
    expect(result.complete).toBe(false)
    expect(result.rounds).toBe(1)
    expect(result.failedBatches).toBe(1)
    expect(queue).toEqual(['worker-1/stuck'])
    expect(stored.has('worker-1/stuck')).toBe(true)
  })

  it('removes the good files when one batch fails, and leaves only the failed batch queued', async () => {
    const good = Array.from({ length: 50 }, (_unused, index) => `worker-2/ok-${String(index)}`)
    const { client, queue } = fakeStorage([...good, 'worker-3/stuck'], { failing: new Set(['worker-3/stuck']) })
    const result = await drainWorkerDocumentQueue(client)
    expect(result.confirmed).toBe(50)
    expect(result.complete).toBe(false)
    expect(queue).toEqual(['worker-3/stuck'])
  })

  it('surfaces a claim error instead of reporting success', async () => {
    const { client } = fakeStorage(['worker-1/doc'], { claimError: 'permission denied' })
    await expect(drainWorkerDocumentQueue(client)).rejects.toThrow('Could not claim files: permission denied')
  })
})
