/**
 * Certification wording (W7). Every certificate is shop-issued. No string here may claim
 * government recognition, accreditation, a licence, TESDA status or legal compliance;
 * the only mention of "government" is the negated disclaimer.
 */

export const shopIssuedBadgeLabel = 'Shop-issued certification'

export const shopIssuedDisclaimer = 'Shop-issued: not a government-recognized credential.'

export function describeIssuedByLine(shopName: string): string {
  return `Issued by ${shopName} through WashLink. Not a government-recognized credential.`
}

/** The w7_issuer_v1 owner confirmation (not a signature and not a WashLink compliance statement). */
export const issuerAttestationText =
  "I reviewed this worker's training record: the required training days were attended and the assessment was passed. My shop issues this certification on WashLink. It is a shop-issued certification, not a government-recognized credential or licence."

export const issuerAttestationNote = 'This records your confirmation. It is not an electronic signature.'

export const myCertificationsEmptyTitle = 'No certifications yet'

export const myCertificationsEmptyDescription =
  'No certifications yet. A shop issues one after you complete its required training and pass the assessment.'

export const ownerCertificationsEmptyDescription =
  'Certificates you issue appear here. Issue one from Training, Manage, for a trainee who completed the training.'

export const trainingRecordChangedFlag = 'Training record changed after issue'

export const trainingRecordChangedOwnerDetail =
  'A training record was corrected after this certificate was issued. It stays valid until you decide; suspending is your decision.'

export const trainingRecordChangedWorkerDetail =
  'A training record behind this certificate was corrected after it was issued. The shop decides whether anything changes.'

export const issuingShopRemovedText = 'The issuing shop is no longer on WashLink. The certificate record stays.'

export const issuingShopNoLongerVerifiedText =
  'The issuing shop is no longer verified. This does not change the certificate, which was issued while the shop was verified.'

export const applicantIssuingShopNoLongerVerifiedText = 'Issuing shop is no longer verified on WashLink.'

/** D-22 renewal guidance on the worker's own certificate card. */
export const workerRenewalGuidanceText =
  'Renewal is by re-assessment with the issuing shop, from 60 days before expiry to 90 days after it. The shop decides whether to re-assess you.'

export const workerExpiredCertificateNoticeText =
  'An expired certificate no longer counts for openings that require a current certification.'

/** D-20 copy for a certification-required opening when the worker holds no current certificate. */
export const certificationRequiredApplyBlockedText =
  'This opening needs a current shop-issued certification recorded on WashLink. You do not have one, so you cannot apply yet. Openings that welcome trainees are open to you.'

export const certificationStateLoadingText = 'Checking your shop-issued certifications.'

export const certificationStateUnavailableText =
  'Your certifications could not be checked right now. This opening needs a current shop-issued certification recorded on WashLink.'

export const reviewRequestGuidance =
  'Explain why the decision should be reviewed. The issuing shop decides. Do not include ID numbers, health details or contact details.'

export const reviewRuleText =
  'You can ask for a review within 30 days of the decision, up to 3 times per certificate, one at a time.'

export const statusChangeGuidance =
  'The worker sees this reason. Keep it factual. Do not include ID numbers, health details or contact details.'

export const renewalRuleText =
  'Renewal is by re-assessment against the original checklist, from 60 days before expiry to 90 days after it. A renewal issues a new certificate and the old one is marked renewed.'

export const validityPolicyText =
  'How long new certificates from this shop stay valid. Applies to future issues and renewals only. Without a setting, 12 months applies.'

/** Every copy constant, for the disclaimer scan in tests. */
export const certificationCopyConstants: readonly string[] = [
  shopIssuedBadgeLabel,
  shopIssuedDisclaimer,
  describeIssuedByLine('Test shop'),
  issuerAttestationText,
  issuerAttestationNote,
  myCertificationsEmptyTitle,
  myCertificationsEmptyDescription,
  ownerCertificationsEmptyDescription,
  trainingRecordChangedFlag,
  trainingRecordChangedOwnerDetail,
  trainingRecordChangedWorkerDetail,
  issuingShopRemovedText,
  issuingShopNoLongerVerifiedText,
  applicantIssuingShopNoLongerVerifiedText,
  workerRenewalGuidanceText,
  workerExpiredCertificateNoticeText,
  certificationRequiredApplyBlockedText,
  certificationStateLoadingText,
  certificationStateUnavailableText,
  reviewRequestGuidance,
  reviewRuleText,
  statusChangeGuidance,
  renewalRuleText,
  validityPolicyText,
]
