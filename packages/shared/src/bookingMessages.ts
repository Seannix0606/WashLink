import type { ServiceBookingStatus } from './bookingStatus'
import { B2cRequestError, nullableStr, num, rows, run, str, type B2cSupabaseClient, type Row } from './b2cRequest'

/**
 * Booking messages (MSG-1): a private chat between a booking's customer and its washer. The database decides who can read
 * and write (see supabase/migrations/2026_11_13_msa_booking_messages.sql); this only maps rows and checks photo files
 * before they are sent. No dependency on the DOM or React, so web and mobile share it.
 */

export const CHAT_PHOTO_BUCKET = 'booking-chat-photos'
export const CHAT_PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const CHAT_MESSAGE_MAX_LENGTH = 2000
export const CHAT_PAGE_SIZE = 40

export type ChatRole = 'customer' | 'worker'
export type ChatSenderRole = ChatRole | 'system'
export type ChatMessageKind = 'text' | 'photo' | 'system'
export type ChatPhotoType = 'image/jpeg' | 'image/png' | 'image/webp'

export interface BookingChat {
  readonly bookingId: string
  readonly reference: string
  readonly status: ServiceBookingStatus
  readonly serviceName: string
  readonly scheduledAt: string
  /** Null for a washer once the booking is no longer theirs and active. */
  readonly address: string | null
  readonly myRole: ChatRole
  readonly otherName: string
  /** Writable now: from acceptance until 24 hours after the booking ends. */
  readonly isOpen: boolean
  readonly lastKind: ChatMessageKind | null
  readonly lastBody: string | null
  readonly lastSenderRole: ChatSenderRole | null
  readonly lastAt: string | null
  readonly unreadCount: number
}

export interface ChatMessage {
  readonly id: string
  readonly senderId: string | null
  readonly senderRole: ChatSenderRole
  readonly kind: ChatMessageKind
  readonly body: string | null
  /** Storage path for opening the photo; null once the photo is removed. */
  readonly photoObject: string | null
  readonly isPhotoRemoved: boolean
  /** Only on the caller's own messages: lets an optimistic copy be matched to the saved one. */
  readonly clientId: string | null
  readonly createdAt: string
}

export interface ChatReadReceipt {
  readonly profileId: string
  readonly lastReadAt: string
}

export interface AdminChatMessage {
  readonly id: string
  readonly senderRole: ChatSenderRole
  readonly kind: ChatMessageKind
  readonly body: string | null
  readonly hasPhoto: boolean
  readonly createdAt: string
}

export function toChatMessage(r: Row): ChatMessage {
  return {
    id: str(r.id), senderId: nullableStr(r.sender_id), senderRole: str(r.sender_role) as ChatSenderRole, kind: str(r.kind) as ChatMessageKind,
    body: nullableStr(r.body), photoObject: nullableStr(r.photo_object), isPhotoRemoved: r.photo_removed === true,
    clientId: nullableStr(r.client_id), createdAt: str(r.created_at),
  }
}

function toChat(r: Row): BookingChat {
  return {
    bookingId: str(r.booking_id), reference: str(r.reference), status: str(r.status) as ServiceBookingStatus, serviceName: str(r.service_name),
    scheduledAt: str(r.scheduled_at), address: nullableStr(r.address), myRole: str(r.my_role) as ChatRole, otherName: str(r.other_name),
    isOpen: r.is_open === true, lastKind: nullableStr(r.last_kind) as ChatMessageKind | null, lastBody: nullableStr(r.last_body),
    lastSenderRole: nullableStr(r.last_sender_role) as ChatSenderRole | null, lastAt: nullableStr(r.last_at), unreadCount: num(r.unread_count),
  }
}

/** The list line under a conversation's name: "You: Gate is open", "Photo", or the system note. */
export function chatPreview(chat: BookingChat): string {
  if (chat.lastKind === null) return 'No messages yet'
  const text = chat.lastKind === 'photo' ? 'Photo' : (chat.lastBody ?? '')
  return chat.lastSenderRole === chat.myRole ? `You: ${text}` : text
}

/** Sent or seen, for the caller's own message, from the other person's read receipt. */
export function chatMessageDelivery(message: ChatMessage, otherLastReadAt: string | null): 'sent' | 'seen' {
  return otherLastReadAt !== null && Date.parse(otherLastReadAt) >= Date.parse(message.createdAt) ? 'seen' : 'sent'
}

/** The photo's type from its first bytes (never from a file name), or null when it isn't a JPEG, PNG or WebP. */
export function chatPhotoTypeFromBytes(bytes: Uint8Array): ChatPhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return 'image/png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

/** Why a photo can't be sent, or null when it can. */
export function chatPhotoProblem(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0) return 'That photo is empty. Choose another.'
  if (bytes.byteLength > CHAT_PHOTO_MAX_BYTES) return 'Photos can be up to 5 MB. Choose a smaller one.'
  if (chatPhotoTypeFromBytes(bytes) === null) return 'Send a JPEG, PNG or WebP photo.'
  return null
}

export type BookingMessagesApi = ReturnType<typeof createBookingMessagesApi>

export function createBookingMessagesApi(client: B2cSupabaseClient) {
  return {
    async myChats(): Promise<readonly BookingChat[]> {
      return (await rows(client.rpc('my_service_booking_chats'))).map(toChat)
    },
    /** One page, oldest first, ending just before `before` (or at the newest message). */
    async chatMessages(bookingId: string, before: string | null = null, limit: number = CHAT_PAGE_SIZE): Promise<readonly ChatMessage[]> {
      const page = await rows(client.rpc('service_booking_chat_messages', { p_booking: bookingId, p_before: before, p_limit: limit }))
      return page.map(toChatMessage).reverse()
    },
    async chatReadReceipts(bookingId: string): Promise<readonly ChatReadReceipt[]> {
      const result = await rows(client.from('service_booking_chat_reads').select('profile_id, last_read_at').eq('booking_id', bookingId))
      return result.map((r) => ({ profileId: str(r.profile_id), lastReadAt: str(r.last_read_at) }))
    },
    /** A retry with the same clientId returns the message saved the first time. */
    async sendChatMessage(bookingId: string, body: string, clientId: string): Promise<ChatMessage> {
      const trimmed = body.trim()
      if (trimmed === '') throw new B2cRequestError('Write a message first.')
      if (trimmed.length > CHAT_MESSAGE_MAX_LENGTH) throw new B2cRequestError('Messages can be up to 2000 characters.')
      return toChatMessage((await run(client.rpc('send_service_booking_message', { p_booking: bookingId, p_body: trimmed, p_photo_object: null, p_client_id: clientId }))) as Row)
    },
    /** Checks the file, reserves a slot, uploads to the path the server chose, then sends. */
    async sendChatPhoto(bookingId: string, bytes: Uint8Array, clientId: string): Promise<ChatMessage> {
      const problem = chatPhotoProblem(bytes)
      const contentType = chatPhotoTypeFromBytes(bytes)
      if (problem !== null || contentType === null) throw new B2cRequestError(problem ?? 'Send a JPEG, PNG or WebP photo.')
      const path = str(await run(client.rpc('begin_service_booking_chat_photo', { p_booking: bookingId })))
      const { error } = await client.storage.from(CHAT_PHOTO_BUCKET).upload(path, bytes, { contentType, upsert: false, headers: { 'cache-control': 'private, max-age=3600' } })
      if (error) throw new B2cRequestError('The photo could not be uploaded. Check your connection and try again.')
      return toChatMessage((await run(client.rpc('send_service_booking_message', { p_booking: bookingId, p_body: null, p_photo_object: path, p_client_id: clientId }))) as Row)
    },
    markChatRead: async (bookingId: string): Promise<void> => {
      await run(client.rpc('mark_service_booking_chat_read', { p_booking: bookingId }))
    },
    /** The photo's bytes, for an image element. Refused once the photo is removed or for anyone outside the booking. */
    async openChatPhoto(photoObject: string): Promise<Blob> {
      const { data, error } = await client.storage.from(CHAT_PHOTO_BUCKET).download(photoObject)
      if (error || !data) throw new B2cRequestError('This photo could not be opened.')
      return data
    },
    /** Admin only: read-only, with a reason; the database records every look. */
    async adminChat(bookingId: string, reason: string): Promise<readonly AdminChatMessage[]> {
      const result = await rows(client.rpc('admin_service_booking_chat', { p_booking: bookingId, p_reason: reason.trim() }))
      return result.map((r) => ({
        id: str(r.id), senderRole: str(r.sender_role) as ChatSenderRole, kind: str(r.kind) as ChatMessageKind, body: nullableStr(r.body),
        hasPhoto: r.has_photo === true, createdAt: str(r.created_at),
      }))
    },
  }
}
