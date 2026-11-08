export type ApplicationUserRole =
  | 'customer'
  | 'owner'
  | 'worker'
  | 'super_admin'

/** Roles a person can choose at sign-up (D-8 whitelist). super_admin is never self-selected. */
export type SignUpRole = Exclude<ApplicationUserRole, 'super_admin'>

export interface AuthenticatedUser {
  readonly userIdentifier: string
  readonly emailAddress: string
  readonly role: ApplicationUserRole
  readonly fullName: string
  readonly phoneNumber: string
}
