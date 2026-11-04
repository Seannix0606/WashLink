/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// W13 docs (PLAN section 7, AC3, AC13, AC14). The docs live outside the Vite root and are read from
// disk (test only; `npm test` runs in frontend/).
const repositoryRoot = resolve(process.cwd(), '..')
const docsDirectory = join(repositoryRoot, 'docs', 'workforce')
const newDocNames = ['ARCHITECTURE.md', 'ROLLBACK_GUIDE.md', 'LIMITATIONS.md', 'DEPLOYMENT_READINESS.md', 'ACCEPTANCE_TESTS.md'] as const
const registerIndexPath = join(docsDirectory, 'LEGAL_REVIEW_REGISTER.md')
const registerPartPaths = [join(docsDirectory, 'legal', 'REGISTER_PART_1_W0_W8.md'), join(docsDirectory, 'legal', 'REGISTER_PART_2_W9_W14.md')]

// FRONTEND BUILD GATE (remove once the W13 DOCS step has run): the docs are written after the
// frontend build step. As soon as any W13 doc exists, every check below runs and must pass.
const isW13DocsStepStarted = [...newDocNames.map((docName) => join(docsDirectory, docName)), ...registerPartPaths].some((docPath) => existsSync(docPath))

function readDoc(docPath: string): string {
  return readFileSync(docPath, 'utf8').replace(/\r\n/g, '\n')
}

/** Removes spaces and hyphens, so "W9 S2", "W9-S2" and "W9S2" compare equal. */
function compact(text: string): string {
  return text.replace(/[\s-]/g, '').toUpperCase()
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entryName) => {
    const entryPath = join(directory, entryName)
    return statSync(entryPath).isDirectory() ? filesUnder(entryPath) : [entryName]
  })
}

/** Register rows: `| <ID> | <STATUS> | ...`; the overlap map and sign-off tables carry no status cell. */
function registerRows(registerText: string): { readonly id: string; readonly status: string }[] {
  return [...registerText.matchAll(/^\|\s*(W\d+-L\d+[a-z]?)\s*\|\s*([A-Z][A-Z_ ]*?)\s*\|/gm)].map((rowMatch) => ({
    id: rowMatch[1],
    status: rowMatch[2],
  }))
}

// Every ACCEPTED source in PLAN section 2 (D-74); LIMITATIONS.md must name each one.
const acceptedSources = ['W9-S1', 'W9 S2', 'W9 S3', 'W9 S4', 'W9 C4', 'W9 C5', 'W10 S4', 'W10 C8', 'W2 R-6', 'W2-L3', 'W6-L13', 'W3-L1', 'W12-L6', 'D-68', 'W9-L13', 'W9-L16']

describe.skipIf(!isW13DocsStepStarted)('Workforce docs (W13)', () => {
  it('w13_workforce_docs_exist_with_required_sections', () => {
    for (const docName of [...newDocNames, 'LEGAL_REVIEW_REGISTER.md', 'ARCHITECTURE_AUDIT.md']) {
      const docPath = join(docsDirectory, docName)
      expect(existsSync(docPath), docName).toBe(true)
      expect(readDoc(docPath).split('\n').length, `${docName} is at most 350 lines`).toBeLessThanOrEqual(351)
    }
    const rollbackGuide = readDoc(join(docsDirectory, 'ROLLBACK_GUIDE.md'))
    expect(rollbackGuide).toContain('unregister_workforce_jobs.sql')
    expect(rollbackGuide).toMatch(/\bD-10\b/)
    expect(rollbackGuide).toMatch(/\bD-11\b/)
    // One line gives the full reverse order: W13, W12, W14, W11, W10, W9 ... W2.
    const reverseOrder = ['W13', 'W12', 'W14', 'W11', 'W10', 'W9', 'W8', 'W7', 'W6', 'W5', 'W4', 'W3', 'W2']
    const hasOrderLine = rollbackGuide.split('\n').some((line) => {
      const positions = reverseOrder.map((increment) => line.search(new RegExp(`\\b${increment}\\b`)))
      return positions.every((position, index) => position >= 0 && (index === 0 || position > (positions[index - 1] ?? -1)))
    })
    expect(hasOrderLine, 'ROLLBACK_GUIDE.md has one line with the order W13 -> W12 -> W14 -> W11 ... -> W2').toBe(true)

    const limitations = readDoc(join(docsDirectory, 'LIMITATIONS.md'))
    const compactLimitations = compact(limitations)
    for (const acceptedSource of acceptedSources) {
      expect(compactLimitations, `LIMITATIONS.md names ${acceptedSource}`).toContain(compact(acceptedSource))
    }
    expect(limitations).toMatch(/Not tested/i)
    const readiness = readDoc(join(docsDirectory, 'DEPLOYMENT_READINESS.md'))
    expect(readiness).toMatch(/\bD-10\b/)
    expect(readiness).toMatch(/\bD-11\b/)
    // Human gates are unchecked boxes; the loop ticks none.
    expect(readiness).toMatch(/^\s*- \[ \]/m)
    expect(readiness).not.toMatch(/^\s*- \[x\]/im)
    // No compliance claim in any new doc.
    for (const docName of newDocNames) {
      expect(readDoc(join(docsDirectory, docName)), docName).not.toMatch(/\bis (legally )?compliant\b|\bfully compliant\b|\bcomplies with\b/i)
    }
  })

  it('w13_acceptance_index_lists_only_existing_test_files', () => {
    const acceptanceIndex = readDoc(join(docsDirectory, 'ACCEPTANCE_TESTS.md'))
    const databaseTestDirectory = join(repositoryRoot, 'supabase', 'tests', 'database')
    const databaseTestFiles = new Set(readdirSync(databaseTestDirectory))
    const frontendTestFiles = new Set(filesUnder(resolve(process.cwd(), 'src')).filter((fileName) => /\.test\.tsx?$/.test(fileName)))
    const backtickedNames = [...acceptanceIndex.matchAll(/`([^`\s]+)`/g)].map((nameMatch) => nameMatch[1])

    // Every named test file exists.
    for (const fileName of backtickedNames.filter((name) => /\.test\.(sql|tsx?)$/.test(name))) {
      const baseName = fileName.split('/').at(-1) ?? fileName
      const isFound = baseName.endsWith('.sql') ? databaseTestFiles.has(baseName) : frontendTestFiles.has(baseName)
      expect(isFound, `${fileName} exists`).toBe(true)
    }
    // Every J1-J18 names a scenario-named pgTAP file that exists, and Vitest files tagged for it exist.
    for (let scenarioNumber = 1; scenarioNumber <= 18; scenarioNumber += 1) {
      const prefix = `j${String(scenarioNumber)}_`
      const hasExistingScenarioFile = backtickedNames.some(
        (name) => name.startsWith(prefix) && (databaseTestFiles.has(name) || databaseTestFiles.has(`${name}.test.sql`)),
      )
      expect(hasExistingScenarioFile, `ACCEPTANCE_TESTS.md names an existing ${prefix}* pgTAP file`).toBe(true)
      expect(
        [...frontendTestFiles].some((fileName) => fileName.includes(`.j${String(scenarioNumber)}.test.`)),
        `a *.j${String(scenarioNumber)}.test.* Vitest file exists`,
      ).toBe(true)
    }
    // The two W13 roll-ups and the renamed-tests table (D-76).
    expect(acceptanceIndex).toContain('j17_database_constraints_and_authorization_prevent_unauthorized_access')
    expect(acceptanceIndex).toContain('j18_existing_booking_pricing_verification_and_rating_workflows_still_work')
    expect(acceptanceIndex).toMatch(/Renamed tests/i)
    expect(acceptanceIndex).toContain('w12_contract_expiry_job_second_run_changes_nothing')
  })

  it('w13_legal_register_index_matches_parts_and_all_open', () => {
    const registerIndex = readDoc(registerIndexPath)
    const partTexts = registerPartPaths.map((partPath) => {
      expect(existsSync(partPath), partPath).toBe(true)
      return readDoc(partPath)
    })
    const indexRows = registerRows(registerIndex)
    const partRows = partTexts.map(registerRows)
    const everyRow = [...indexRows, ...partRows.flat()]

    // 153 earlier items plus W13-L1..L11 (L8..L11 from the W13 compliance review) and W15-L1..L3 (L2, L3 from the W15 compliance review), each a row exactly once across the index and the two parts.
    const rowIds = everyRow.map((row) => row.id)
    expect(new Set(rowIds).size).toBe(rowIds.length)
    expect(rowIds).toHaveLength(167)
    for (const w15ItemId of ['W15-L1', 'W15-L2', 'W15-L3']) {
      expect(rowIds).toContain(w15ItemId)
    }
    for (let itemNumber = 1; itemNumber <= 11; itemNumber += 1) {
      expect(rowIds).toContain(`W13-L${String(itemNumber)}`)
    }
    // Earlier items sit in exactly one part (W13 and W15 rows live in the index); nothing is closed by the loop.
    for (const row of [...partRows.flat()]) {
      expect(row.id.startsWith('W13-'), row.id).toBe(false)
      expect(row.id.startsWith('W15-'), row.id).toBe(false)
    }
    for (const row of everyRow) {
      expect(row.status, row.id).toBe('OPEN')
    }
    // The index names every ID (topic index), including those whose rows live in a part.
    for (const rowId of rowIds) {
      expect(registerIndex, `index names ${rowId}`).toMatch(new RegExp(`\\b${rowId}\\b`))
    }
    expect(registerIndex).not.toMatch(/\bis (legally )?compliant\b|\bfully compliant\b/i)
  })
})
