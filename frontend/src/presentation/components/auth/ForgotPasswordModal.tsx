import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { CheckCircle2, Mail } from 'lucide-react'
import { useAuthenticatedUser } from '../../auth/AuthenticatedUserContext'
import { Button, Input, Modal } from '../../design/ui'
import { runServiceActionWithToast } from '../../utilities/runServiceActionWithToast'

interface ForgotPasswordModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly initialEmailAddress?: string
}

export function ForgotPasswordModal({
  isOpen,
  onClose,
  initialEmailAddress = '',
}: ForgotPasswordModalProps): ReactElement {
  const { authService } = useAuthenticatedUser()
  const [emailAddress, setEmailAddress] = useState<string>(initialEmailAddress)
  const [isSendingResetEmail, setIsSendingResetEmail] = useState<boolean>(false)
  const [didSendResetEmail, setDidSendResetEmail] = useState<boolean>(false)

  useEffect(() => {
    if (isOpen) {
      setEmailAddress(initialEmailAddress)
      setDidSendResetEmail(false)
    }
  }, [initialEmailAddress, isOpen])

  const handleSendResetEmailSubmit = async (): Promise<void> => {
    const trimmedEmailAddress = emailAddress.trim()
    if (trimmedEmailAddress.length === 0) {
      return
    }
    setIsSendingResetEmail(true)
    const sendOutcome = await runServiceActionWithToast(
      () =>
        authService.sendPasswordResetEmail({
          emailAddress: trimmedEmailAddress,
          redirectToUrl: window.location.origin,
        }),
      {
        successMessage: 'Password reset email sent.',
        fallbackErrorMessage: 'Could not send password reset email.',
      },
    )
    setIsSendingResetEmail(false)
    if (sendOutcome !== null) {
      setDidSendResetEmail(true)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reset password">
      {didSendResetEmail ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-[var(--radius-surface)] border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-[var(--color-brand-700)]" />
            <div className="text-sm text-[var(--color-ink-900)]">
              <p className="font-semibold">Check your inbox</p>
              <p className="mt-1 text-xs text-[var(--color-ink-700)]">
                We sent a password reset link to{' '}
                <span className="font-medium">{emailAddress.trim()}</span>. Open
                it on this device to set a new password.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onClose}
            >
              Got it
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(formSubmitEvent) => {
            formSubmitEvent.preventDefault()
            void handleSendResetEmailSubmit()
          }}
        >
          <p className="text-xs text-[var(--color-ink-500)]">
            Enter your account email and we’ll send you a secure link to set a
            new password.
          </p>

          <Input
            label="Email address"
            name="emailAddress"
            type="email"
            value={emailAddress}
            onChange={(changeEvent) =>
              setEmailAddress(changeEvent.target.value)
            }
            leadingIcon={<Mail className="h-4 w-4" />}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSendingResetEmail}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSendingResetEmail}
              disabled={
                isSendingResetEmail || emailAddress.trim().length === 0
              }
            >
              {isSendingResetEmail ? 'Sending…' : 'Send reset link'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
