import { useCallback, useEffect, useRef, useState } from 'react'
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from '@supabase/supabase-js'
import { CHAT_PAGE_SIZE, toChatMessage, type ChatMessage } from '@washlink/shared'
import { getSupabaseClient } from '../../../infrastructure/supabase/supabaseClient'
import { errorMessage, getB2cApi } from '../b2cApiClient'

/** A message shown before the server confirms it. Failed ones offer Retry. */
export interface PendingMessage {
  readonly clientId: string
  readonly kind: 'text' | 'photo'
  readonly body: string
  readonly photo: Uint8Array | null
  readonly previewUrl: string | null
  readonly createdAt: string
  readonly state: 'sending' | 'failed'
  readonly error: string | null
}

export interface BookingChatState {
  readonly messages: readonly ChatMessage[] | null
  readonly pending: readonly PendingMessage[]
  readonly error: string | null
  readonly hasOlder: boolean
  readonly isLoadingOlder: boolean
  readonly otherLastReadAt: string | null
  readonly isOtherOnline: boolean
  readonly isOtherTyping: boolean
  readonly loadOlder: () => Promise<void>
  readonly sendText: (body: string) => void
  readonly sendPhoto: (bytes: Uint8Array, previewUrl: string) => void
  readonly retry: (clientId: string) => void
  readonly discard: (clientId: string) => void
  readonly notifyTyping: () => void
  readonly reload: () => Promise<void>
}

const TYPING_SHOWN_MS = 4000
const TYPING_SEND_EVERY_MS = 2000

function newClientId(): string {
  return crypto.randomUUID()
}

function mergeMessages(current: readonly ChatMessage[], incoming: readonly ChatMessage[]): readonly ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt))
}

/**
 * One booking's conversation, live: messages and read receipts arrive through Realtime (filtered by the database's row
 * rules), typing and online status through the private channel "booking-chat:<booking>" that only the booking's customer and
 * washer can join. Sending is optimistic: the message shows at once and is matched to the saved copy by its client id.
 */
export function useBookingChat(bookingId: string, profileId: string, isVisible: boolean): BookingChatState {
  const [messages, setMessages] = useState<readonly ChatMessage[] | null>(null)
  const [pending, setPending] = useState<readonly PendingMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasOlder, setHasOlder] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null)
  const [isOtherOnline, setIsOtherOnline] = useState(false)
  const [isOtherTyping, setIsOtherTyping] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const typingTimer = useRef<number | null>(null)
  const lastTypingSent = useRef(0)

  const markRead = useCallback((): void => {
    if (isVisible && document.visibilityState === 'visible') void getB2cApi().markChatRead(bookingId).catch(() => undefined)
  }, [bookingId, isVisible])

  const loadReceipts = useCallback(async (): Promise<void> => {
    const receipts = await getB2cApi().chatReadReceipts(bookingId)
    setOtherLastReadAt(receipts.find((receipt) => receipt.profileId !== profileId)?.lastReadAt ?? null)
  }, [bookingId, profileId])

  const reload = useCallback(async (): Promise<void> => {
    try {
      const page = await getB2cApi().chatMessages(bookingId)
      setMessages(page)
      setHasOlder(page.length >= CHAT_PAGE_SIZE)
      setError(null)
      await loadReceipts()
      markRead()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [bookingId, loadReceipts, markRead])

  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0)
    const client = getSupabaseClient()
    const rows = client
      .channel(`chat-rows-${bookingId}-${profileId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_booking_messages', filter: `booking_id=eq.${bookingId}` },
        (payload) => {
          const message = toChatMessage(payload.new)
          // Realtime sends the raw row: keep the client id only on the caller's own messages, and honour removed photos.
          const visible: ChatMessage = { ...message, clientId: message.senderId === profileId ? message.clientId : null }
          setMessages((current) => mergeMessages(current ?? [], [visible]))
          if (visible.clientId !== null) setPending((current) => current.filter((item) => item.clientId !== visible.clientId))
          if (message.senderId !== profileId) {
            setIsOtherTyping(false)
            markRead()
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_booking_chat_reads', filter: `booking_id=eq.${bookingId}` },
        () => void loadReceipts().catch(() => undefined))
      .subscribe()

    const live = client.channel(`booking-chat:${bookingId}`, { config: { private: true, presence: { key: profileId } } })
    live
      .on('broadcast', { event: 'typing' }, (event) => {
        if ((event.payload as { readonly from?: string } | undefined)?.from === profileId) return
        setIsOtherTyping(true)
        if (typingTimer.current !== null) window.clearTimeout(typingTimer.current)
        typingTimer.current = window.setTimeout(() => { setIsOtherTyping(false) }, TYPING_SHOWN_MS)
      })
      .on('presence', { event: 'sync' }, () => {
        setIsOtherOnline(Object.keys(live.presenceState()).some((key) => key !== profileId))
      })
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) void live.track({ at: new Date().toISOString() })
      })
    channelRef.current = live

    return (): void => {
      window.clearTimeout(initial)
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current)
      channelRef.current = null
      void client.removeChannel(rows)
      void client.removeChannel(live)
    }
  }, [bookingId, profileId, reload, loadReceipts, markRead])

  // Coming back to the tab counts as reading what arrived meanwhile.
  useEffect(() => {
    const onVisible = (): void => { if (document.visibilityState === 'visible') markRead() }
    document.addEventListener('visibilitychange', onVisible)
    return (): void => { document.removeEventListener('visibilitychange', onVisible) }
  }, [markRead])

  const loadOlder = useCallback(async (): Promise<void> => {
    const oldest = messages?.at(0)
    if (oldest === undefined || isLoadingOlder) return
    setIsLoadingOlder(true)
    try {
      const page = await getB2cApi().chatMessages(bookingId, oldest.createdAt)
      setMessages((current) => mergeMessages(current ?? [], page))
      setHasOlder(page.length >= CHAT_PAGE_SIZE)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsLoadingOlder(false)
    }
  }, [bookingId, messages, isLoadingOlder])

  const deliver = useCallback((item: PendingMessage): void => {
    const api = getB2cApi()
    const request = item.kind === 'photo' && item.photo !== null
      ? api.sendChatPhoto(bookingId, item.photo, item.clientId)
      : api.sendChatMessage(bookingId, item.body, item.clientId)
    request
      .then((saved) => {
        setMessages((current) => mergeMessages(current ?? [], [saved]))
        setPending((current) => current.filter((entry) => entry.clientId !== item.clientId))
        if (item.previewUrl !== null) URL.revokeObjectURL(item.previewUrl)
      })
      .catch((caught: unknown) => {
        setPending((current) => current.map((entry) => (entry.clientId === item.clientId ? { ...entry, state: 'failed', error: errorMessage(caught) } : entry)))
      })
  }, [bookingId])

  const enqueue = useCallback((item: PendingMessage): void => {
    setPending((current) => [...current, item])
    deliver(item)
  }, [deliver])

  const sendText = useCallback((body: string): void => {
    enqueue({ clientId: newClientId(), kind: 'text', body: body.trim(), photo: null, previewUrl: null, createdAt: new Date().toISOString(), state: 'sending', error: null })
  }, [enqueue])

  const sendPhoto = useCallback((bytes: Uint8Array, previewUrl: string): void => {
    enqueue({ clientId: newClientId(), kind: 'photo', body: '', photo: bytes, previewUrl, createdAt: new Date().toISOString(), state: 'sending', error: null })
  }, [enqueue])

  const retry = useCallback((clientId: string): void => {
    const item = pending.find((entry) => entry.clientId === clientId)
    if (item === undefined) return
    const again: PendingMessage = { ...item, state: 'sending', error: null }
    setPending((current) => current.map((entry) => (entry.clientId === clientId ? again : entry)))
    deliver(again)
  }, [pending, deliver])

  const discard = useCallback((clientId: string): void => {
    setPending((current) => {
      const item = current.find((entry) => entry.clientId === clientId)
      if (item?.previewUrl != null) URL.revokeObjectURL(item.previewUrl)
      return current.filter((entry) => entry.clientId !== clientId)
    })
  }, [])

  const notifyTyping = useCallback((): void => {
    const now = Date.now()
    if (now - lastTypingSent.current < TYPING_SEND_EVERY_MS) return
    lastTypingSent.current = now
    void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { from: profileId } })
  }, [profileId])

  return {
    messages, pending, error, hasOlder, isLoadingOlder, otherLastReadAt, isOtherOnline, isOtherTyping,
    loadOlder, sendText, sendPhoto, retry, discard, notifyTyping, reload,
  }
}
