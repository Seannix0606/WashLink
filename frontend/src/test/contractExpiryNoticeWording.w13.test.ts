/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The migrations are outside the Vite root, so they are read from disk (test only; `npm test` runs in frontend/).
function readMigration(fileName: string): string {
  return readFileSync(resolve(process.cwd(), '..', 'supabase', 'migrations', fileName), 'utf8').replace(/\r\n/g, '\n')
}

/** The first live (uncommented) `worker_contracts_audit()` body, from `create or replace` to its `$$;`. */
function liveAuditFunctionBody(migrationText: string): string {
  const startIndex = migrationText.search(/^create or replace function public\.worker_contracts_audit\(\)/m)
  expect(startIndex, 'live worker_contracts_audit() block').toBeGreaterThanOrEqual(0)
  const endIndex = migrationText.indexOf('\n$$;', startIndex)
  expect(endIndex).toBeGreaterThan(startIndex)
  return migrationText.slice(startIndex, endIndex + '\n$$;'.length)
}

const w9WorkerBody = "'Your contract with ' || shop_label || ' reached its end date and has expired.'"
const w9OwnerBody = "'A contract reached its end date and has expired.'"
const w13WorkerBody =
  "'Your contract with ' || shop_label || ' reached the end date written in it, so WashLink now shows it as expired. What this means for your work depends on the contract terms and the law.'"
// Fix cycle 1 (W13 C2, W13-L8): the owner notice carries the same "contract terms and the law" caveat as the worker one.
const w13OwnerBody =
  "'A contract reached the end date written in it, so WashLink now shows it as expired. What this means for you and the worker depends on the contract terms and the law.'"

describe('Contract expiry notice wording (W13, D-72)', () => {
  it('w13_expiry_notice_body_differs_from_w9_only_in_two_strings', () => {
    const w9Body = liveAuditFunctionBody(readMigration('2026_10_26_w9j_worker_contract_audit_and_notifications.sql'))
    const w13Migration = readMigration('2026_10_30_w13d_contract_expiry_notice_wording.sql')
    const w13Body = liveAuditFunctionBody(w13Migration)

    // W9 had each old string once; W13 has each new string once and no old one.
    expect(w9Body.split(w9WorkerBody)).toHaveLength(2)
    expect(w9Body.split(w9OwnerBody)).toHaveLength(2)
    expect(w13Body.split(w13WorkerBody)).toHaveLength(2)
    expect(w13Body.split(w13OwnerBody)).toHaveLength(2)
    expect(w13Body).not.toContain('has expired')
    expect(w13OwnerBody).toContain('depends on the contract terms and the law')
    // The title shown in the UI and the notify calls are unchanged.
    expect(w13Body.split("'Contract expired'")).toHaveLength(w9Body.split("'Contract expired'").length)

    // Swapping the two strings back gives the W9 body exactly.
    expect(w13Body.replace(w13WorkerBody, w9WorkerBody).replace(w13OwnerBody, w9OwnerBody)).toBe(w9Body)
    const w9Lines = w9Body.split('\n')
    const w13Lines = w13Body.split('\n')
    expect(w13Lines).toHaveLength(w9Lines.length)
    expect(w13Lines.filter((line, lineIndex) => line !== w9Lines[lineIndex])).toHaveLength(2)

    // Only one live replacement in w13d; the W9 body is kept in the commented ROLLBACK block.
    expect(w13Migration.match(/^create or replace function/gm)).toHaveLength(1)
    expect(w13Migration).toMatch(/^-- ROLLBACK/m)
    // No notice text claims a legal effect or another delivery channel.
    expect(`${w13WorkerBody} ${w13OwnerBody}`).not.toMatch(/\blawful\b|\bterminated\b|\bemail\b|\bsms\b|\bpush\b/i)
  })
})
