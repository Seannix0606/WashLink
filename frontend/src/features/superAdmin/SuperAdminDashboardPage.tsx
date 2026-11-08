import { featureFlags } from '../../application/featureFlags'
import { B2cOperationsPanel } from '../b2c/admin/B2cOperationsPanel'
import type { ReactElement } from 'react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { createSuperAdminDependencies } from '../../presentation/dependencyInjection/createSuperAdminDependencies'
import { AppShell, Skeleton, Tabs } from '../../presentation/design/ui'
import { AuthenticatedTopBar } from '../../presentation/components/AuthenticatedTopBar'
import {
  adminNextActionTab,
  defaultSuperAdminTab,
  superAdminTabItemsFor,
  type SuperAdminTabKey,
} from '../../presentation/components/superAdmin/superAdminTabs'

// W11: each console section loads only when the administrator opens it.
const AdminOverviewPanel = lazy(async () => {
  const overviewModule = await import('../../presentation/components/superAdmin/AdminOverviewPanel')
  return { default: overviewModule.AdminOverviewPanel }
})
const ShopVerificationSection = lazy(async () => {
  const shopModule = await import('../../presentation/components/superAdmin/ShopVerificationSection')
  return { default: shopModule.ShopVerificationSection }
})
const CertificationReviewQueuePanel = lazy(async () => {
  const reviewModule = await import('../../presentation/components/superAdmin/CertificationReviewQueuePanel')
  return { default: reviewModule.CertificationReviewQueuePanel }
})
const ContractDisputeQueuePanel = lazy(async () => {
  const disputeModule = await import('../../presentation/components/superAdmin/ContractDisputeQueuePanel')
  return { default: disputeModule.ContractDisputeQueuePanel }
})
// W14 (D-57): posting reports, standard contract, relationship lookups and the audit log.
const PostingReportQueuePanel = lazy(async () => {
  const postingModule = await import('../../presentation/components/superAdmin/moderation/PostingReportQueuePanel')
  return { default: postingModule.PostingReportQueuePanel }
})
const StandardContractPanel = lazy(async () => {
  const standardModule = await import('../../presentation/components/superAdmin/standardContract/StandardContractPanel')
  return { default: standardModule.StandardContractPanel }
})
const RelationshipLookupPanel = lazy(async () => {
  const relationshipModule = await import('../../presentation/components/superAdmin/relationships/RelationshipLookupPanel')
  return { default: relationshipModule.RelationshipLookupPanel }
})
const AdminAuditLogPanel = lazy(async () => {
  const auditModule = await import('../../presentation/components/superAdmin/audit/AdminAuditLogPanel')
  return { default: auditModule.AdminAuditLogPanel }
})
// W10: the workforce policy panel.
const WorkforcePolicyPanel = lazy(async () => {
  const policyModule = await import('../../presentation/components/superAdmin/WorkforcePolicyPanel')
  return { default: policyModule.WorkforcePolicyPanel }
})

interface SuperAdminDashboardPageProps {
  readonly superAdminIdentifier: string
}

/**
 * Super_admin console (D-42, D-57): Overview (default), Shop verification, Posting reports,
 * Certification reviews, Contract disputes, Standard contract, Relationships, Audit log, Policies.
 * Every read and action is checked by the database; this page only arranges the sections.
 */
export function SuperAdminDashboardPage({ superAdminIdentifier }: SuperAdminDashboardPageProps): ReactElement {
  const { shopService, shopVerificationService, workforcePolicyService, oversightDependencies } = useMemo(
    () => createSuperAdminDependencies(),
    [],
  )
  const [activeTab, setActiveTab] = useState<SuperAdminTabKey>(
    featureFlags.isB2cEnabled ? 'b2c_operations' : defaultSuperAdminTab,
  )
  const moderationDependencies = oversightDependencies.moderationDependencies
  const workforceTabItems = superAdminTabItemsFor(moderationDependencies !== undefined)
  // With shop features off, their tabs are hidden, not removed: VITE_FEATURE_B2B=true brings them back.
  const visibleWorkforceTabs = featureFlags.isB2bEnabled
    ? workforceTabItems
    : workforceTabItems.filter((tabItem) => tabItem.value === 'audit_log')
  const tabItems = featureFlags.isB2cEnabled
    ? [{ value: 'b2c_operations' as const, label: 'Bookings and washers' }, ...visibleWorkforceTabs]
    : workforceTabItems
  const panelFallback = <Skeleton heightClassName="h-40" />

  const renderActivePanel = (): ReactElement => {
    switch (activeTab) {
      case 'b2c_operations':
        return <B2cOperationsPanel />
      case 'overview':
        return (
          <AdminOverviewPanel
            workforceDashboardService={oversightDependencies.workforceDashboardService}
            adminOversightService={moderationDependencies?.adminOversightService}
            onNavigate={(target): void => {
              setActiveTab(adminNextActionTab(target))
            }}
          />
        )
      case 'shop_verification':
        return (
          <ShopVerificationSection
            superAdminIdentifier={superAdminIdentifier}
            shopService={shopService}
            shopVerificationService={shopVerificationService}
            adminOversightService={moderationDependencies?.adminOversightService}
          />
        )
      case 'posting_reports':
        return moderationDependencies === undefined ? panelFallback : (
          <PostingReportQueuePanel moderationService={moderationDependencies.jobOpeningModerationService} />
        )
      case 'standard_contract':
        return moderationDependencies === undefined ? panelFallback : (
          <StandardContractPanel
            platformTemplateService={moderationDependencies.platformContractTemplateService}
            contractTemplateService={moderationDependencies.contractTemplateService}
          />
        )
      case 'relationships':
        return moderationDependencies === undefined ? panelFallback : (
          <RelationshipLookupPanel adminOversightService={moderationDependencies.adminOversightService} workforcePolicyService={workforcePolicyService} />
        )
      case 'audit_log':
        return moderationDependencies === undefined ? panelFallback : (
          <AdminAuditLogPanel adminOversightService={moderationDependencies.adminOversightService} />
        )
      case 'certification_reviews':
        return <CertificationReviewQueuePanel platformReviewService={oversightDependencies.certificationPlatformReviewService} />
      case 'contract_disputes':
        return <ContractDisputeQueuePanel contractDisputeService={oversightDependencies.contractDisputeService} />
      case 'policies':
        return <WorkforcePolicyPanel workforcePolicyService={workforcePolicyService} />
    }
  }

  return (
    <AppShell topBar={<AuthenticatedTopBar />}>
      <div className="space-y-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[var(--color-ink-900)] sm:text-3xl">Platform administration</h1>
          <p className="text-sm text-[var(--color-ink-500)]">
            {featureFlags.isB2bEnabled ? null : 'Bookings, washers, prices and the audit log.'}
            {featureFlags.isB2bEnabled ? (<>
            Shop verification, posting reports, WashLink reviews of certification decisions, reported contract problems, the standard contract template, audited lookups and workforce policies.
            </>) : null}
          </p>
        </header>

        <div className="overflow-x-auto">
          <Tabs accessibleLabel="Administration sections" tabItems={tabItems} activeTabValue={activeTab} onTabChange={setActiveTab} />
        </div>

        <Suspense fallback={panelFallback}>{renderActivePanel()}</Suspense>
      </div>
    </AppShell>
  )
}
