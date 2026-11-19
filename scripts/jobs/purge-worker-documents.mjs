#!/usr/bin/env node
// Removes washer verification files queued for deletion (audit finding F2): files of deleted accounts, replaced and abandoned
// uploads. Runs the same tested logic as the purge-worker-documents edge function, from Node, so it can be scheduled without
// deploying Deno (.github/workflows/purge-worker-documents.yml).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/jobs/purge-worker-documents.mjs
//
// Needs Node 22.18+ (runs the TypeScript modules directly) and `npm ci` in frontend/ for @supabase/supabase-js.
// Prints counts only: never a file name, a key or document content. Exit 0 = queue empty; 1 = something stayed queued
// (it is retried on the next run); 2 = not configured.
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const url = process.env.SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (url === '' || serviceKey === '') {
  console.error('purge-worker-documents: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const require = createRequire(path.join(repoRoot, 'frontend', 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const { drainWorkerDocumentQueue } = await import('../../supabase/functions/purge-worker-documents/drainWorkerDocumentQueue.ts')

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
try {
  const result = await drainWorkerDocumentQueue(client)
  console.log(JSON.stringify({ job: 'purge-worker-documents', ...result }))
  process.exit(result.complete && result.failedBatches === 0 ? 0 : 1)
} catch (error) {
  // The names stay queued and return on the next run. Database messages carry no document content.
  console.error(`purge-worker-documents: ${error instanceof Error ? error.message : 'failed'}`)
  process.exit(1)
}
