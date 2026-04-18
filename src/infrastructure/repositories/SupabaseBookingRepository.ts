import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Booking, BookingStatus, CreateBookingInput } from '../../domain/models/Booking'
import type { BookingRepository } from '../../domain/repositories/BookingRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import {
  mapSupabaseBookingRowToBooking,
  supabaseBookingSelectColumns,
  type SupabaseBookingRow,
} from '../supabase/supabaseBookingRow'

interface CreateBookingRow {
  customer_name: string
  vehicle_type: string
  service_type: string
  address: string
  time: string
  booking_status: string
  customer_id: string
  shop_id: string | null
  latitude: number | null
  longitude: number | null
}

export class SupabaseBookingRepository implements BookingRepository {
  public async fetchBookings(): Promise<Booking[]> {
    const { data, error } = await getSupabaseClient()
      .from('bookings')
      .select(supabaseBookingSelectColumns)
      .order('time', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch bookings: ${error.message}`)
    }

    const bookingRows: SupabaseBookingRow[] = data
    return bookingRows.map((bookingRow) => mapSupabaseBookingRowToBooking(bookingRow))
  }

  public async fetchBookingsByWorker(workerIdentifier: string): Promise<Booking[]> {
    const { data, error } = await getSupabaseClient()
      .from('bookings')
      .select(supabaseBookingSelectColumns)
      .eq('assigned_worker_id', workerIdentifier)
      .in('booking_status', ['accepted', 'in_progress', 'completed'])
      .order('time', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch bookings for worker: ${error.message}`)
    }

    const bookingRows: SupabaseBookingRow[] = data
    return bookingRows.map((bookingRow) => mapSupabaseBookingRowToBooking(bookingRow))
  }

  public async fetchBookingsByCustomer(
    customerIdentifier: string,
  ): Promise<Booking[]> {
    const { data, error } = await getSupabaseClient()
      .from('bookings')
      .select(supabaseBookingSelectColumns)
      .eq('customer_id', customerIdentifier)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch bookings for customer: ${error.message}`)
    }

    const bookingRows: SupabaseBookingRow[] = data
    return bookingRows.map((bookingRow) =>
      mapSupabaseBookingRowToBooking(bookingRow),
    )
  }

  public async createBooking(
    createBookingInput: CreateBookingInput,
    customerIdentifier: string,
  ): Promise<Booking> {
    const createBookingRow = this.mapCreateBookingInputToCreateBookingRow(
      createBookingInput,
      customerIdentifier,
    )

    const { data, error } = await getSupabaseClient()
      .from('bookings')
      .insert(createBookingRow)
      .select(supabaseBookingSelectColumns)
      .single()

    if (error) {
      throw new Error(`Failed to create booking: ${error.message}`)
    }

    const bookingRow: SupabaseBookingRow = data
    return mapSupabaseBookingRowToBooking(bookingRow)
  }

  public async updateBookingStatus(
    bookingIdentifier: string,
    bookingStatus: BookingStatus,
  ): Promise<Booking> {
    const { data, error } = await getSupabaseClient()
      .from('bookings')
      .update({ booking_status: bookingStatus })
      .eq('id', bookingIdentifier)
      .select(supabaseBookingSelectColumns)
      .single()

    if (error) {
      throw new Error(`Failed to update booking status: ${error.message}`)
    }

    const bookingRow: SupabaseBookingRow = data
    return mapSupabaseBookingRowToBooking(bookingRow)
  }

  public async updateBookingStatusForAssignedWorker(
    bookingIdentifier: string,
    assignedWorkerIdentifier: string,
    bookingStatus: BookingStatus,
  ): Promise<Booking> {
    const { data, error } = await getSupabaseClient()
      .from('bookings')
      .update({ booking_status: bookingStatus })
      .eq('id', bookingIdentifier)
      .eq('assigned_worker_id', assignedWorkerIdentifier)
      .select(supabaseBookingSelectColumns)
      .single()

    if (error) {
      throw new Error(
        `Failed to update booking status for assigned worker: ${error.message}`,
      )
    }

    const bookingRow: SupabaseBookingRow = data
    return mapSupabaseBookingRowToBooking(bookingRow)
  }

  public subscribeToBookingRealtimeEvents(handlers: {
    onBookingInserted: (booking: Booking) => void
    onBookingUpdated: (booking: Booking) => void
  }): RealtimeChannel {
    return getSupabaseClient()
      .channel('bookings-realtime-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
        },
        (payload) => {
          const bookingRow = payload.new as SupabaseBookingRow
          const booking = mapSupabaseBookingRowToBooking(bookingRow)
          handlers.onBookingInserted(booking)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
        },
        (payload) => {
          const bookingRow = payload.new as SupabaseBookingRow
          const booking = mapSupabaseBookingRowToBooking(bookingRow)
          handlers.onBookingUpdated(booking)
        },
      )
      .subscribe()
  }

  public async unsubscribeFromBookingChannel(
    realtimeChannel: RealtimeChannel,
  ): Promise<void> {
    await getSupabaseClient().removeChannel(realtimeChannel)
  }

  private mapCreateBookingInputToCreateBookingRow(
    createBookingInput: CreateBookingInput,
    customerIdentifier: string,
  ): CreateBookingRow {
    return {
      customer_name: createBookingInput.customerName,
      vehicle_type: createBookingInput.vehicleType,
      service_type: createBookingInput.serviceType,
      address: createBookingInput.address,
      time: createBookingInput.time,
      booking_status: 'pending',
      customer_id: customerIdentifier,
      shop_id: createBookingInput.shopIdentifier,
      latitude: createBookingInput.latitude,
      longitude: createBookingInput.longitude,
    }
  }
}
