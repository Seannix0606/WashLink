import type { ReactElement } from 'react'
import { MessageCircle } from 'lucide-react'
import { EmptyState } from '../../../presentation/design/ui'
import { joinClassNames } from '../../../presentation/design/classNames'
import { ChatThread } from './ChatThread'
import { ConversationList } from './ConversationList'
import type { BookingChatsState } from './useBookingChats'

interface MessagesPanelProps {
  readonly chats: BookingChatsState
  readonly profileId: string
  readonly selectedBookingId: string | null
  readonly onSelect: (bookingId: string | null) => void
  readonly onViewBooking: () => void
}

/**
 * The Messages section. Desktop: conversations on the left, the open chat on the right. Phones: the list, and choosing a
 * conversation opens it full width with a back button.
 */
export function MessagesPanel({ chats, profileId, selectedBookingId, onSelect, onViewBooking }: MessagesPanelProps): ReactElement {
  // Finished bookings that never had a message are left out: they can't be written in and have nothing to read.
  const listed = chats.chats === null ? null : chats.chats.filter((chat) => chat.isOpen || chat.lastAt !== null || chat.bookingId === selectedBookingId)
  const selected = listed?.find((chat) => chat.bookingId === selectedBookingId) ?? null
  const isThreadOpen = selected !== null
  return (
    // grid-cols-[minmax(0,1fr)]: without it the phone column sizes to its longest line (an address, a long message) and runs off screen.
    // Phones show an open chat full screen, over the page header and tabs, with room for the notch and home bar.
    <div className={joinClassNames('grid grid-cols-[minmax(0,1fr)] overflow-hidden bg-[var(--color-card)] lg:h-[calc(100dvh-15rem)] lg:min-h-[26rem] lg:grid-cols-[20rem_minmax(0,1fr)] lg:rounded-[var(--radius-surface)] lg:border lg:border-[var(--color-card-border)] lg:shadow-[var(--shadow-card)]',
      isThreadOpen
        ? 'max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:h-[100dvh] max-lg:pb-[env(safe-area-inset-bottom)] max-lg:pt-[env(safe-area-inset-top)]'
        : 'h-[calc(100dvh-18rem)] min-h-[26rem] rounded-[var(--radius-surface)] border border-[var(--color-card-border)] shadow-[var(--shadow-card)]')}>
      <div className={joinClassNames('min-h-0 border-[var(--color-card-border)] lg:block lg:border-r', isThreadOpen ? 'hidden' : 'block')}>
        <ConversationList chats={listed} error={chats.error} selectedBookingId={selectedBookingId}
          onSelect={(bookingId): void => { onSelect(bookingId) }} onRetry={(): void => void chats.refresh()} />
      </div>
      <div className={joinClassNames('min-h-0 lg:block', isThreadOpen ? 'block' : 'hidden')}>
        {selected !== null ? (
          <ChatThread key={selected.bookingId} chat={selected} profileId={profileId} isVisible
            onBack={(): void => { onSelect(null) }} onViewBooking={onViewBooking} />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState icon={<MessageCircle className="h-5 w-5" />} title="Choose a conversation"
              description="Each booking has its own chat with your washer or customer." />
          </div>
        )}
      </div>
    </div>
  )
}
