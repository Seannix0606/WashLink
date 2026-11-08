// The trusted job's logic, with its client injected: claim, remove through the Storage API, then ask the database what is really gone.
// SQL cannot remove a file, and the `remove` response is not evidence: it reports OK with zero rows when nothing was removed. So the
// result this returns comes only from worker_document_files_confirm_removed, which checks storage.objects itself (D-121).
//
// Plain TypeScript with no Deno or Node imports, so Vitest and b2c7-api-smoke run the same code the Deno wrapper runs.

export const WORKER_DOCUMENT_BUCKET = 'worker-verification-documents'
const DEFAULT_CLAIM_LIMIT = 200
const DEFAULT_BATCH_SIZE = 50

interface QueryError {
  readonly message: string
}

interface QueryResult<T> {
  readonly data: T | null
  readonly error: QueryError | null
}

export interface PurgeClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<QueryResult<unknown>>
  readonly storage: {
    from(bucket: string): { remove(paths: string[]): PromiseLike<QueryResult<unknown>> }
  }
}

export interface PurgeOptions {
  readonly claimLimit?: number
  readonly batchSize?: number
}

export interface PurgeResult {
  /** Names the database handed to this run. */
  readonly claimed: number
  /** Removal batches that failed. Their names stay queued and return on a later run. */
  readonly failedBatches: number
  /** Names the database confirmed have no object row left. The only count that means a file is gone. */
  readonly confirmed: number
}

function claimedNames(data: unknown): string[] {
  if (!Array.isArray(data)) {
    return []
  }
  return data.flatMap((row: unknown) => {
    const name = (row as { object_name?: unknown } | null)?.object_name
    return typeof name === 'string' ? [name] : []
  })
}

function inBatches(names: readonly string[], size: number): string[][] {
  const batches: string[][] = []
  for (let start = 0; start < names.length; start += size) {
    batches.push(names.slice(start, start + size))
  }
  return batches
}

export async function purgeWorkerDocumentFiles(client: PurgeClient, options: PurgeOptions = {}): Promise<PurgeResult> {
  const claim = await client.rpc('worker_document_files_claim', { p_limit: options.claimLimit ?? DEFAULT_CLAIM_LIMIT })
  if (claim.error) {
    throw new Error(`Could not claim files: ${claim.error.message}`)
  }
  const names = claimedNames(claim.data)
  if (names.length === 0) {
    return { claimed: 0, failedBatches: 0, confirmed: 0 }
  }

  // One failed batch does not stop the others.
  let failedBatches = 0
  for (const batch of inBatches(names, options.batchSize ?? DEFAULT_BATCH_SIZE)) {
    try {
      const { error } = await client.storage.from(WORKER_DOCUMENT_BUCKET).remove(batch)
      if (error) {
        failedBatches += 1
      }
    } catch {
      failedBatches += 1
    }
  }

  // Every claimed name goes to the database, including failed batches: a failed response may still have removed the files.
  const confirm = await client.rpc('worker_document_files_confirm_removed', { p_names: names })
  if (confirm.error) {
    throw new Error(`Could not confirm removal: ${confirm.error.message}`)
  }
  return { claimed: names.length, failedBatches, confirmed: typeof confirm.data === 'number' ? confirm.data : 0 }
}
