import type { KeyboardEvent, ReactElement } from 'react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, CalendarClock, ImagePlus, MapPin, RotateCcw, SendHorizontal, X } from 'lucide-react'
import {
  CHAT_MESSAGE_MAX_LENGTH, chatMessageDelivery, chatPhotoProblem, formatManilaDateTime, formatManilaTime, manilaDayKey,
  type BookingChat, type ChatMessage,
} from '@washlink/shared'
import { Avatar, Button, IconButton, Skeleton, StatusPill } from '../../../presentation/design/ui'
import { joinClassNames } from '../../../presentation/design/classNames'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { chatDayLabel } from './chatFormat'
import { useBookingChat, type PendingMessage } from './useBookingChat'

interface ChatThreadProps {
  readonly chat: BookingChat
  readonly profileId: string
  readonly isVisible: boolean
  readonly onBack: () => void
  readonly onViewBooking: () => void
}

const NEAR_BOTTOM_PX = 140

/** One booking's conversation: booking details on top, messages by day, then the message box. */
export function ChatThread({ chat, profileId, isVisible, onBack, onViewBooking }: ChatThreadProps): ReactElement {
  const state = useBookingChat(chat.bookingId, profileId, isVisible)
  const scroller = useRef<HTMLDivElement>(null)
  const keepOffset = useRef<number | null>(null)
  const wasNearBottom = useRef(true)
  const messageCount = (state.messages?.length ?? 0) + state.pending.length
  const ownLast = [...(state.messages ?? [])].reverse().find((message) => message.senderId === profileId)

  // Stay at the newest message when it arrives, unless the person scrolled up to read; keep place when older ones load.
  useLayoutEffect(() => {
    const box = scroller.current
    if (box === null) return
    if (keepOffset.current !== null) {
      box.scrollTop = box.scrollHeight - keepOffset.current
      keepOffset.current = null
      return
    }
    if (wasNearBottom.current) box.scrollTop = box.scrollHeight
  }, [messageCount, state.isOtherTyping])

  const onScroll = (): void => {
    const box = scroller.current
    if (box === null) return
    wasNearBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX
    if (box.scrollTop < 80 && state.hasOlder && !state.isLoadingOlder) {
      keepOffset.current = box.scrollHeight - box.scrollTop
      void state.loadOlder()
    }
  }

  const shownMessages = state.messages ?? []
  return (
    <section aria-label={`Conversation with ${chat.otherName}`} className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--color-card-border)] px-3 py-2.5">
        <IconButton className="lg:hidden" size="sm" accessibleLabel="Back to conversations" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack} />
        <span className="relative">
          <Avatar fullName={chat.otherName} size="md" />
          <span aria-hidden="true" className={joinClassNames('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--color-card)]',
            state.isOtherOnline ? 'bg-[var(--color-success-500)]' : 'bg-[var(--color-ink-300)]')} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink-900)]">{chat.otherName}</h2>
          <p className="text-xs text-[var(--color-ink-500)]" aria-live="polite">
            {state.isOtherTyping ? 'Typing…' : state.isOtherOnline ? 'Online' : 'Offline'}
          </p>
        </div>
        <StatusPill status={chat.status} />
      </header>

      <div className="border-b border-[var(--color-card-border)] bg-[var(--color-section-head)] px-4 py-2.5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-[var(--color-ink-900)]">{chat.serviceName} · {chat.reference}</p>
          <Button size="sm" variant="ghost" onClick={onViewBooking}>View booking</Button>
        </div>
        <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--color-ink-700)]">
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{formatManilaDateTime(chat.scheduledAt)}</span>
          {chat.address !== null ? <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{chat.address}</span></span> : null}
        </p>
      </div>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-[var(--color-surface-muted)] px-3 py-4 sm:px-5"
        role="log" aria-label="Messages" aria-live="polite">
        {state.isLoadingOlder ? <p className="text-center text-xs text-[var(--color-ink-500)]">Loading earlier messages…</p> : null}
        {state.hasOlder && !state.isLoadingOlder ? (
          <div className="text-center">
            <Button size="sm" variant="ghost" onClick={(): void => {
              const box = scroller.current
              if (box !== null) keepOffset.current = box.scrollHeight - box.scrollTop
              void state.loadOlder()
            }}>Load earlier messages</Button>
          </div>
        ) : null}
        {state.error !== null ? (
          <div role="alert" className="mx-auto max-w-sm space-y-2 rounded-[var(--radius-control)] bg-[var(--color-danger-50)] p-3 text-center text-sm text-[var(--color-danger-600)]">
            <p>{state.error}</p>
            <Button size="sm" variant="secondary" onClick={(): void => void state.reload()}>Try again</Button>
          </div>
        ) : null}
        {state.messages === null && state.error === null ? (
          <div className="space-y-3">
            <Skeleton heightClassName="h-12" widthClassName="w-2/3" />
            <Skeleton heightClassName="h-12" widthClassName="w-1/2 ml-auto" />
            <Skeleton heightClassName="h-12" widthClassName="w-3/5" />
          </div>
        ) : null}
        {state.messages !== null && state.messages.length === 0 && state.pending.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-ink-500)]">Say hello. Messages here are only between you and {chat.otherName}.</p>
        ) : null}
        {shownMessages.map((message, index) => {
          const day = manilaDayKey(message.createdAt)
          const previous = shownMessages.at(index - 1)
          const isNewDay = index === 0 || previous === undefined || manilaDayKey(previous.createdAt) !== day
          return (
            <Fragment key={message.id}>
              {isNewDay ? <DaySeparator label={chatDayLabel(day)} /> : null}
              <MessageRow message={message} isMine={message.senderId === profileId}
                delivery={message.id === ownLast?.id ? chatMessageDelivery(message, state.otherLastReadAt) : null} />
            </Fragment>
          )
        })}
        {state.pending.map((item) => <PendingRow key={item.clientId} item={item} onRetry={state.retry} onDiscard={state.discard} />)}
        {state.isOtherTyping ? (
          <div className="flex items-center gap-1 px-1 py-1" aria-hidden="true">
            {[0, 150, 300].map((delay) => <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-ink-400)] motion-reduce:animate-none" style={{ animationDelay: `${String(delay)}ms` }} />)}
          </div>
        ) : null}
      </div>

      {chat.isOpen ? (
        <Composer onSendText={state.sendText} onSendPhoto={state.sendPhoto} onTyping={state.notifyTyping} />
      ) : (
        <p className="border-t border-[var(--color-card-border)] px-4 py-3 text-center text-sm text-[var(--color-ink-700)]">
          This conversation is closed. Chats close 24 hours after a booking ends; the messages stay here to read.
        </p>
      )}
    </section>
  )
}

function DaySeparator({ label }: { readonly label: string }): ReactElement {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-[var(--color-card-border)]" />
      <span className="text-xs font-semibold text-[var(--color-ink-500)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--color-card-border)]" />
    </div>
  )
}

const bubbleShape = (isMine: boolean): string => joinClassNames(
  'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-[0_1px_1px_rgb(10_39_49/0.06)] sm:max-w-[65%]',
  isMine ? 'rounded-br-md bg-[var(--color-primary)] text-white' : 'rounded-bl-md border border-[var(--color-card-border)] bg-[var(--color-card)] text-[var(--color-ink-900)]',
)

function MessageRow({ message, isMine, delivery }: { readonly message: ChatMessage; readonly isMine: boolean; readonly delivery: 'sent' | 'seen' | null }): ReactElement {
  if (message.kind === 'system') {
    return (
      <p className="mx-auto w-fit max-w-[90%] rounded-full bg-[var(--color-section-head)] px-3 py-1 text-center text-xs font-medium text-[var(--color-ink-700)]">
        {message.body} <span className="text-[var(--color-ink-500)]">· {formatManilaTime(message.createdAt)}</span>
      </p>
    )
  }
  return (
    <div className={joinClassNames('flex flex-col', isMine ? 'items-end' : 'items-start')}>
      <div className={bubbleShape(isMine)}>
        {message.kind === 'photo' ? <ChatPhoto message={message} /> : <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>}
        <p className={joinClassNames('mt-1 text-right text-[11px]', isMine ? 'text-[var(--color-on-primary-soft)]' : 'text-[var(--color-ink-500)]')}>{formatManilaTime(message.createdAt)}</p>
      </div>
      {delivery !== null ? <p className="mt-0.5 pr-1 text-[11px] font-medium text-[var(--color-ink-500)]">{delivery === 'seen' ? 'Seen' : 'Sent'}</p> : null}
    </div>
  )
}

function PendingRow({ item, onRetry, onDiscard }: { readonly item: PendingMessage; readonly onRetry: (clientId: string) => void; readonly onDiscard: (clientId: string) => void }): ReactElement {
  const isFailed = item.state === 'failed'
  return (
    <div className="flex flex-col items-end">
      <div className={joinClassNames(bubbleShape(true), isFailed ? 'opacity-70' : 'opacity-80')}>
        {item.kind === 'photo' && item.previewUrl !== null
          ? <img src={item.previewUrl} alt="Photo being sent" className="max-h-64 rounded-lg object-cover" />
          : <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{item.body}</p>}
      </div>
      {isFailed ? (
        <div role="alert" className="mt-1 flex flex-wrap items-center justify-end gap-2 text-xs text-[var(--color-danger-600)]">
          <span>{item.error ?? 'Not sent.'}</span>
          <button type="button" className="inline-flex cursor-pointer items-center gap-1 font-semibold underline" onClick={(): void => { onRetry(item.clientId) }}>
            <RotateCcw className="h-3 w-3" aria-hidden="true" />Retry
          </button>
          <button type="button" className="inline-flex cursor-pointer items-center gap-1 font-semibold underline" onClick={(): void => { onDiscard(item.clientId) }}>
            <X className="h-3 w-3" aria-hidden="true" />Remove
          </button>
        </div>
      ) : <p className="mt-0.5 pr-1 text-[11px] text-[var(--color-ink-500)]">Sending…</p>}
    </div>
  )
}

/** Opens the photo through the database's read rule; it is never a public link. */
function ChatPhoto({ message }: { readonly message: ChatMessage }): ReactElement {
  const [url, setUrl] = useState<string | null>(null)
  const [isBroken, setIsBroken] = useState(false)
  const photoObject = message.photoObject

  useEffect(() => {
    if (photoObject === null) return
    let objectUrl: string | null = null
    let isCurrent = true
    getB2cApi().openChatPhoto(photoObject)
      .then((blob) => {
        if (!isCurrent) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => { if (isCurrent) setIsBroken(true) })
    return (): void => {
      isCurrent = false
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [photoObject])

  if (message.isPhotoRemoved || photoObject === null) return <p className="italic">Photo removed after 90 days</p>
  if (isBroken) return <p className="italic">This photo could not be opened</p>
  if (url === null) return <Skeleton heightClassName="h-40" widthClassName="w-56" />
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img src={url} alt="Photo in this conversation" className="max-h-72 rounded-lg object-cover" />
    </a>
  )
}

function Composer({ onSendText, onSendPhoto, onTyping }: {
  readonly onSendText: (body: string) => void
  readonly onSendPhoto: (bytes: Uint8Array, previewUrl: string) => void
  readonly onTyping: () => void
}): ReactElement {
  const [text, setText] = useState('')
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const canSend = text.trim() !== '' && text.trim().length <= CHAT_MESSAGE_MAX_LENGTH

  const send = (): void => {
    if (!canSend) return
    onSendText(text)
    setText('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }
  const pickPhoto = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const problem = chatPhotoProblem(bytes)
      if (problem !== null) {
        setPhotoError(problem)
        return
      }
      setPhotoError(null)
      onSendPhoto(bytes, URL.createObjectURL(file))
    } catch (caught) {
      setPhotoError(errorMessage(caught))
    }
  }

  return (
    <div className="border-t border-[var(--color-card-border)] bg-[var(--color-card)] p-2.5 sm:p-3">
      {photoError !== null ? <p role="alert" className="mb-2 text-xs text-[var(--color-danger-600)]">{photoError}</p> : null}
      <div className="flex items-end gap-2">
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(event): void => { void pickPhoto(event.target.files?.[0]); event.target.value = '' }} />
        <IconButton accessibleLabel="Add a photo" icon={<ImagePlus className="h-5 w-5" />} onClick={(): void => { fileInput.current?.click() }} />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Message</span>
          <textarea value={text} rows={1} maxLength={CHAT_MESSAGE_MAX_LENGTH} placeholder="Type a message…"
            className="max-h-32 min-h-10 w-full resize-none rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-3.5 py-2 text-sm text-[var(--color-ink-900)] outline-none [field-sizing:content] placeholder:text-[var(--color-ink-400)] focus:border-[var(--color-brand-600)]"
            onChange={(event): void => { setText(event.target.value); onTyping() }} onKeyDown={onKeyDown} />
        </label>
        <IconButton tone="brand" accessibleLabel="Send" disabled={!canSend} icon={<SendHorizontal className="h-5 w-5" />} onClick={send} />
      </div>
    </div>
  )
}
