import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  chatMessageDelivery, chatPhotoProblem, chatPhotoTypeFromBytes, chatPreview, CHAT_PHOTO_MAX_BYTES,
  type BookingChat, type ChatMessage,
} from '@washlink/shared'
import { chatDayLabel, chatListTime } from './chatFormat'
import { ConversationList } from './ConversationList'
import { MessagesPanel } from './MessagesPanel'

vi.mock('./ChatThread', () => ({ ChatThread: ({ chat }: { readonly chat: BookingChat }): ReactElement => <p>Thread for {chat.reference}</p> }))

const chat = (patch: Partial<BookingChat>): BookingChat => ({
  bookingId: 'b1', reference: 'WL-AAAA0001', status: 'accepted', serviceName: 'Basic Wash', scheduledAt: '2026-11-15T01:00:00Z',
  address: '12 Ayala Avenue', myRole: 'customer', otherName: 'Wes Washer', isOpen: true, lastKind: 'text', lastBody: 'On my way',
  lastSenderRole: 'worker', lastAt: '2026-11-12T06:34:00Z', unreadCount: 0, ...patch,
})
const message = (patch: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1', senderId: 'me', senderRole: 'customer', kind: 'text', body: 'Hi', photoObject: null, isPhotoRemoved: false, clientId: null,
  createdAt: '2026-11-12T06:00:00Z', ...patch,
})

describe('message rules shared with the apps', () => {
  it('previews the last message, marking the caller\'s own and photos', () => {
    expect(chatPreview(chat({}))).toBe('On my way')
    expect(chatPreview(chat({ lastSenderRole: 'customer', lastBody: 'Thanks' }))).toBe('You: Thanks')
    expect(chatPreview(chat({ lastKind: 'photo', lastBody: null, lastSenderRole: 'customer' }))).toBe('You: Photo')
    expect(chatPreview(chat({ lastKind: null }))).toBe('No messages yet')
  })

  it('marks an own message seen once the other person has read past it', () => {
    expect(chatMessageDelivery(message({}), null)).toBe('sent')
    expect(chatMessageDelivery(message({}), '2026-11-12T05:59:59Z')).toBe('sent')
    expect(chatMessageDelivery(message({}), '2026-11-12T06:00:00Z')).toBe('seen')
  })

  it('accepts JPEG, PNG and WebP by their bytes, up to 5 MB', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]) // "RIFF" .... "WEBP"
    expect(chatPhotoTypeFromBytes(jpeg)).toBe('image/jpeg')
    expect(chatPhotoTypeFromBytes(pngBytes)).toBe('image/png')
    expect(chatPhotoTypeFromBytes(webp)).toBe('image/webp')
    expect(chatPhotoProblem(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe('Send a JPEG, PNG or WebP photo.')
    const tooBig = new Uint8Array(CHAT_PHOTO_MAX_BYTES + 1)
    tooBig.set(jpeg)
    expect(chatPhotoProblem(tooBig)).toBe('Photos can be up to 5 MB. Choose a smaller one.')
    expect(chatPhotoProblem(jpeg)).toBeNull()
  })

  it('labels times and days in Manila time', () => {
    const now = new Date('2026-11-12T08:00:00Z')
    expect(chatListTime('2026-11-12T06:34:00Z', now)).toBe('2:34 PM')
    expect(chatListTime('2026-11-11T06:34:00Z', now)).toBe('Yesterday')
    expect(chatListTime('2026-11-02T06:34:00Z', now)).toBe('Nov 2')
    expect(chatDayLabel('2026-11-12', now)).toBe('Today')
    expect(chatDayLabel('2026-11-11', now)).toBe('Yesterday')
  })
})

describe('conversation list', () => {
  it('shows unread counts and finds conversations by name, service or reference', async () => {
    const onSelect = vi.fn()
    render(<ConversationList error={null} selectedBookingId={null} onSelect={onSelect} onRetry={vi.fn()}
      chats={[chat({ unreadCount: 2 }), chat({ bookingId: 'b2', reference: 'WL-BBBB0002', serviceName: 'Premium Wash', otherName: 'Dan Washer', lastBody: 'Thank you' })]} />)
    const list = screen.getByRole('list', { name: 'Conversations' })
    expect(within(list).getByRole('button', { name: /Wes Washer, Basic Wash WL-AAAA0001, 2 unread/ })).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search conversations' }), 'premium')
    expect(within(list).queryByRole('button', { name: /Wes Washer/ })).toBeNull()
    await userEvent.click(within(list).getByRole('button', { name: /Dan Washer/ }))
    expect(onSelect).toHaveBeenCalledWith('b2')
  })

  it('has empty, loading and error states', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<ConversationList chats={null} error={null} selectedBookingId={null} onSelect={vi.fn()} onRetry={onRetry} />)
    expect(screen.getByLabelText('Loading conversations')).toBeInTheDocument()
    rerender(<ConversationList chats={[]} error={null} selectedBookingId={null} onSelect={vi.fn()} onRetry={onRetry} />)
    expect(screen.getByText('No conversations yet')).toBeInTheDocument()
    rerender(<ConversationList chats={null} error="Could not load." selectedBookingId={null} onSelect={vi.fn()} onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('messages panel', () => {
  it('leaves out finished bookings that never had a message, and opens the chosen conversation', () => {
    const chats = [chat({}), chat({ bookingId: 'old', reference: 'WL-CCCC0003', isOpen: false, lastKind: null, lastBody: null, lastAt: null })]
    const state = { chats, error: null, unreadTotal: 0, refresh: vi.fn() }
    const { rerender } = render(<MessagesPanel chats={state} profileId="me" selectedBookingId={null} onSelect={vi.fn()} onViewBooking={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /WL-CCCC0003/ })).toBeNull()
    expect(screen.getByText('Choose a conversation')).toBeInTheDocument()
    rerender(<MessagesPanel chats={state} profileId="me" selectedBookingId="b1" onSelect={vi.fn()} onViewBooking={vi.fn()} />)
    expect(screen.getByText('Thread for WL-AAAA0001')).toBeInTheDocument()
  })
})
