#!/usr/bin/env node
// Local-only API smoke runner (W13, D-77): runs every workforce API smoke in the LOOP.md order
// w2, w3, w4, w5, w6, w7, w8, w9, w10, w11, w14, w12, w15, w16, w13 (W16 D-88: w13 stays last) against the local stack that
// run-db-tests.mjs left running.
//
//   node scripts/supabase-test/run-db-tests.mjs && node scripts/supabase-test/run-api-smokes.mjs
//
// Prints each smoke's NOT OK lines and its final `<name>: n passed, m failed` line, and stops at the first smoke that exits
// non-zero (the runner then exits with that code). It runs nothing else: no Supabase CLI call, no link, no push. Each smoke
// keeps its own safety rules (loopback only, keys from local `supabase status` in memory, synthetic users deleted). Same
// refusals as run-db-tests.mjs: exit 2 on a remote target argument (--db-url, --linked, --project-ref) or while
// SUPABASE_DB_URL / SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_ID / SUPABASE_DB_PASSWORD is set. Reads no .env.

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SMOKE_ORDER = ['w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11', 'w14', 'w12', 'w15', 'w16', 'w13']
const FORBIDDEN_ARGUMENTS = ['--db-url', '--linked', '--project-ref']
const FORBIDDEN_ENVIRONMENT = ['SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_ID', 'SUPABASE_DB_PASSWORD']
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))

function abortIfRemoteRequested() {
  const forbiddenArgument = process.argv.slice(2).find((argument) => FORBIDDEN_ARGUMENTS.some((flag) => argument.startsWith(flag)))
  if (forbiddenArgument) {
    console.error(`run-api-smokes: refusing remote target argument ${forbiddenArgument}`)
    process.exit(2)
  }
  const forbiddenVariable = FORBIDDEN_ENVIRONMENT.find((name) => process.env[name])
  if (forbiddenVariable) {
    console.error(`run-api-smokes: refusing to run while ${forbiddenVariable} is set`)
    process.exit(2)
  }
}

function runSmoke(name) {
  const script = path.join(scriptDirectory, `${name}-api-smoke.mjs`)
  const result = spawnSync(process.execPath, [script], { cwd: path.resolve(scriptDirectory, '..', '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  const lines = `${result.stdout ?? ''}`.split(/\r?\n/).filter(Boolean)
  for (const line of lines.filter((l) => l.startsWith('NOT OK'))) console.log(`  ${line}`)
  const tail = lines.filter((l) => l.startsWith(`${name}-api-smoke:`)).pop() ?? `${name}-api-smoke: no result line`
  console.log(tail)
  if (result.status !== 0 && result.stderr) console.log(`  stderr: ${result.stderr.trim().split(/\r?\n/)[0]}`)
  return result.status ?? 1
}

function main() {
  abortIfRemoteRequested()
  for (const name of SMOKE_ORDER) {
    const status = runSmoke(name)
    if (status !== 0) {
      console.log(`run-api-smokes: FAIL at ${name} (exit ${status})`)
      return status
    }
  }
  console.log(`run-api-smokes: PASS (${SMOKE_ORDER.length} smokes)`)
  return 0
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    process.exit(main())
  } catch (error) {
    console.error(`run-api-smokes: ${error.message}`)
    process.exit(1)
  }
}
