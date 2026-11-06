/**
 * How every B2C call reaches Supabase and reports failure. The client is taken structurally, so the package stays free of
 * dependencies, of the DOM and of React. Bytes are ArrayBuffer or Uint8Array only: Blob and FormData don't work on React Native.
 */
export type QueryResult = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>

interface TableQuery extends QueryResult {
  select: (columns?: string) => TableQuery
  order: (column: string, options?: { ascending: boolean }) => TableQuery
  eq: (column: string, value: unknown) => TableQuery
  insert: (row: Record<string, unknown>) => TableQuery
  update: (row: Record<string, unknown>) => TableQuery
  delete: () => TableQuery
}

/** storage-js reports the HTTP status on `status` and the service's own on `statusCode`, and the two can differ. */
export interface StorageFailure {
  readonly message: string
  readonly status?: number
  readonly statusCode?: string
}

export interface StorageBucketClient {
  upload: (name: string, bytes: ArrayBuffer | Uint8Array, options: { contentType: string; upsert: boolean; headers: Record<string, string> }) => PromiseLike<{ data: unknown; error: StorageFailure | null }>
  download: (name: string) => PromiseLike<{ data: Blob | null; error: StorageFailure | null }>
}

export interface B2cSupabaseClient {
  rpc: (name: string, args?: Record<string, unknown>) => QueryResult
  from: (table: string) => TableQuery
  storage: { from: (bucket: string) => StorageBucketClient }
}

export const genericB2cFailure = 'Something went wrong. Check your connection and try again.'
const databaseRefusalCodes = new Set(['23505', '23514', '22023', '42501', '55000'])

export class B2cRequestError extends Error {
  readonly code: string | undefined
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'B2cRequestError'
    this.code = code
  }
}

export type Row = Record<string, unknown>

// Our functions raise sentences written for people. Anything else stays generic so internals are never shown.
function toFailure(error: { message: string; code?: string }): B2cRequestError {
  const isWritten = error.code !== undefined && databaseRefusalCodes.has(error.code)
    && /^[A-Z].*\.$/.test(error.message) && !error.message.includes('violates')
  return new B2cRequestError(isWritten ? error.message : genericB2cFailure, error.code)
}

export async function run(query: QueryResult): Promise<unknown> {
  const { data, error } = await query
  if (error) {
    throw toFailure(error)
  }
  return data
}

export async function rows(query: QueryResult): Promise<readonly Row[]> {
  const data = await run(query)
  return Array.isArray(data) ? (data as Row[]) : []
}

export const str = (value: unknown): string => (typeof value === 'string' ? value : '')
export const num = (value: unknown): number => Number(value ?? 0)
export const nullableNum = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value))
export const nullableStr = (value: unknown): string | null => (typeof value === 'string' ? value : null)
export const strs = (value: unknown): readonly string[] => (Array.isArray(value) ? (value as string[]) : [])
