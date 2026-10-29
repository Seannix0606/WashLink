// node --test scripts/supabase-test/stage-local-workdir.test.mjs
// Runs the stager against a throwaway fake repo in the OS temp dir; never touches the real repo.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { assertWorkdirIsLocalTestProject, assertWorkdirNotLinked } from './run-db-tests.mjs'
import {
  BASELINE_MIGRATION_NAME,
  findSqlOutsideTestDatabase,
  findStraySqlUnderSupabase,
  HELPERS_SOURCE_NAMES,
  OWNER_POLICIES_MIGRATION_NAME,
  STAGED_DIRECTORY_NAME,
  stageLocalWorkdir,
} from './stage-local-workdir.mjs'

const REAL_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASELINE_DIRECTORY = ['scripts', 'supabase-test', 'baseline']

const LEGACY_MIGRATIONS = {
  '2026_04_17_add_shops_and_booking_location.sql': '-- shops\r\ncreate table x();\n',
  '2026_04_18_super_admin_and_shop_verification.sql': '-- admin — dash\n',
  '2026_10_21_shop_pricing_and_booking_quotes.sql': '-- pricing\n',
  '2026_10_22_add_booking_notes_and_ratings.sql': '-- notes\n',
  '2026_10_22_fix_shop_verification_storage_rls.sql': '-- storage\n',
}
// The repo keeps the seed disabled (W2 S10); the stager enables it only in the staged copy.
const FAKE_CONFIG =
  'project_id = "washlink"\n\n[db.seed]\nenabled = false\nsql_paths = ["./seed.sql"]\n\n' +
  '[db.network_restrictions]\nenabled = false\n'
const createdRoots = []

// Trimmed lines of one TOML section, e.g. sectionLines(text, '[db.seed]').
function sectionLines(configText, header) {
  const lines = configText.split(/\r?\n/).map((line) => line.trim())
  const start = lines.indexOf(header)
  assert.notEqual(start, -1, `${header} section exists`)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('['))
  return end === -1 ? rest : rest.slice(0, end)
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function sha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function createFakeRepo(extraMigrations = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'washlink-stager-'))
  createdRoots.push(root)
  writeFile(
    path.join(root, 'supabase', 'config.toml'),
    FAKE_CONFIG,
  )
  for (const [name, content] of Object.entries({ ...LEGACY_MIGRATIONS, ...extraMigrations })) {
    writeFile(path.join(root, 'supabase', 'migrations', name), content)
  }
  writeFile(
    path.join(root, ...BASELINE_DIRECTORY, 'local_test_baseline.sql'),
    '-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT\n',
  )
  writeFile(
    path.join(root, ...BASELINE_DIRECTORY, 'local_test_baseline_owner_policies.sql'),
    '-- LOCAL TEST BASELINE ONLY - owner policies\n',
  )
  for (const name of HELPERS_SOURCE_NAMES) writeFile(path.join(root, ...BASELINE_DIRECTORY, name), `-- helpers ${name}\n`)
  writeFile(path.join(root, 'supabase', 'tests', 'database', 'a.test.sql'), 'select 1;\n')
  writeFile(path.join(root, 'supabase', '.temp', 'project-ref'), 'fake-ref-for-test\n')
  return root
}

function snapshotDirectory(directory) {
  return fs
    .readdirSync(directory)
    .sort()
    .map((name) => `${name}:${sha256(path.join(directory, name))}`)
}

afterEach(() => {
  while (createdRoots.length > 0) {
    fs.rmSync(createdRoots.pop(), { recursive: true, force: true })
  }
})

test('stager_renames_legacy_names_in_order', () => {
  const root = createFakeRepo({ '20261101120000_already_timestamped.sql': '-- ts\n' })
  const result = stageLocalWorkdir({ repoRoot: root })
  const stagedNames = fs.readdirSync(path.join(result.outputDirectory, 'supabase', 'migrations')).sort()
  assert.deepEqual(stagedNames, [
    BASELINE_MIGRATION_NAME,
    '20260417000001_add_shops_and_booking_location.sql',
    OWNER_POLICIES_MIGRATION_NAME,
    '20260418000001_super_admin_and_shop_verification.sql',
    '20261021000001_shop_pricing_and_booking_quotes.sql',
    '20261022000001_add_booking_notes_and_ratings.sql',
    '20261022000002_fix_shop_verification_storage_rls.sql',
    '20261101120000_already_timestamped.sql',
  ])
})

test('stager_copies_migrations_byte_identical', () => {
  const root = createFakeRepo()
  const result = stageLocalWorkdir({ repoRoot: root })
  for (const { sourceName, stagedName } of result.migrations) {
    const sourcePath = sourceName.startsWith('scripts/')
      ? path.join(root, ...sourceName.split('/'))
      : path.join(root, 'supabase', 'migrations', sourceName)
    assert.equal(
      sha256(path.join(result.outputDirectory, 'supabase', 'migrations', stagedName)),
      sha256(sourcePath),
      `${stagedName} differs from ${sourceName}`,
    )
  }
  assert.equal(result.migrations.length, 7)
})

test('stager_puts_baseline_first', () => {
  const root = createFakeRepo()
  const result = stageLocalWorkdir({ repoRoot: root })
  const stagedMigrations = path.join(result.outputDirectory, 'supabase', 'migrations')
  const firstName = fs.readdirSync(stagedMigrations).sort()[0]
  assert.equal(firstName, BASELINE_MIGRATION_NAME)
  assert.equal(
    sha256(path.join(stagedMigrations, firstName)),
    sha256(path.join(root, ...BASELINE_DIRECTORY, 'local_test_baseline.sql')),
  )
  const config = fs.readFileSync(path.join(result.outputDirectory, 'supabase', 'config.toml'), 'utf8')
  assert.match(config, /^project_id = "washlink-local-test"$/m)
  assert.match(config, /^sql_paths = \["\.\/local_test_baseline\/test_helpers\.sql", /m)
  const stagedSupabase = path.join(result.outputDirectory, 'supabase')
  for (const name of HELPERS_SOURCE_NAMES) {
    assert.equal(sha256(path.join(stagedSupabase, 'local_test_baseline', name)), sha256(path.join(root, ...BASELINE_DIRECTORY, name)))
  }
  // Only the helper seeds are staged outside migrations/; the baseline migrations are not.
  assert.deepEqual(fs.readdirSync(path.join(stagedSupabase, 'local_test_baseline')).sort(), [...HELPERS_SOURCE_NAMES].sort())
  assert.ok(fs.existsSync(path.join(stagedSupabase, 'tests', 'database', 'a.test.sql')))
  // test db runs every .sql under tests/, so the baseline must not be staged there.
  assert.ok(!fs.existsSync(path.join(stagedSupabase, 'tests', 'baseline')))
})

test('stager_rejects_unknown_migration_names', () => {
  const root = createFakeRepo({ 'add_something_without_date.sql': '-- bad\n' })
  fs.mkdirSync(path.join(root, STAGED_DIRECTORY_NAME, 'keep'), { recursive: true })
  assert.throws(() => stageLocalWorkdir({ repoRoot: root }), /Unknown migration file name/)
  // Validation runs before the previous staged dir is deleted.
  assert.ok(fs.existsSync(path.join(root, STAGED_DIRECTORY_NAME, 'keep')))
})

test('stager_never_writes_into_supabase_migrations', () => {
  const root = createFakeRepo()
  const migrationsDirectory = path.join(root, 'supabase', 'migrations')
  const before = snapshotDirectory(migrationsDirectory)
  stageLocalWorkdir({ repoRoot: root })
  assert.deepEqual(snapshotDirectory(migrationsDirectory), before)
  assert.throws(() => stageLocalWorkdir({ repoRoot: root, outputDirectory: migrationsDirectory }), /Refusing to stage inside supabase\/migrations/)
  assert.throws(() => stageLocalWorkdir({ repoRoot: root, outputDirectory: path.join(root, 'elsewhere') }), /Refusing to stage outside/)
  assert.deepEqual(snapshotDirectory(migrationsDirectory), before)
})

test('stager_writes_no_project_ref', () => {
  const root = createFakeRepo()
  fs.mkdirSync(path.join(root, STAGED_DIRECTORY_NAME, 'supabase', '.temp'), { recursive: true })
  writeFile(path.join(root, STAGED_DIRECTORY_NAME, 'supabase', '.temp', 'project-ref'), 'stale\n')
  const result = stageLocalWorkdir({ repoRoot: root })
  assert.ok(!fs.existsSync(path.join(result.outputDirectory, 'supabase', '.temp')))
  assert.ok(!fs.existsSync(path.join(result.outputDirectory, '.temp')))
  assert.ok(fs.existsSync(path.join(result.outputDirectory, 'STAGED_LOCAL_TEST_ONLY.txt')))
})

test('stager_puts_owner_policies_right_after_2026_04_17', () => {
  const root = createFakeRepo({ '20261101120000_w2_replaces_owner_policies.sql': '-- w2\n' })
  const result = stageLocalWorkdir({ repoRoot: root })
  const stagedMigrations = path.join(result.outputDirectory, 'supabase', 'migrations')
  // The CLI applies migrations in lexical version order.
  const order = fs.readdirSync(stagedMigrations).sort()
  const ownerIndex = order.indexOf(OWNER_POLICIES_MIGRATION_NAME)
  assert.equal(order[ownerIndex - 1], '20260417000001_add_shops_and_booking_location.sql')
  assert.equal(order[ownerIndex + 1], '20260418000001_super_admin_and_shop_verification.sql')
  // Every later committed migration (e.g. W2) runs after the owner policies and can replace them.
  assert.ok(order.indexOf('20261101120000_w2_replaces_owner_policies.sql') > ownerIndex)
  assert.equal(
    sha256(path.join(stagedMigrations, OWNER_POLICIES_MIGRATION_NAME)),
    sha256(path.join(root, ...BASELINE_DIRECTORY, 'local_test_baseline_owner_policies.sql')),
  )
  assert.deepEqual(
    result.migrations.map(({ stagedName }) => stagedName),
    order,
    'returned plan matches the lexical apply order',
  )
})

test('stager_rejects_migration_in_owner_policies_slot', () => {
  for (const extra of [
    { '2026_04_17_second_same_day.sql': '-- collides as 20260417000002\n' },
    { '20260417000002_timestamped_collision.sql': '-- collides\n' },
    { '20260417000001_same_version_as_predecessor.sql': '-- duplicate version\n' },  ]) {
    const root = createFakeRepo(extra)
    assert.throws(
      () => stageLocalWorkdir({ repoRoot: root }),
      /breaks the slot|Duplicate staged migration version/,
      Object.keys(extra)[0],
    )
  }
})

test('stager_rejects_missing_2026_04_17_predecessor', () => {
  const root = createFakeRepo()
  fs.rmSync(path.join(root, 'supabase', 'migrations', '2026_04_17_add_shops_and_booking_location.sql'))
  assert.throws(() => stageLocalWorkdir({ repoRoot: root }), /needs 2026_04_17_add_shops_and_booking_location/)
})

test('stager_rejects_sql_outside_tests_database', () => {
  const root = createFakeRepo()
  writeFile(path.join(root, 'supabase', 'tests', 'baseline', 'local_test_baseline.sql'), '-- stray\n')
  writeFile(path.join(root, 'supabase', 'tests', 'top.sql'), '-- stray\n')
  fs.mkdirSync(path.join(root, STAGED_DIRECTORY_NAME, 'keep'), { recursive: true })
  assert.deepEqual(findSqlOutsideTestDatabase(path.join(root, 'supabase', 'tests')), ['baseline/local_test_baseline.sql', 'top.sql'])
  assert.throws(() => stageLocalWorkdir({ repoRoot: root }), /outside supabase\/tests\/database/)
  assert.ok(fs.existsSync(path.join(root, STAGED_DIRECTORY_NAME, 'keep')))
})

// Read-only scan of the REAL repo: `supabase test db --linked/--db-url` from the repo root would
// execute every .sql under supabase/tests/, so only pgTAP files under database/ may exist there.
test('repo_has_no_sql_under_supabase_tests_outside_database', () => {
  const realTests = path.join(REAL_REPO_ROOT, 'supabase', 'tests')
  assert.ok(fs.existsSync(path.join(realTests, 'database')))
  assert.deepEqual(findSqlOutsideTestDatabase(realTests), [])
  for (const name of ['local_test_baseline.sql', 'local_test_baseline_owner_policies.sql', ...HELPERS_SOURCE_NAMES]) {
    assert.ok(fs.existsSync(path.join(REAL_REPO_ROOT, ...BASELINE_DIRECTORY, name)), name)
  }
})

test('runner_refuses_linked_workdir', () => {
  const root = createFakeRepo()
  const result = stageLocalWorkdir({ repoRoot: root })
  assert.doesNotThrow(() => assertWorkdirNotLinked(result.outputDirectory))
  for (const relative of [['supabase', '.temp', 'project-ref'], ['.temp', 'project-ref']]) {
    const refPath = path.join(result.outputDirectory, ...relative)
    writeFile(refPath, 'fake-ref-for-test\n')
    assert.throws(() => assertWorkdirNotLinked(result.outputDirectory), /workdir is linked/)
    fs.rmSync(refPath)
  }
})

// W7 / W8 / W10 / W11 / W14 / W12: every helper file is seeded, in order, and a missing one is refused before staging.
test('stager_seeds_every_helper_file_in_order', () => {
  const suffixes = ['', '_certifications', '_contract_templates', '_worker_contracts', '_owner_relationships', '_oversight', '_moderation', '_scheduling']
  assert.deepEqual(HELPERS_SOURCE_NAMES, suffixes.map((suffix) => `test_helpers${suffix}.sql`))
  const root = createFakeRepo()
  const result = stageLocalWorkdir({ repoRoot: root })
  const seed = sectionLines(fs.readFileSync(path.join(result.outputDirectory, 'supabase', 'config.toml'), 'utf8'), '[db.seed]')
  assert.ok(seed.includes(`sql_paths = [${suffixes.map((suffix) => `"./local_test_baseline/test_helpers${suffix}.sql"`).join(', ')}]`))
  fs.rmSync(path.join(root, ...BASELINE_DIRECTORY, 'test_helpers_certifications.sql'))
  fs.mkdirSync(path.join(root, STAGED_DIRECTORY_NAME, 'keep'), { recursive: true })
  assert.throws(() => stageLocalWorkdir({ repoRoot: root }), /Local test baseline file not found/)
  assert.ok(fs.existsSync(path.join(root, STAGED_DIRECTORY_NAME, 'keep')))
})

// ---------- W2 S10 / S11 ----------

test('stager_enables_seed_only_in_staged_copy', () => {
  const root = createFakeRepo()
  const repoConfigPath = path.join(root, 'supabase', 'config.toml')
  const before = sha256(repoConfigPath)
  const result = stageLocalWorkdir({ repoRoot: root })
  const staged = fs.readFileSync(path.join(result.outputDirectory, 'supabase', 'config.toml'), 'utf8')
  assert.ok(sectionLines(staged, '[db.seed]').includes('enabled = true'))
  assert.ok(!sectionLines(staged, '[db.seed]').includes('enabled = false'))
  // Other sections keep their own enabled flags.
  assert.ok(sectionLines(staged, '[db.network_restrictions]').includes('enabled = false'))
  assert.equal(sha256(repoConfigPath), before, 'repo config.toml is never rewritten')
  // A repo config with the seed enabled, or without the enabled line, is refused before staging.
  for (const badConfig of [
    FAKE_CONFIG.replace('[db.seed]\nenabled = false', '[db.seed]\nenabled = true'),
    FAKE_CONFIG.replace('[db.seed]\nenabled = false\n', '[db.seed]\n'),
  ]) {
    fs.writeFileSync(repoConfigPath, badConfig)
    fs.mkdirSync(path.join(root, STAGED_DIRECTORY_NAME, 'keep'), { recursive: true })
    assert.throws(() => stageLocalWorkdir({ repoRoot: root }), /must keep the seed disabled/)
    assert.ok(fs.existsSync(path.join(root, STAGED_DIRECTORY_NAME, 'keep')))
  }
})

// Read-only check of the REAL repo config.
test('repo_config_seed_disabled', () => {
  const config = fs.readFileSync(path.join(REAL_REPO_ROOT, 'supabase', 'config.toml'), 'utf8')
  const seedSection = sectionLines(config, '[db.seed]')
  assert.ok(seedSection.includes('enabled = false'))
  assert.ok(!seedSection.includes('enabled = true'))
})

test('stager_rejects_sql_anywhere_under_supabase_outside_migrations_and_tests_database', () => {
  const strays = [
    ['seed.sql'], ['seeds', 'demo.sql'], ['migrations', 'nested', 'hidden.sql'],
    ['tests', 'database', 'nested', 'hidden.test.sql'], ['local_test_baseline', 'test_helpers.sql'],
    ['functions', 'upper_case.SQL'],
  ]
  for (const parts of strays) {
    const root = createFakeRepo()
    writeFile(path.join(root, 'supabase', ...parts), '-- stray\n')
    fs.mkdirSync(path.join(root, STAGED_DIRECTORY_NAME, 'keep'), { recursive: true })
    assert.deepEqual(findStraySqlUnderSupabase(path.join(root, 'supabase')), [parts.join('/')])
    assert.throws(
      () => stageLocalWorkdir({ repoRoot: root }),
      /outside supabase\/tests\/database\/ and supabase\/migrations\//,
      parts.join('/'),
    )
    assert.ok(fs.existsSync(path.join(root, STAGED_DIRECTORY_NAME, 'keep')), parts.join('/'))
  }
  const cleanRoot = createFakeRepo()
  assert.deepEqual(findStraySqlUnderSupabase(path.join(cleanRoot, 'supabase')), [])
})

// Read-only scan of the REAL repo.
test('repo_has_no_stray_sql_under_supabase', () => {
  assert.deepEqual(findStraySqlUnderSupabase(path.join(REAL_REPO_ROOT, 'supabase')), [])
})

test('stager_staged_project_id_ends_with_local_test', () => {
  const root = createFakeRepo()
  const result = stageLocalWorkdir({ repoRoot: root })
  const staged = fs.readFileSync(path.join(result.outputDirectory, 'supabase', 'config.toml'), 'utf8')
  const projectLines = staged.split('\n').filter((line) => line.trim().startsWith('project_id'))
  assert.deepEqual(projectLines, ['project_id = "washlink-local-test"'])
  assert.equal(assertWorkdirIsLocalTestProject(result.outputDirectory), 'washlink-local-test')
})

test('runner_refuses_non_local_test_project_id', () => {
  const root = createFakeRepo()
  const result = stageLocalWorkdir({ repoRoot: root })
  const stagedConfig = path.join(result.outputDirectory, 'supabase', 'config.toml')
  const original = fs.readFileSync(stagedConfig, 'utf8')
  for (const replacement of ['project_id = "washlink"', 'project_id = "washlink-local-test-x"', '']) {
    fs.writeFileSync(stagedConfig, original.replace('project_id = "washlink-local-test"', replacement))
    assert.throws(() => assertWorkdirIsLocalTestProject(result.outputDirectory), /must end with "-local-test"/, replacement)
  }
  fs.rmSync(stagedConfig)
  assert.throws(() => assertWorkdirIsLocalTestProject(result.outputDirectory), /not found/)
})
