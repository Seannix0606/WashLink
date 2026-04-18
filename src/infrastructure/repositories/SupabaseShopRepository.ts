import type {
  CreateShopInput,
  Shop,
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
}

const supabaseShopSelectColumns =
  'id, owner_id, name, address, phone_number, latitude, longitude, is_active, created_at'

export class SupabaseShopRepository implements ShopRepository {
  public async listActiveShops(): Promise<readonly Shop[]> {
    const { data, error } = await getSupabaseClient()
      .from('shops')
      .select(supabaseShopSelectColumns)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      throw new Error(`Failed to list active shops: ${error.message}`)
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
  }
}
