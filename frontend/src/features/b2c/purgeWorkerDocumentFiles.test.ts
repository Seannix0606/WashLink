import { describe, expect, it, vi } from 'vitest'
import {
  purgeWorkerDocumentFiles,
  WORKER_DOCUMENT_BUCKET,
  type PurgeClient,
} from '../../../../supabase/functions/purge-worker-documents/purgeWorkerDocumentFiles.ts'

// Node only: the Deno wrapper has never been deployed or run. b2c7-api-smoke runs this same logic against the real Storage API.
interface QueryResult {
  readonly data: unknown
  readonly error: { readonly message: string } | null
}

type RemoveOutcome = Error | QueryResult

const answer = (data: unknown, message?: string): Promise<QueryResult> =>
  Promise.resolve({ data, error: message === undefined ? null : { message } })

interface FakeClient {
  readonly client: PurgeClient
  readonly rpc: ReturnType<typeof vi.fn>
  readonly from: ReturnType<typeof vi.fn>
  readonly removed: string[][]
  readonly askedToConfirm: unknown[]
}

function fakeClient(names: readonly string[], confirmedCount: number, removeOutcomes: readonly RemoveOutcome[] = []): FakeClient {
  const removed: string[][] = []
  const askedToConfirm: unknown[] = []
  const rpc = vi.fn((name: string, args: Record<string, unknown>): Promise<QueryResult> => {
    if (name === 'worker_document_files_claim') {
      return answer(names.map((object_name) => ({ object_name })))
    }
    askedToConfirm.push(args.p_names)
    return answer(confirmedCount)
  })
  const from = vi.fn(() => ({
    remove: (paths: string[]): Promise<QueryResult> => {
      const outcome = removeOutcomes.at(removed.length)
      removed.push(paths)
      if (outcome instanceof Error) {
        return Promise.reject(outcome)
      }
      return Promise.resolve(outcome ?? { data: paths.map((name) => ({ name })), error: null })
    },
  }))
  const client: PurgeClient = { rpc, storage: { from } }
  return { client, rpc, from, removed, askedToConfirm }
}

describe('purgeWorkerDocumentFiles', () => {
  it('reports the count the database confirmed, never the count the remove call reported', async () => {
    const fake = fakeClient(['a/1', 'a/2', 'a/3'], 1)
    await expect(purgeWorkerDocumentFiles(fake.client)).resolves.toEqual({ claimed: 3, failedBatches: 0, confirmed: 1 })
  })

  it('removes from the document bucket, in batches of the given size', async () => {
    const fake = fakeClient(['a/1', 'a/2', 'a/3'], 3)
    await purgeWorkerDocumentFiles(fake.client, { batchSize: 2 })
    expect(fake.from).toHaveBeenCalledWith(WORKER_DOCUMENT_BUCKET)
    expect(fake.removed).toEqual([['a/1', 'a/2'], ['a/3']])
  })

  it('keeps going after a failed batch and a thrown batch, and still asks the database about every name', async () => {
    const fake = fakeClient(['a/1', 'a/2', 'a/3'], 1, [
      { data: null, error: { message: 'storage down' } },
      new Error('network'),
      { data: [], error: null },
    ])
    const result = await purgeWorkerDocumentFiles(fake.client, { batchSize: 1 })
    expect(fake.removed).toEqual([['a/1'], ['a/2'], ['a/3']])
    expect(result).toEqual({ claimed: 3, failedBatches: 2, confirmed: 1 })
    expect(fake.askedToConfirm).toEqual([['a/1', 'a/2', 'a/3']])
  })

  it('does nothing further when the queue is empty', async () => {
    const fake = fakeClient([], 0)
    await expect(purgeWorkerDocumentFiles(fake.client)).resolves.toEqual({ claimed: 0, failedBatches: 0, confirmed: 0 })
    expect(fake.from).not.toHaveBeenCalled()
    expect(fake.rpc).toHaveBeenCalledTimes(1)
  })

  it('fails loudly when the claim or the confirmation is refused', async () => {
    const { storage } = fakeClient([], 0).client
    const refusedClaim: PurgeClient = { storage, rpc: () => answer(null, 'denied') }
    await expect(purgeWorkerDocumentFiles(refusedClaim)).rejects.toThrow('Could not claim files')
    const refusedConfirm: PurgeClient = {
      storage,
      rpc: (name) => (name === 'worker_document_files_claim' ? answer([{ object_name: 'a/1' }]) : answer(null, 'denied')),
    }
    await expect(purgeWorkerDocumentFiles(refusedConfirm)).rejects.toThrow('Could not confirm removal')
  })

  it('passes the claim limit to the database', async () => {
    const fake = fakeClient(['a/1'], 1)
    await purgeWorkerDocumentFiles(fake.client, { claimLimit: 7 })
    expect(fake.rpc).toHaveBeenCalledWith('worker_document_files_claim', { p_limit: 7 })
  })
})
