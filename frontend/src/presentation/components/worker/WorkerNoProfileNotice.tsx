import type { ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card } from '../../design/ui'

interface WorkerNoProfileNoticeProps {
  readonly workerResolutionErrorMessage: string
}

export function WorkerNoProfileNotice({
  workerResolutionErrorMessage,
}: WorkerNoProfileNoticeProps): ReactElement {
  return (
    <Card elevation="flat" className="bg-[var(--color-warning-50)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-warning-600)]">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-warning-600)]">
            No worker profile linked
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-700)]">
            {workerResolutionErrorMessage.length > 0
              ? workerResolutionErrorMessage
              : 'Ask the owner to assign this account to a worker in their dashboard, then refresh this page.'}
          </p>
        </div>
      </div>
    </Card>
  )
}
