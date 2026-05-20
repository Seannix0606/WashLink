import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Booking } from '../../domain/models/Booking'
import type { CreateWorkerInput, Worker } from '../../domain/models/Worker'
import type { WorkerRepository } from '../../domain/repositories/WorkerRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import {
  mapSupabaseBookingRowToBooking,
  supabaseBookingSelectColumns,
  type SupabaseBookingRow,
} from '../supabase/supabaseBookingRow'

interface SupabaseWorkerRow {
  id: string
  name: string
  phone_number: string
  is_available: boolean
}

export class SupabaseWorkerRepository implements WorkerRepository {
  public async fetchWorkersByOwner(ownerIdentifier: string): Promise<Worker[]> {
    const { data, error } = await getSupabaseClient()
      .from('workers')
      .select('id, name, phone_number, is_available')
      .eq('owner_id', ownerIdentifier)

    if (error) {
      throw new Error(`Failed to fetch workers for owner: ${error.message}`)
    }

    const workerRows: SupabaseWorkerRow[] = data
    return workerRows.map((workerRow) => this.mapWorkerRowToWorker(workerRow))
  }

  public async fetchWorkerByIdentifier(workerIdentifier: string): Promise<Worker> {
    const { data, error } = await getSupabaseClient()
      .from('workers')
      .select('id, name, phone_number, is_available')
      .eq('id', workerIdentifier)
      .single()

    if (error) {
      throw new Error(`Failed to fetch worker profile: ${error.message}`)
    }

    const workerRow: SupabaseWorkerRow = data
    return this.mapWorkerRowToWorker(workerRow)
  }

  public async fetchWorkerByUserIdentifier(workerUserIdentifier: string): Promise<Worker> {
    const { data, error } = await getSupabaseClient()
      .from('workers')
      .select('id, name, phone_number, is_available')
      .eq('user_id', workerUserIdentifier)
      .single()

    if (error) {
      throw new Error(`Failed to fetch worker profile by user identifier: ${error.message}`)
    }

    const workerRow: SupabaseWorkerRow = data
    return this.mapWorkerRowToWorker(workerRow)
  }

  public async createWorkerForOwner(
    ownerIdentifier: string,
    createWorkerInput: CreateWorkerInput,
  ): Promise<Worker> {
    const { data, error } = await getSupabaseClient()
      .from('workers')
      .insert({
        owner_id: ownerIdentifier,
        name: createWorkerInput.name,
        phone_number: createWorkerInput.phoneNumber,
        is_available: true,
      })
      .select('id, name, phone_number, is_available')
      .single()

    if (error) {
      throw new Error(`Failed to create worker: ${error.message}`)
    }

    const workerRow: SupabaseWorkerRow = data
    return this.mapWorkerRowToWorker(workerRow)
  }

  public async deleteWorker(workerIdentifier: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from('workers')
      .delete()
      .eq('id', workerIdentifier)

    if (error) {
      throw new Error(`Failed to delete worker: ${error.message}`)
    }
  }

  public async updateWorkerAvailability(
    workerIdentifier: string,
    isAvailableForNewJobs: boolean,
  ): Promise<Worker> {
    const { data, error } = await getSupabaseClient()
      .from('workers')
      .update({ is_available: isAvailableForNewJobs })
      .eq('id', workerIdentifier)
      .select('id, name, phone_number, is_available')
      .single()

    if (error) {
      throw new Error(`Failed to update worker availability: ${error.message}`)
    }

    const workerRow: SupabaseWorkerRow = data
    return this.mapWorkerRowToWorker(workerRow)
  }

  public async assignWorkerToBooking(
    bookingIdentifier: string,
    workerIdentifier: string,
  ): Promise<Booking> {
    const { data, error } = await getSupabaseClient()
      .from('bookings')
      .update({ assigned_worker_id: workerIdentifier })
      .eq('id', bookingIdentifier)
      .select(supabaseBookingSelectColumns)
      .single()

    if (error) {
      throw new Error(`Failed to assign worker to booking: ${error.message}`)
    }

    const bookingRow: SupabaseBookingRow = data
    return mapSupabaseBookingRowToBooking(bookingRow)
  }

  public subscribeToWorkerRowUpdatesForOwner(
    ownerIdentifier: string,
    onWorkerRowUpdated: (worker: Worker) => void,
  ): RealtimeChannel {
    return getSupabaseClient()
      .channel(`workers-updates-for-owner-${ownerIdentifier}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workers',
          filter: `owner_id=eq.${ownerIdentifier}`,
        },
        (payload) => {
          const updatedWorkerRow = payload.new as SupabaseWorkerRow
          const updatedWorker = this.mapWorkerRowToWorker(updatedWorkerRow)
          onWorkerRowUpdated(updatedWorker)
        },
      )
      .subscribe()
  }

  public async unsubscribeFromWorkerRealtimeChannel(
    workerRealtimeChannel: RealtimeChannel,
  ): Promise<void> {
    await getSupabaseClient().removeChannel(workerRealtimeChannel)
  }

  private mapWorkerRowToWorker(workerRow: SupabaseWorkerRow): Worker {
    return {
      workerIdentifier: workerRow.id,
      workerName: workerRow.name,
      workerPhoneNumber: workerRow.phone_number,
      isAvailable: workerRow.is_available,
    }
  }
}
