import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ContractTemplateService } from '../../application/services/ContractTemplateService'
import { buildModerationSummary, createModerationTestHarness, type ModerationTestHarness } from '../../test/moderationFixtures'
import { createOversightTestHarness, type OversightTestHarness } from '../../test/oversightFixtures'
import { SuperAdminDashboardPage } from './SuperAdminDashboardPage'

const pageDependencies = vi.hoisted(() => ({ oversight: null as unknown, moderation: null as unknown }))

vi.mock('../../presentation/dependencyInjection/createSuperAdminDependencies', () => ({
  createSuperAdminDependencies: (): unknown => {
    const oversight = pageDependencies.oversight as OversightTestHarness
    const moderation = pageDependencies.moderation as ModerationTestHarness
    return {
      shopService: {},
      shopVerificationService: {},
      workforcePolicyService: { loadPolicies: vi.fn().mockResolvedValue([]) },
      oversightDependencies: {
        ...oversight,
        moderationDependencies: { ...moderation, contractTemplateService: {} as ContractTemplateService },
      },
    }
  },
}))
vi.mock('../../presentation/components/AuthenticatedTopBar', () => ({ AuthenticatedTopBar: (): null => null }))
vi.mock('../../presentation/components/superAdmin/ShopVerificationSection', () => ({
  ShopVerificationSection: ({ adminOversightService }: { readonly adminOversightService?: unknown }): unknown => (
    <p>{adminOversightService === undefined ? 'Shop verification without W14' : 'Shop verification with W14 view'}</p>
  ),
}))

function setUpHarnesses(): { readonly oversight: OversightTestHarness; readonly moderation: ModerationTestHarness } {
  const oversight = createOversightTestHarness()
  const moderation = createModerationTestHarness()
  pageDependencies.oversight = oversight
  pageDependencies.moderation = moderation
  return { oversight, moderation }
}

describe('Super_admin console (W14, D-57)', () => {
  it('w14_super_admin_console_nine_tabs_default_overview', async () => {
    const user = userEvent.setup()
    const { moderation } = setUpHarnesses()
    render(<SuperAdminDashboardPage superAdminIdentifier="admin-1" />)

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Shop verification',
      'Posting reports',
      'Certification reviews',
      'Contract disputes',
      'Standard contract',
      'Relationships',
      'Audit log',
      'Policies',
    ])
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('region', { name: 'Overview' })).toBeInTheDocument()
    // Only the overview reads at first; audited reads wait for their tab and an explicit action.
    expect(moderation.moderationRepository.listAdminQueue).not.toHaveBeenCalled()
    expect(moderation.oversightRepository.searchAuditLog).not.toHaveBeenCalled()
    expect(moderation.oversightRepository.lookupRelationships).not.toHaveBeenCalled()

    await user.click(screen.getByRole('tab', { name: 'Posting reports' }))
    expect(await screen.findByText('No posting reports here')).toBeInTheDocument()
    expect(moderation.moderationRepository.listAdminQueue).toHaveBeenCalledWith('active')
    await user.click(screen.getByRole('tab', { name: 'Standard contract' }))
    expect(await screen.findByRole('button', { name: 'Edit a new version' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Relationships' }))
    expect(await screen.findByRole('form', { name: 'Look up relationships' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Audit log' }))
    expect(await screen.findByText('Choose filters and search. Nothing is read until you search.')).toBeInTheDocument()
    expect(moderation.oversightRepository.searchAuditLog).not.toHaveBeenCalled()
    await user.click(screen.getByRole('tab', { name: 'Shop verification' }))
    expect(await screen.findByText('Shop verification with W14 view')).toBeInTheDocument()
  })

  it('w14_admin_overview_moderation_counts', async () => {
    const user = userEvent.setup()
    const { moderation } = setUpHarnesses()
    moderation.oversightRepository.fetchModerationSummary.mockResolvedValue(
      buildModerationSummary({ openReportCaseCount: 2, changesSubmittedCount: 1, unreviewedApprovedShopCount: 3, oversightFlagCount: 1, relationshipLookupsLast30Days: 4 }),
    )
    render(<SuperAdminDashboardPage superAdminIdentifier="admin-1" />)

    const moderationSection = await screen.findByRole('region', { name: 'Moderation and oversight' })
    expect(moderationSection).toHaveTextContent('Relationship lookups in 30 days')
    expect(moderationSection).toHaveTextContent('4')
    const nextActions = within(moderationSection).getAllByRole('button').map((button) => button.textContent)
    expect(nextActions[0]).toMatch(/1 paused opening where the owner asked WashLink to check changes/)
    expect(nextActions[1]).toMatch(/2 new posting report cases to review/)
    expect(nextActions[2]).toMatch(/3 approved shops without a recorded review/)
    expect(nextActions[3]).toMatch(/1 long-open dispute read often/)

    await user.click(within(moderationSection).getByRole('button', { name: /long-open dispute/ }))
    expect(screen.getByRole('tab', { name: 'Audit log' })).toHaveAttribute('aria-selected', 'true')
  })
})
