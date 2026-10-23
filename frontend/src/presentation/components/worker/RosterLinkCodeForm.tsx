import type { ReactElement } from 'react'
import { CheckCircle2, KeyRound, Link2, Store } from 'lucide-react'
import type { RosterLinkService } from '../../../application/services/RosterLinkService'
import { Button, Input } from '../../design/ui'
import { joinClassNames } from '../../design/classNames'
import { useAcceptRosterLinkCode } from '../../hooks/useAcceptRosterLinkCode'
import { rosterLinkConsentNotice } from '../../utilities/rosterLinkResultDisplay'

interface RosterLinkCodeFormProps {
  readonly rosterLinkService: RosterLinkService
  readonly onRosterLinked: () => void
}

export function RosterLinkCodeForm({
  rosterLinkService,
  onRosterLinked,
}: RosterLinkCodeFormProps): ReactElement {
  const {
    enteredLinkCode,
    phase,
    validPreview,
    feedbackMessage,
    isFeedbackError,
    setEnteredLinkCode,
    checkLinkCode,
    confirmRosterLink,
    startOver,
  } = useAcceptRosterLinkCode({ rosterLinkService, onRosterLinked })

  const isConfirming = phase === 'confirming' || phase === 'linking'

  return (
    <section aria-labelledby="roster-link-code-heading" className="space-y-3">
      <h3
        id="roster-link-code-heading"
        className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]"
      >
        <KeyRound className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        Link to a shop roster with a code
      </h3>

      {!isConfirming && phase !== 'linked' ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
          onSubmit={(submitEvent): void => {
            submitEvent.preventDefault()
            void checkLinkCode()
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              name="rosterLinkCode"
              label="Link code from the shop owner"
              placeholder="12 characters, e.g. 4F2A9C7B1D3E"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              value={enteredLinkCode}
              onChange={(changeEvent): void => {
                setEnteredLinkCode(changeEvent.target.value)
              }}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            isLoading={phase === 'checking'}
            disabled={enteredLinkCode.trim().length === 0 || phase === 'checking'}
            className="sm:mt-7"
          >
            Check code
          </Button>
        </form>
      ) : null}

      {isConfirming && validPreview !== null ? (
        <div className="space-y-3 rounded-[var(--radius-surface)] border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] p-4">
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="text-xs text-[var(--color-ink-500)]">Roster name</dt>
              <dd className="font-semibold text-[var(--color-ink-900)]">
                {validPreview.rosterDisplayName ?? 'Not provided'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-ink-500)]">Shops</dt>
              <dd className="text-[var(--color-ink-900)]">
                {validPreview.ownerShopNames.length > 0 ? (
                  <ul className="space-y-0.5">
                    {validPreview.ownerShopNames.map((shopName) => (
                      <li key={shopName} className="inline-flex items-center gap-1.5">
                        <Store className="h-3.5 w-3.5" aria-hidden="true" />
                        {shopName}
                      </li>
                    ))}
                  </ul>
                ) : (
                  'This owner has no verified, active shop yet.'
                )}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-[var(--color-ink-700)]">{rosterLinkConsentNotice}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              leadingIcon={<Link2 className="h-4 w-4" />}
              isLoading={phase === 'linking'}
              onClick={(): void => {
                void confirmRosterLink()
              }}
            >
              Link my account
            </Button>
            <Button variant="ghost" disabled={phase === 'linking'} onClick={startOver}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {phase === 'linked' ? (
        <p className="inline-flex items-center gap-2 text-sm text-[var(--color-success-600)]">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {feedbackMessage}
        </p>
      ) : null}

      {feedbackMessage !== null && phase !== 'linked' ? (
        <p
          role={isFeedbackError ? 'alert' : 'status'}
          className={joinClassNames(
            'text-xs',
            isFeedbackError
              ? 'text-[var(--color-danger-600)]'
              : 'text-[var(--color-ink-700)]',
          )}
        >
          {feedbackMessage}
        </p>
      ) : null}
    </section>
  )
}
