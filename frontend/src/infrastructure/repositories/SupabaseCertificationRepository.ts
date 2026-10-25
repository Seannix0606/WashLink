import type {
  CertifiableEnrollment,
  CertificationHistoryEntry,
  MyCertification,
  OwnerCertification,
  ShopCertificationPolicy,
} from '../../domain/models/Certification'
import type { CertificationRepository } from '../../domain/repositories/CertificationRepository'
import {
  defaultShopCertificationPolicy,
  mapCertifiableEnrollmentRow,
  mapCertificationHistoryRow,
  mapMyCertificationRow,
  mapOwnerCertificationRow,
  mapShopCertificationPolicyRow,
  shopCertificationPolicySelectColumns,
  type SupabaseCertifiableEnrollmentRow,
  type SupabaseCertificationHistoryRow,
  type SupabaseMyCertificationRow,
  type SupabaseOwnerCertificationRow,
  type SupabaseShopCertificationPolicyRow,
} from '../supabase/supabaseCertificationRows'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

async function callListRpc<Row>(
  rpcName: string,
  rpcArguments: Record<string, unknown> | undefined,
  fallbackMessage: string,
): Promise<Row[]> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments)
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  return (rpcResponse.data ?? []) as Row[]
}

/** Certificate reads only. The certificate tables are never written from the client. */
export class SupabaseCertificationRepository implements CertificationRepository {
  public async listMyCertifications(): Promise<MyCertification[]> {
    const certificationRows = await callListRpc<SupabaseMyCertificationRow>(
      'my_certifications',
      undefined,
      'Could not load your certifications.',
    )
    return certificationRows.map(mapMyCertificationRow)
  }

  public async listOwnerCertifications(shopId: string): Promise<OwnerCertification[]> {
    const certificationRows = await callListRpc<SupabaseOwnerCertificationRow>(
      'owner_certifications',
      { p_shop_id: shopId },
      'Could not load the certifications.',
    )
    return certificationRows.map(mapOwnerCertificationRow)
  }

  public async listHistory(certificationId: string): Promise<CertificationHistoryEntry[]> {
    const historyRows = await callListRpc<SupabaseCertificationHistoryRow>(
      'certification_history',
      { p_certification_id: certificationId },
      'Could not load the certification history.',
    )
    return historyRows.map(mapCertificationHistoryRow)
  }

  public async listCertifiableEnrollments(programId: string): Promise<CertifiableEnrollment[]> {
    const enrollmentRows = await callListRpc<SupabaseCertifiableEnrollmentRow>(
      'certifiable_enrollments',
      { p_program_id: programId },
      'Could not load the trainees who can be certified.',
    )
    return enrollmentRows.map(mapCertifiableEnrollmentRow)
  }

  public async fetchShopPolicy(shopId: string): Promise<ShopCertificationPolicy> {
    const queryResponse = await getSupabaseClient()
      .from('shop_certification_policies')
      .select(shopCertificationPolicySelectColumns)
      .eq('shop_id', shopId)
      .limit(1)
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the certification validity.')
    }
    const policyRow = (queryResponse.data as unknown as SupabaseShopCertificationPolicyRow[]).at(0)
    return policyRow === undefined ? defaultShopCertificationPolicy(shopId) : mapShopCertificationPolicyRow(policyRow, shopId)
  }
}
