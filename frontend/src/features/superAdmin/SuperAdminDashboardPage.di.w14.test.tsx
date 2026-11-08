import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createOversightDependencies } from '../../presentation/dependencyInjection/createOversightDependencies'
import { SuperAdminDashboardPage } from './SuperAdminDashboardPage'

// Only the Supabase client is replaced; the production DI factories (createSuperAdminDependencies -> createOversightDependencies) are real.
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../infrastructure/supabase/supabaseClient', () => {
  const resolved = { data: [], error: null }
  const chain = (): unknown => {
    const handler: ProxyHandler<() => void> = {
      get: (_target, property): unknown => {
        if (property === 'then') {
          return (resolve: (value: unknown) => void): void => {
            resolve(resolved)
          }
        }
        return chain()
      },
      apply: (): unknown => chain(),
    }
    return new Proxy(() => undefined, handler)
  }
  const auth = { getSession: (): Promise<unknown> => Promise.resolve({ data: { session: null }, error: null }) }
  return { isSupabaseConfigured: true, getSupabaseClient: (): unknown => ({ rpc, from: chain, auth }) }
})
vi.mock('../../presentation/components/AuthenticatedTopBar', () => ({ AuthenticatedTopBar: (): null => null }))

describe('Production DI wiring (W14, D-57)', () => {
  it('w14_production_di_gives_super_admin_nine_tabs', () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(createOversightDependencies().moderationDependencies).toBeDefined()
    render(<SuperAdminDashboardPage superAdminIdentifier="admin-1" />)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview', 'Shop verification', 'Posting reports', 'Certification reviews', 'Contract disputes',
      'Standard contract', 'Relationships', 'Audit log', 'Policies',
    ])
  })
})
