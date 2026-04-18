export type ApplicationUserRole = 'customer' | 'owner' | 'worker'

export interface AuthenticatedUser {
  readonly userIdentifier: string
  readonly emailAddress: string
  readonly role: ApplicationUserRole
  readonly fullName: string
  readonly phoneNumber: string
}
