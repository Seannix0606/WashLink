#!/usr/bin/env node
// Local-only DB test runner (W1): stage -> start -> reset -> pgTAP.
//
//   node scripts/supabase-test/run-db-tests.mjs
//
// Every Supabase CLI call is hard-coded to `--local --workdir .local-supabase-test`.
// It never calls `link` or `push`, and aborts if a remote target is requested (--db-url,
// --linked, --project-ref, SUPABASE_DB_URL / SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_ID / SUPABASE_DB_PASSWORD) or if
// the workdir holds a .temp/project-ref (linked) before ANY CLI call.
// Exit code = exit code of the first failing step.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { STAGED_DIRECTORY_NAME, stageLocalWorkdir } from './stage-local-workdir.mjs'

const FORBIDDEN_ARGUMENTS = ['--db-url', '--linked', '--project-ref']
const FORBIDDEN_ENVIRONMENT = ['SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_ID', 'SUPABASE_DB_PASSWORD']
// On Windows `npx` is a .cmd shim, which Node only spawns through a shell. With shell:true Node
// joins the arguments unquoted, so the workdir is double-quoted and restricted to a safe charset.
const useShell = process.platform === 'win32'
const SAFE_WORKDIR_PATTERN = /^[A-Za-z0-9 _.:\\/-]+$/
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workdir = path.join(repoRoot, STAGED_DIRECTORY_NAME)

function abortIfRemoteRequested() {
  const forbiddenArgument = process.argv
    .slice(2)
    .find((argument) => FORBIDDEN_ARGUMENTS.some((flag) => argument.startsWith(flag)))
  if (forbiddenArgument) {
    console.error(`run-db-tests: refusing remote target argument ${forbiddenArgument}`)
    process.exit(2)
  }
  const forbiddenVariable = FORBIDDEN_ENVIRONMENT.find((name) => process.env[name])
  if (forbiddenVariable) {
    console.error(`run-db-tests: refusing to run while ${forbiddenVariable} is set`)
    process.exit(2)
  }
}

// A linked workdir (project-ref present) could send CLI calls to the remote project.
export function assertWorkdirNotLinked(workdirPath) {
  const linkedPath = [
    path.join(workdirPath, 'supabase', '.temp', 'project-ref'),
    path.join(workdirPath, '.temp', 'project-ref'),
  ].find((candidate) => fs.existsSync(candidate))
  if (linkedPath) {
    throw new Error(`refusing to run: ${linkedPath} exists (workdir is linked)`)
  }
}

function runSupabase(argumentsList, { quiet = false } = {}) {
  abortIfRemoteRequested()
  assertWorkdirNotLinked(workdir)
  if (useShell && !SAFE_WORKDIR_PATTERN.test(workdir)) {
    throw new Error(`refusing to pass an unsafe workdir path to the shell: ${workdir}`)
  }
  const workdirArgument = useShell ? `"${workdir}"` : workdir
  const fullArguments = ['supabase', ...argumentsList, '--workdir', workdirArgument]
  if (fullArguments.includes('link') || fullArguments.includes('push')) {
    throw new Error('run-db-tests never links or pushes')
  }
  if (!quiet) {
    console.log(`\n> npx ${fullArguments.join(' ')}`)
  }
  const result = spawnSync('npx', fullArguments, {
    cwd: workdir,
    stdio: quiet ? 'pipe' : 'inherit',
    shell: useShell,
    encoding: 'utf8',
  })
  if (result.error) {
    throw result.error
  }
  return result.status ?? 1
}

function main() {
  abortIfRemoteRequested()

  console.log('> stage local workdir')
  const staged = stageLocalWorkdir({ repoRoot })
  for (const { stagedName } of staged.migrations) {
    console.log(`  ${stagedName}`)
  }

  const isRunning = runSupabase(['status'], { quiet: true }) === 0
  if (isRunning) {
    console.log('\n(local stack already running for this workdir; skipping start)')
  } else {
    const startStatus = runSupabase(['start'])
    if (startStatus !== 0) {
      return startStatus
    }
  }

  const resetStatus = runSupabase(['db', 'reset', '--local'])
  if (resetStatus !== 0) {
    return resetStatus
  }
  return runSupabase(['test', 'db', '--local'])
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    process.exit(main())
  } catch (error) {
    console.error(`run-db-tests: ${error.message}`)
    process.exit(1)
  }
}
