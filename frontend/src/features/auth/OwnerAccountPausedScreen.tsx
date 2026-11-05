import type { ReactElement } from 'react'
import { BrandMark } from '../../presentation/design/ui/BrandMark'
import { useAuthenticatedUser } from '../../presentation/auth/AuthenticatedUserContext'

/** Shown to shop owner accounts while B2B is off. Their shops and records are untouched. */
export function OwnerAccountPausedScreen(): ReactElement {
  const { signOut } = useAuthenticatedUser()

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center gap-5 px-5 py-8">
      <BrandMark />
      <h1 className="text-2xl font-bold text-[var(--color-ink-900)]">
        Shop accounts are paused
      </h1>
      <p className="text-base leading-relaxed text-[var(--color-ink-700)]">
        WashLink now sends independent washers to customers. Your shop, bookings and workforce
        records are kept and will be here if shop accounts return. For help, contact WashLink
        support.
      </p>
      <div>
        <button
          type="button"
          onClick={(): void => {
            void signOut()
          }}
          className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-ink-300)] px-4 text-sm font-semibold text-[var(--color-ink-900)]"
        >
          Sign out
        </button>
      </div>
    </main>
  )
}
