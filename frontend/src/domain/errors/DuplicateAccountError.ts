export const duplicateAccountMessage =
  'An account with this email already exists. Sign in instead, or reset your password if you forgot it.'

/** Raised when sign-up targets an email address that already has an account. */
export class DuplicateAccountError extends Error {
  public constructor() {
    super(duplicateAccountMessage)
    this.name = 'DuplicateAccountError'
  }
}
