import type { ShopServicePrice } from './ShopPricing'

export type ShopVerificationStatus =
  | 'pending'
  | 'changes_requested'
  | 'approved'
  | 'rejected'

export interface Shop {
  readonly id: string
  readonly ownerIdentifier: string
  readonly name: string
  readonly address: string
  readonly phoneNumber: string | null
  readonly latitude: number | null
  readonly longitude: number | null
  readonly isActive: boolean
  readonly createdAt: string
  readonly verificationStatus: ShopVerificationStatus
  readonly verificationNotes: string | null
  readonly verificationSubmittedAt: string | null
  readonly verificationReviewedAt: string | null
  readonly verificationReviewedBy: string | null
  readonly servicePricing: readonly ShopServicePrice[]
}

export interface CreateShopInput {
  readonly name: string
  readonly address: string
  readonly phoneNumber: string | null
  readonly latitude: number | null
  readonly longitude: number | null
}

export interface UpdateShopInput {
  readonly name?: string
  readonly address?: string
  readonly phoneNumber?: string | null
  readonly latitude?: number | null
  readonly longitude?: number | null
  readonly isActive?: boolean
}
