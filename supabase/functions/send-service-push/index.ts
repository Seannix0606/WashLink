// Sends a phone push for a new B2C notification. NOT DEPLOYED AND NEVER RUN against Expo: it needs a real device and an Expo account
// to verify. See docs/b2c/DEPLOYMENT.md for the database webhook that calls it.
//
// The service role key is only available here, on the server. It is never in the web or mobile apps.
import { createClient } from 'npm:@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const PUSH_CATEGORIES = new Set(['service_booking.update', 'service_booking.request', 'service_booking.request_closed'])

interface NotificationRow {
  readonly recipient_id: string
  readonly category: string
  readonly title: string
  readonly body: string
}

Deno.serve(async (request) => {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET')
  if (!secret || request.headers.get('x-webhook-secret') !== secret) {
    return new Response('Forbidden', { status: 403 })
  }
  const payload = (await request.json()) as { record?: NotificationRow }
  const row = payload.record
  if (!row || !PUSH_CATEGORIES.has(row.category)) {
    return new Response('Ignored', { status: 200 })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })
  const { data: devices, error } = await admin.from('device_push_tokens').select('token').eq('profile_id', row.recipient_id)
  if (error) {
    return new Response('Could not read devices', { status: 500 })
  }
  if (!devices || devices.length === 0) {
    return new Response('No devices', { status: 200 })
  }

  // '/' sends each account to its own home screen. The app only opens routes on its own allowed list.
  const messages = devices.map(({ token }) => ({
    to: token, title: row.title, body: row.body, channelId: 'bookings', data: { route: row.category === 'service_booking.request' ? '/worker' : '/' },
  }))
  const response = await fetch(EXPO_PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(messages) })
  if (!response.ok) {
    return new Response('Push service refused', { status: 502 })
  }

  // Stop sending to phones that have uninstalled the app.
  const result = (await response.json()) as { data?: readonly { status: string; details?: { error?: string } }[] }
  const staleTokens = (result.data ?? [])
    .map((ticket, index) => (ticket.details?.error === 'DeviceNotRegistered' ? devices[index].token : null))
    .filter((token): token is string => token !== null)
  if (staleTokens.length > 0) {
    await admin.from('device_push_tokens').delete().in('token', staleTokens)
  }
  return new Response('Sent', { status: 200 })
})
