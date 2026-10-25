import { testOwnerIdentifier } from './fixtures'

// In-memory stand-in for the Supabase client used by SupabaseJobOpeningRepository tests.
// Every builder call is recorded; awaiting a builder resolves `queryResult`.

export type RecordedCall = readonly [methodName: string, methodArguments: unknown[]]

interface DoubleResult {
  data: unknown
  error: { code: string; message: string } | null
}

export const jobOpeningSupabaseDouble = {
  recordedCalls: [] as RecordedCall[],
  queryResult: { data: [], error: null } as DoubleResult,
  singleResult: { data: null, error: null } as DoubleResult,
  rpcResult: { data: null, error: null } as DoubleResult,
}

export function resetJobOpeningSupabaseDouble(): void {
  jobOpeningSupabaseDouble.recordedCalls.length = 0
  jobOpeningSupabaseDouble.queryResult = { data: [], error: null }
  jobOpeningSupabaseDouble.singleResult = { data: null, error: null }
  jobOpeningSupabaseDouble.rpcResult = { data: null, error: null }
}

export function recordedArgumentsOf(methodName: string): unknown[][] {
  return jobOpeningSupabaseDouble.recordedCalls
    .filter(([recordedMethodName]) => recordedMethodName === methodName)
    .map(([, methodArguments]) => methodArguments)
}

type QueryBuilderDouble = Record<string, (...methodArguments: unknown[]) => unknown>

function createQueryBuilder(): QueryBuilderDouble {
  const queryBuilder: QueryBuilderDouble = {}
  for (const methodName of ['select', 'eq', 'neq', 'order', 'limit', 'insert', 'update', 'delete']) {
    queryBuilder[methodName] = (...methodArguments: unknown[]): unknown => {
      jobOpeningSupabaseDouble.recordedCalls.push([methodName, methodArguments])
      return queryBuilder
    }
  }
  queryBuilder.single = (): Promise<DoubleResult> =>
    Promise.resolve(jobOpeningSupabaseDouble.singleResult)
  queryBuilder.then = (onFulfilled: unknown): Promise<unknown> =>
    Promise.resolve(jobOpeningSupabaseDouble.queryResult).then(
      onFulfilled as (result: DoubleResult) => unknown,
    )
  return queryBuilder
}

function createRpcBuilder(): QueryBuilderDouble {
  return {
    single: (): Promise<DoubleResult> => Promise.resolve(jobOpeningSupabaseDouble.rpcResult),
    then: (onFulfilled: unknown): Promise<unknown> =>
      Promise.resolve(jobOpeningSupabaseDouble.rpcResult).then(
        onFulfilled as (result: DoubleResult) => unknown,
      ),
  }
}

export function createJobOpeningSupabaseClientDouble(): unknown {
  return {
    from: (...methodArguments: unknown[]): unknown => {
      jobOpeningSupabaseDouble.recordedCalls.push(['from', methodArguments])
      return createQueryBuilder()
    },
    rpc: (...methodArguments: unknown[]): unknown => {
      jobOpeningSupabaseDouble.recordedCalls.push(['rpc', methodArguments])
      return createRpcBuilder()
    },
    auth: {
      getSession: (): Promise<unknown> =>
        Promise.resolve({
          data: { session: { user: { id: testOwnerIdentifier } } },
          error: null,
        }),
    },
  }
}
