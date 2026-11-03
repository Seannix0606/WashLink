/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The names are assembled so a plain `grep -rn` of frontend/src for them (AC6, AC12) stays empty.
const rawAuditTable = ['workforce', 'audit', 'events'].join('_')
const reviewLogView = ['shop', 'verification', 'review', 'log'].join('_')
const trustedRoleName = ['service', 'role'].join('_')

const sourceRoot = resolve(process.cwd(), 'src')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entryName) => {
    const entryPath = join(directory, entryName)
    if (statSync(entryPath).isDirectory()) {
      return sourceFiles(entryPath)
    }
    return /\.(ts|tsx)$/.test(entryName) ? [entryPath] : []
  })
}

describe('Frontend audit reads (W13, D-70, J17)', () => {
  it('j17_w13_frontend_never_reads_raw_audit_table_or_review_log', () => {
    const everyFile = sourceFiles(sourceRoot)
    expect(everyFile.length).toBeGreaterThan(100)
    const offendingFiles = everyFile
      .filter((filePath) => {
        const fileText = readFileSync(filePath, 'utf8')
        return fileText.includes(rawAuditTable) || fileText.includes(reviewLogView) || fileText.includes(trustedRoleName)
      })
      .map((filePath) => relative(sourceRoot, filePath))
    expect(offendingFiles).toEqual([])

    // Super_admin audit reads go only through the audited RPC, from the oversight repository alone.
    const auditRpcFiles = everyFile
      .filter((filePath) => !/\.test\.tsx?$/.test(filePath))
      .filter((filePath) => readFileSync(filePath, 'utf8').includes("'admin_workforce_audit_log'"))
      .map((filePath) => relative(sourceRoot, filePath).replace(/\\/g, '/'))
    expect(auditRpcFiles).toEqual(['infrastructure/repositories/SupabaseAdminOversightRepository.ts'])
  })
})
