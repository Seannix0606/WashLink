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
