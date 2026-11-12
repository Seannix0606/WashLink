import type { ReactElement } from 'react'
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { formatManilaDateTime, type AdminChatMessage } from '@washlink/shared'
import { Button } from '../../../presentation/design/ui'
import { getB2cApi } from '../b2cApiClient'
import { ReasonForm } from './ReasonForm'

const senderLabel: Readonly<Record<AdminChatMessage['senderRole'], string>> = { customer: 'Customer', worker: 'Washer', system: 'WashLink' }

/** Read-only view of a booking's conversation. The admin gives a reason first; the database records every look. */
export function AdminChatReader({ bookingId }: { readonly bookingId: string }): ReactElement {
  const [mode, setMode] = useState<'closed' | 'asking' | 'reading'>('closed')
  const [messages, setMessages] = useState<readonly AdminChatMessage[]>([])

  if (mode === 'closed') {
    return (
      <Button size="sm" variant="secondary" leadingIcon={<MessageCircle className="h-4 w-4" aria-hidden="true" />} onClick={(): void => { setMode('asking') }}>
        Read messages
      </Button>
    )
  }
  if (mode === 'asking') {
    return (
      <ReasonForm id={`chat-reason-${bookingId}`} label="Why are you reading this conversation?" confirmLabel="Read messages" cancelLabel="Cancel"
        warning="Messages are private between the customer and the washer. Your reason and this look are recorded in the audit log."
        onCancel={(): void => { setMode('closed') }}
        onConfirm={async (reason): Promise<void> => {
          setMessages(await getB2cApi().adminChat(bookingId, reason))
          setMode('reading')
        }} />
    )
  }
  return (
    <div className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-3">
      <h4 className="font-semibold text-[var(--color-ink-900)]">Messages (read only)</h4>
      {messages.length === 0 ? <p className="text-[var(--color-ink-700)]">No messages on this booking.</p> : (
        <ol className="space-y-1.5">
          {messages.map((message) => (
            <li key={message.id}>
              <span className="tabular-nums text-[var(--color-ink-500)]">{formatManilaDateTime(message.createdAt)}</span>{' '}
              <span className="font-semibold">{senderLabel[message.senderRole]}:</span>{' '}
              {message.kind === 'photo' ? <em>{message.hasPhoto ? 'Photo (not shown to admins)' : 'Photo removed'}</em> : message.body}
            </li>
          ))}
        </ol>
      )}
      <Button size="sm" variant="ghost" onClick={(): void => { setMode('closed') }}>Close messages</Button>
    </div>
  )
}
