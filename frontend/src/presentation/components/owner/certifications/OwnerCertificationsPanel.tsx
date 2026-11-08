import type { ReactElement } from 'react'
import { useState } from 'react'
import { Award, Info } from 'lucide-react'
import type { CertificationPlatformReviewService } from '../../../../application/services/CertificationPlatformReviewService'
import type { Shop } from '../../../../domain/models/Shop'
import type { CertificationDependencies } from '../../../dependencyInjection/createCertificationDependencies'
import { Card, EmptyState, Select } from '../../../design/ui'
import { useOwnerCertificationPlatformReviews } from '../../../hooks/useOwnerCertificationPlatformReviews'
import { renewalRuleText } from '../../../utilities/certificationCopy'
import { ShopIssuedNotice } from '../../certifications/ShopIssuedNotice'
import { OwnerShopCertifications } from './OwnerShopCertifications'
import { ShopCertificationValiditySection } from './ShopCertificationValiditySection'

interface OwnerCertificationsPanelProps {
  readonly certificationDependencies: CertificationDependencies
  readonly ownerShopList: readonly Shop[]
  /** W11: WashLink reviews of this owner's certificates; omitted by older callers. */
  readonly platformReviewService?: CertificationPlatformReviewService
  /** Injected in tests; defaults to the time of each render. */
  readonly currentInstant?: Date
}

/** Owner "Certifications" tab: per-shop validity, issued certificates, reviews and renewals. */
export function OwnerCertificationsPanel({
  certificationDependencies,
  ownerShopList,
  platformReviewService,
  currentInstant,
}: OwnerCertificationsPanelProps): ReactElement {
  const platformReviews = useOwnerCertificationPlatformReviews(platformReviewService)
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null)
  const selectedShop = ownerShopList.find((ownerShop) => ownerShop.id === selectedShopId) ?? ownerShopList.at(0) ?? null
  const isShopVerified = selectedShop?.verificationStatus === 'approved'

  return (
    <Card elevation="raised" className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <Award className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          Certifications
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{renewalRuleText}</p>
      </header>
      <ShopIssuedNotice />
      {platformReviews.errorMessage !== null ? (
        <p role="status" className="text-xs text-[var(--color-warning-600)]">{`WashLink review status is unavailable: ${platformReviews.errorMessage}`}</p>
      ) : null}

      {selectedShop === null ? (
        <EmptyState icon={<Award className="h-5 w-5" />} title="No shops yet" description="Add a shop first. Only a verified shop can issue certifications." />
      ) : (
        <>
          {ownerShopList.length > 1 ? (
            <div className="sm:w-72">
              <Select
                id="certification-shop"
                name="certification-shop"
                label="Shop"
                options={ownerShopList.map((ownerShop) => ({ value: ownerShop.id, label: ownerShop.name }))}
                value={selectedShop.id}
                onChange={(changeEvent): void => {
                  setSelectedShopId(changeEvent.target.value)
                }}
              />
            </div>
          ) : null}
          {!isShopVerified ? (
            <p role="status" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-sm text-[var(--color-warning-600)]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Issuing, renewing and reinstating need an approved shop verification. Certificates already issued stay valid.
            </p>
          ) : null}
          <ShopCertificationValiditySection
            key={`validity-${selectedShop.id}`}
            certificationService={certificationDependencies.certificationService}
            shopId={selectedShop.id}
          />
          <OwnerShopCertifications
            key={`list-${selectedShop.id}`}
            certificationDependencies={certificationDependencies}
            shopId={selectedShop.id}
            isShopVerified={isShopVerified}
            currentInstant={currentInstant ?? new Date()}
            findPlatformReview={platformReviews.findReview}
          />
        </>
      )}
    </Card>
  )
}
