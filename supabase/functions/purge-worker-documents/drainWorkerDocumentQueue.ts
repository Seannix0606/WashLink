// Repeats the purge until the queue is empty (audit finding F2). One round claims at most claimLimit names, so a backlog
// needs several. A round that confirms nothing stops the run, so a file that keeps failing cannot loop forever; it stays
// queued for the next scheduled run.
//
// Plain TypeScript with no Deno or Node imports, like purgeWorkerDocumentFiles.ts: Vitest, the Node job runner and Deno
// all run the same code. Results carry counts only, never file names.
import { purgeWorkerDocumentFiles, type PurgeClient, type PurgeOptions } from './purgeWorkerDocumentFiles.ts'

export interface DrainOptions extends PurgeOptions {
  readonly maxRounds?: number
}

export interface DrainResult {
  readonly rounds: number
  readonly claimed: number
  readonly confirmed: number
  readonly failedBatches: number
  /** True when the last round found the queue empty. */
  readonly complete: boolean
}

export async function drainWorkerDocumentQueue(client: PurgeClient, options: DrainOptions = {}): Promise<DrainResult> {
  const maxRounds = options.maxRounds ?? 10
  let rounds = 0
  let claimed = 0
  let confirmed = 0
  let failedBatches = 0
  while (rounds < maxRounds) {
    rounds += 1
    const result = await purgeWorkerDocumentFiles(client, options)
    if (result.claimed === 0) {
      return { rounds, claimed, confirmed, failedBatches, complete: true }
    }
    claimed += result.claimed
    confirmed += result.confirmed
    failedBatches += result.failedBatches
    if (result.confirmed === 0) {
      break
    }
  }
  return { rounds, claimed, confirmed, failedBatches, complete: false }
}
