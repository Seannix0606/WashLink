// Shared by b2c-api-smoke and b2c7-api-smoke: a washer uploads through the real Storage API and an admin approves through the real RPCs.
// Bytes are synthetic, never a real ID. Throws on any refusal, so a caller's flow stops at the true cause. uploadWorkerDocument runs the shared
// client's upload (packages/shared), the same code the web and mobile apps call, so that path has real Storage coverage.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertLocalTestProjectId, STAGED_DIRECTORY_NAME } from './stage-local-workdir.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
let sharedPackage

/** Compiles the dependency-free shared package to a temp folder, once, so this runs the source the apps run. */
function loadSharedPackage() {
  if (sharedPackage) return sharedPackage
  const ts = createRequire(path.join(repoRoot, 'frontend', 'package.json'))('typescript')
  const source = path.join(repoRoot, 'packages', 'shared', 'src')
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'washlink-shared-documents-'))
  for (const file of fs.readdirSync(source).filter((name) => name.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join(source, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    fs.writeFileSync(path.join(target, file.replace(/.ts$/, '.js')), outputText)
  }
  sharedPackage = createRequire(path.join(target, 'index.js'))('./index.js')
  return sharedPackage
}

/**
 * LOCAL STACK ONLY. D-123: uploads are off until a person turns them on with SQL, and no RPC can. This is that SQL, through a trusted local
 * psql in the container named by the asserted *-local-test project_id. A smoke or the browser seed runs this; real projects never do.
 */
export function setWorkerDocumentUploads(enabled) {
  const projectId = assertLocalTestProjectId(fs.readFileSync(path.join(repoRoot, STAGED_DIRECTORY_NAME, 'supabase', 'config.toml'), 'utf8'), 'staged config.toml')
  const result = spawnSync('docker', ['exec', '-i', `supabase_db_${projectId}`, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c',
    `update public.platform_settings set worker_document_uploads_enabled = ${enabled === true}`], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`could not change the uploads flag: ${(result.stderr ?? '').split('\n')[0]}`)
}

export const WORKER_DOCUMENT_BUCKET = 'worker-verification-documents'
export const SMOKE_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])
export const SMOKE_PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(`${name} refused: ${error.message}`)
  return data
}

/** Opens a slot and uploads, without submitting, so a test can act on the slot in between. */
export async function beginWorkerDocument(client, documentType) {
  const [slot] = await rpc(client, 'begin_worker_document_upload', { p_document_type: documentType })
  return { documentId: slot.document_id, objectName: slot.object_name }
}

export async function submitWorkerDocument(client, documentId) {
  const [row] = await rpc(client, 'submit_worker_document_upload', { p_document: documentId })
  return row
}

/** The shared client takes no name and returns none, so the object name a test needs is rebuilt the way the server builds it. */
export async function uploadWorkerDocument(client, documentType, bytes = SMOKE_JPEG) {
  const { data } = await client.auth.getSession()
  const { documentId } = await loadSharedPackage().createB2cApi(client).uploadWorkerDocument(documentType, bytes)
  return { documentId, objectName: `${data.session.user.id}/${documentId}` }
}

/** D-113: an admin opens a document before approving it. */
export async function approveWorkerDocument(adminClient, documentId) {
  await rpc(adminClient, 'admin_open_worker_document', { p_document: documentId })
  await rpc(adminClient, 'admin_review_worker_document', { p_document: documentId, p_decision: 'approved' })
}

/** Everything the verification gate needs. Returns each document's slot by type. */
export async function giveWorkerApprovedDocuments(workerClient, adminClient) {
  const slots = {}
  for (const documentType of ['government_id', 'selfie']) {
    slots[documentType] = await uploadWorkerDocument(workerClient, documentType)
    await approveWorkerDocument(adminClient, slots[documentType].documentId)
  }
  return slots
}
