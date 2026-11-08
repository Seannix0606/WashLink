// Removes queued washer verification files. NOT DEPLOYED, NOT SCHEDULED AND NEVER RUN on Deno: the staged local stack has no edge
// functions, so only purgeWorkerDocumentFiles.ts has been run, under Vitest and in b2c7-api-smoke. Until this is deployed and scheduled,
// files stay in storage after account deletion, and the admin console shows how many and since when.
//
// The service role key is only available here, on the server. It is never in the web or mobile apps.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { secretsMatch } from '../send-service-push/secretsMatch.ts'
import { purgeWorkerDocumentFiles } from './purgeWorkerDocumentFiles.ts'

Deno.serve(async (request) => {
  if (!secretsMatch(request.headers.get('x-job-secret'), Deno.env.get('PURGE_WORKER_DOCUMENTS_SECRET'))) {
    return new Response('Forbidden', { status: 403 })
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })
  try {
    const result = await purgeWorkerDocumentFiles(admin)
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch {
    // The names stay queued and return on the next run. No path or database detail goes into the response.
    return new Response('Could not finish this run', { status: 500 })
  }
})
