import type { ReactElement } from 'react'
import { AlertTriangle, MailCheck } from 'lucide-react'
import { duplicateAccountMessage } from '../../domain/errors/DuplicateAccountError'

export type SignUpFeedback =
  | { readonly kind: 'duplicate_account' }
  | { readonly kind: 'confirmation_required'; readonly emailAddress: string }

interface SignUpFeedbackNoticeProps {
  readonly signUpFeedback: SignUpFeedback
  readonly onRequestSignIn: () => void
  readonly onRequestPasswordReset: () => void
}

const actionLinkClassName =
  'font-semibold text-[var(--color-brand-700)] underline-offset-2 hover:underline'

export function SignUpFeedbackNotice({
  signUpFeedback,
  onRequestSignIn,
  onRequestPasswordReset,
}: SignUpFeedbackNoticeProps): ReactElement {
  if (signUpFeedback.kind === 'confirmation_required') {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-success-500)]/40 bg-[var(--color-success-50)] p-3 text-sm"
      >
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success-600)]" aria-hidden="true" />
        <div>
          <p className="font-semibold text-[var(--color-ink-900)]">
            Check your email to confirm your account
          </p>
          <p className="mt-0.5 text-[var(--color-ink-700)]">
            We sent a confirmation link to {signUpFeedback.emailAddress}. After confirming,{' '}
            <button type="button" className={actionLinkClassName} onClick={onRequestSignIn}>
              sign in
            </button>
            .
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-warning-500)]/40 bg-[var(--color-warning-50)] p-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning-600)]" aria-hidden="true" />
      <div>
        <p className="text-[var(--color-ink-900)]">{duplicateAccountMessage}</p>
        <div className="mt-2 flex flex-wrap gap-4">
          <button type="button" className={actionLinkClassName} onClick={onRequestSignIn}>
            Sign in
          </button>
          <button
            type="button"
            className={actionLinkClassName}
            onClick={onRequestPasswordReset}
          >
            Reset password
          </button>
        </div>
      </div>
    </div>
  )
}
