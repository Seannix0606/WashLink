import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookingChat } from '@washlink/shared'
import { getSupabaseClient } from '../../../infrastructure/supabase/supabaseClient'
import { errorMessage, getB2cApi } from '../b2cApiClient'

export interface BookingChatsState {
  readonly chats: readonly BookingChat[] | null
  readonly error: string | null
  readonly unreadTotal: number
  readonly refresh: () => Promise<void>
}

/**
 * The caller's conversations and the unread total, kept live. Any new message or read receipt the caller is allowed to see
 * (the database's row rules decide) triggers a refresh, with a slow poll as a fallback for a dropped connection.
 */
export function useBookingChats(profileId: string): BookingChatsState {
  const [chats, setChats] = useState<readonly BookingChat[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<number | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setChats(await getB2cApi().myChats())
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [])

  useEffect(() => {
    // Bursts of events (a message plus its receipt) collapse into one refresh.
    const soon = (): void => {
      if (pending.current !== null) window.clearTimeout(pending.current)
      pending.current = window.setTimeout(() => { pending.current = null; void refresh() }, 250)
    }
    const initial = window.setTimeout(() => void refresh(), 0)
    const poll = window.setInterval(() => void refresh(), 60000)
    const client = getSupabaseClient()
    const channel = client
      .channel(`chat-list-${profileId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_booking_messages' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_booking_chat_reads' }, soon)
      .subscribe()
    return (): void => {
      window.clearTimeout(initial)
      window.clearInterval(poll)
      if (pending.current !== null) window.clearTimeout(pending.current)
      void client.removeChannel(channel)
    }
  }, [profileId, refresh])

  const unreadTotal = (chats ?? []).reduce((total, chat) => total + chat.unreadCount, 0)
  return { chats, error, unreadTotal, refresh }
}
