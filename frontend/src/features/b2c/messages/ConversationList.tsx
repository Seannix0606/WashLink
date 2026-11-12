import type { ReactElement } from 'react'
import { useState } from 'react'
import { MessageCircle, Search } from 'lucide-react'
import { chatPreview, type BookingChat } from '@washlink/shared'
import { Avatar, Button, EmptyState, Skeleton } from '../../../presentation/design/ui'
import { joinClassNames } from '../../../presentation/design/classNames'
import { chatListTime } from './chatFormat'

interface ConversationListProps {
  readonly chats: readonly BookingChat[] | null
  readonly error: string | null
  readonly selectedBookingId: string | null
  readonly onSelect: (bookingId: string) => void
  readonly onRetry: () => void
}

/** Every conversation the caller is in, newest activity first, with search and unread badges. */
export function ConversationList({ chats, error, selectedBookingId, onSelect, onRetry }: ConversationListProps): ReactElement {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = (chats ?? []).filter((chat) => needle === ''
    || [chat.otherName, chat.serviceName, chat.reference, chat.lastBody ?? ''].some((text) => text.toLowerCase().includes(needle)))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--color-card-border)] p-3">
        <label className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-card-border)] bg-[var(--color-card)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-ink-500)]" aria-hidden="true" />
          <span className="sr-only">Search conversations</span>
          <input type="search" value={query} placeholder="Search conversations"
            className="h-10 w-full bg-transparent text-sm text-[var(--color-ink-900)] outline-none placeholder:text-[var(--color-ink-400)]"
            onChange={(event): void => { setQuery(event.target.value) }} />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error !== null ? (
          <div role="alert" className="space-y-2 p-4 text-sm text-[var(--color-danger-600)]">
            <p>{error}</p>
            <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>
          </div>
        ) : null}
        {chats === null && error === null ? (
          <div className="space-y-3 p-3" aria-label="Loading conversations">
            {[0, 1, 2].map((key) => <Skeleton key={key} heightClassName="h-16" />)}
          </div>
        ) : null}
        {chats !== null && chats.length === 0 ? (
          <EmptyState className="m-3" icon={<MessageCircle className="h-5 w-5" />} title="No conversations yet"
            description="A conversation opens when a washer accepts a booking." />
        ) : null}
        {chats !== null && chats.length > 0 && shown.length === 0 ? (
          <p className="p-4 text-sm text-[var(--color-ink-700)]">No conversations match &ldquo;{query.trim()}&rdquo;.</p>
        ) : null}
        <ul aria-label="Conversations">
          {shown.map((chat) => {
            const isSelected = chat.bookingId === selectedBookingId
            const hasUnread = chat.unreadCount > 0
            return (
              <li key={chat.bookingId}>
                <button type="button" aria-current={isSelected ? 'true' : undefined}
                  aria-label={`${chat.otherName}, ${chat.serviceName} ${chat.reference}${hasUnread ? `, ${String(chat.unreadCount)} unread` : ''}`}
                  className={joinClassNames(
                    'flex w-full cursor-pointer items-start gap-3 border-b border-[var(--color-card-border)] px-3 py-3 text-left transition-colors duration-[var(--duration-quick)]',
                    isSelected ? 'bg-[var(--color-section-head)] shadow-[inset_3px_0_0_var(--color-primary-soft)]' : 'hover:bg-[var(--color-surface-muted)]',
                  )}
                  onClick={(): void => { onSelect(chat.bookingId) }}>
                  <Avatar fullName={chat.otherName} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={joinClassNames('truncate text-sm text-[var(--color-ink-900)]', hasUnread ? 'font-bold' : 'font-semibold')}>{chat.otherName}</span>
                      {chat.lastAt !== null ? <span className={joinClassNames('shrink-0 text-xs', hasUnread ? 'font-semibold text-[var(--color-brand-700)]' : 'text-[var(--color-ink-500)]')}>{chatListTime(chat.lastAt)}</span> : null}
                    </span>
                    <span className="block truncate text-xs text-[var(--color-ink-500)]">{chat.serviceName} · {chat.reference}</span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={joinClassNames('truncate text-sm', hasUnread ? 'font-medium text-[var(--color-ink-900)]' : 'text-[var(--color-ink-700)]')}>{chatPreview(chat)}</span>
                      {hasUnread ? (
                        <span aria-hidden="true" className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] font-bold leading-5 text-white">
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
