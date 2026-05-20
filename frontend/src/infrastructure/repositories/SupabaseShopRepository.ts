import type {
  CreateShopInput,
  Shop,
  ShopVerificationStatus,
  UpdateShopInput,
} from '../../domain/models/Shop'
import type { ShopRepository } from '../../domain/repositories/ShopRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'

interface SupabaseShopRow {
  id: string
  owner_id: string
  name: string
  address: string
  phone_number: string | null
  latitude: number | null
  longitude: number | null
  is_active: boolean
  created_at: string
  verification_status: string
  verification_notes: string | null
  verification_submitted_at: string | null
  verification_reviewed_at: string | null
  verification_reviewed_by: string | null
}

const supabaseShopSelectColumns =
  'id, owner_id, name, address, phone_number, latitude, longitude, is_active, created_at, verification_status, verification_notes, verification_submitted_at, verification_reviewed_at, verification_reviewed_by'

const shopVerificationStatusSet: ReadonlySet<ShopVerificationStatus> = new Set<
  ShopVerificationStatus
>(['pending', 'changes_requested', 'approved', 'rejected'])

function mapVerificationStatus(rawStatus: string): ShopVerificationStatus {
  if (shopVerificationStatusSet.has(rawStatus as ShopVerificationStatus)) {
    return rawStatus as ShopVerificationStatus
  }
  return 'pending'
}

export class SupabaseShopRepository implements ShopRepository {
  public async listActiveShops(): Promise<readonly Shop[]> {
    const { data, error } = await getSupabaseClient()
      .from('shops')
      .select(supabaseShopSelectColumns)
      .eq('is_active', true)
      .eq('verification_status', 'approved')
      .order('name', { ascending: true })

    if (error) {
      throw new Error(`Failed to list active shops: ${error.message}`)
    }

    const shopRows: SupabaseShopRow[] = data
    return shopRows.map(mapSupabaseShopRowToShop)
  }

  public async listShopsPendingReview(): Promise<readonly Shop[]> {
    const { data, error } = await getSupabaseClient()
      .from('shops')
      .select(supabaseShopSelectColumns)
      .in('verification_status', ['pending', 'changes_requested'])
      .order('verification_submitted_at', {
        ascending: true,
        nullsFirst: false,
      })
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to list shops for review: ${error.message}`)
    }

    const shopRows: SupabaseShopRow[] = data
    return shopRows.map(mapSupabaseShopRowToShop)
  }

  public async listAllShopsForReview(): Promise<readonly Shop[]> {
    const { data, error } = await getSupabaseClient()
      .from('shops')
      .select(supabaseShopSelectColumns)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to list shops: ${error.message}`)
    }

    const shopRows: SupabaseShopRow[] = data
    return shopRows.map(mapSupabaseShopRowToShop)
  }

  public async fetchShopsByIdentifiers(
    shopIdentifiers: readonly string[],
  ): Promise<readonly Shop[]> {
    if (shopIdentifiers.length === 0) {
      return []
    }

    const { data, error } = await getSupabaseClient()
      .from('shops')
      .select(supabaseShopSelectColumns)
      .in('id', shopIdentifiers as string[])

    if (error) {
      throw new Error(`Failed to fetch shops by identifiers: ${error.message}`)
    }

    const shopRows: SupabaseShopRow[] = data
    return shopRows.map(mapSupabaseShopRowToShop)
  }

  public async listShopsByOwnerIdentifier(
    ownerIdentifier: string,
  ): Promise<readonly Shop[]> {
    const { data, error } = await getSupabaseClient()
      .from('shops')
      .select(supabaseShopSelectColumns)
      .eq('owner_id', ownerIdentifier)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(
        `Failed to list shops for owner: ${error.message}`,
      )
    }

    const shopRows: SupabaseShopRow[] = data
    return shopRows.map(mapSupabaseShopRowToShop)
  }

  public async createShop(
    ownerIdentifier: string,
    createShopInput: CreateShopInput,
  ): Promise<Shop> {
    const { data, error } = await getSupabaseClient()
      .from('shops')
      .insert({
        owner_id: ownerIdentifier,
        name: createShopInput.name,
        address: createShopInput.address,
        phone_number: createShopInput.phoneNumber,
        latitude: createShopInput.latitude,
        longitude: createShopInput.longitude,
      })
      .select(supabaseShopSelectColumns)
      .single()

    if (error) {
      throw new Error(`Failed to create shop: ${error.message}`)
    }

    return mapSupabaseShopRowToShop(data as SupabaseShopRow)
  }

  public async updateShop(
    shopIdentifier: string,
    updateShopInput: UpdateShopInput,
  ): Promise<Shop> {
    const updatePayload: Record<string, unknown> = {}
    if (updateShopInput.name !== undefined) {
      updatePayload.name = updateShopInput.name
    }
    if (updateShopInput.address !== undefined) {
      updatePayload.address = updateShopInput.address
    }
    if (updateShopInput.phoneNumber !== undefined) {
      updatePayload.phone_number = updateShopInput.phoneNumber
    }
    if (updateShopInput.latitude !== undefined) {
      updatePayload.latitude = updateShopInput.latitude
    }
    if (updateShopInput.longitude !== undefined) {
      updatePayload.longitude = updateShopInput.longitude
    }
    if (updateShopInput.isActive !== undefined) {
      updatePayload.is_active = updateShopInput.isActive
    }

    const { data, error } = await getSupabaseClient()
      .from('shops')
      .update(updatePayload)
      .eq('id', shopIdentifier)
      .select(supabaseShopSelectColumns)
      .single()

    if (error) {
      throw new Error(`Failed to update shop: ${error.message}`)
    }

    return mapSupabaseShopRowToShop(data as SupabaseShopRow)
  }

  public async deleteShop(shopIdentifier: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from('shops')
      .delete()
      .eq('id', shopIdentifier)

    if (error) {
      throw new Error(`Failed to delete shop: ${error.message}`)
    }
  }
}

function mapSupabaseShopRowToShop(shopRow: SupabaseShopRow): Shop {
  return {
    id: shopRow.id,
    ownerIdentifier: shopRow.owner_id,
    name: shopRow.name,
    address: shopRow.address,
    phoneNumber: shopRow.phone_number,
    latitude:
      typeof shopRow.latitude === 'number' ? shopRow.latitude : null,
    longitude:
      typeof shopRow.longitude === 'number' ? shopRow.longitude : null,
    isActive: shopRow.is_active,
    createdAt: shopRow.created_at,
    verificationStatus: mapVerificationStatus(shopRow.verification_status),
    verificationNotes: shopRow.verification_notes,
    verificationSubmittedAt: shopRow.verification_submitted_at,
    verificationReviewedAt: shopRow.verification_reviewed_at,
    verificationReviewedBy: shopRow.verification_reviewed_by,
  }
}
