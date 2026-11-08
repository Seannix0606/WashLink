import type { ReactElement } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button, Card } from '../../design/ui'

interface LoadErrorNoticeProps {
  readonly title: string
  readonly errorMessage: string
  readonly onRetry: () => void
}

/** Error state for a data view that failed to load, with a retry action. */
export function LoadErrorNotice({
  title,
  errorMessage,
  onRetry,
}: LoadErrorNoticeProps): ReactElement {
  return (
    <Card elevation="flat" role="alert" className="flex items-start gap-3 bg-[var(--color-danger-50)]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-danger-600)]">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-danger-600)]">{title}</h2>
          <p className="mt-0.5 text-sm text-[var(--color-ink-700)]">{errorMessage}</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<RotateCw className="h-4 w-4" />}
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    </Card>
  )
}
