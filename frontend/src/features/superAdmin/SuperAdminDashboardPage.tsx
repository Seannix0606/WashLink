import type { ReactElement } from 'react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { createSuperAdminDependencies } from '../../presentation/dependencyInjection/createSuperAdminDependencies'
import { AppShell, Skeleton, Tabs } from '../../presentation/design/ui'
import { AuthenticatedTopBar } from '../../presentation/components/AuthenticatedTopBar'
import {
  adminNextActionTab,
  defaultSuperAdminTab,
  superAdminTabItems,
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
// W10: the workforce policy panel.
const WorkforcePolicyPanel = lazy(async () => {
  const policyModule = await import('../../presentation/components/superAdmin/WorkforcePolicyPanel')
  return { default: policyModule.WorkforcePolicyPanel }
})

interface SuperAdminDashboardPageProps {
  readonly superAdminIdentifier: string
}

/**
 * W11 super_admin console (D-42): Overview (default), Shop verification, Certification reviews,
 * Contract disputes, Policies. Every read and action is checked by the database; this page only
 * arranges the sections.
 */
export function SuperAdminDashboardPage({ superAdminIdentifier }: SuperAdminDashboardPageProps): ReactElement {
  const { shopService, shopVerificationService, workforcePolicyService, oversightDependencies } = useMemo(
    () => createSuperAdminDependencies(),
    [],
  )
  const [activeTab, setActiveTab] = useState<SuperAdminTabKey>(defaultSuperAdminTab)
  const panelFallback = <Skeleton heightClassName="h-40" />

  const renderActivePanel = (): ReactElement => {
    switch (activeTab) {
      case 'overview':
        return (
          <AdminOverviewPanel
            workforceDashboardService={oversightDependencies.workforceDashboardService}
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
          />
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
            Shop verification, WashLink reviews of certification decisions, reported contract problems and workforce policies.
          </p>
        </header>

        <div className="overflow-x-auto">
          <Tabs accessibleLabel="Administration sections" tabItems={superAdminTabItems} activeTabValue={activeTab} onTabChange={setActiveTab} />
        </div>

        <Suspense fallback={panelFallback}>{renderActivePanel()}</Suspense>
      </div>
    </AppShell>
  )
}
