import type { ServiceBookingStatus } from './bookingStatus'
import type { BookingQuote, PaymentStatus, VehicleCategory } from './catalog'
import type { AssignedBooking, CatalogAddon, CatalogService, CustomerBooking, DispatchRequest, NewBookingInput, SavedAddress, SavedVehicle, TimeSlot, WorkerAccount, WorkerHoursRow, WorkerSummary } from './b2cTypes'
import { nullableNum, nullableStr, num, rows, run, str, strs, type B2cSupabaseClient, type Row } from './b2cRequest'
import { createWorkerDocumentsApi } from './workerDocuments'
import { createBookingMessagesApi } from './bookingMessages'

export { B2cRequestError } from './b2cRequest'
export type { B2cSupabaseClient } from './b2cRequest'
export * from './b2cFormat'
export * from './b2cTypes'

/**
 * The B2C data calls, shared by web and mobile so neither can drift. The database decides everything; this
 * only maps rows and errors. It takes a Supabase client structurally, so the package stays free of dependencies.
 */

function toAssigned(r: Row): AssignedBooking {
  return {
    id: str(r.booking_id), reference: str(r.reference), status: str(r.status) as ServiceBookingStatus,
    serviceName: str(r.service_name), addonNames: strs(r.addon_names), vehicleCategory: str(r.vehicle_category) as VehicleCategory,
    vehicleMake: str(r.vehicle_make), vehicleModel: str(r.vehicle_model), scheduledAt: str(r.scheduled_at),
    durationMinutes: num(r.duration_minutes), workerEarningsCents: num(r.worker_earnings_cents),
    customerTotalCents: num(r.customer_total_cents), paymentMethod: str(r.payment_method), address: nullableStr(r.address),
    latitude: nullableNum(r.latitude), longitude: nullableNum(r.longitude), landmark: nullableStr(r.landmark),
    instructions: nullableStr(r.instructions), customerName: nullableStr(r.customer_name), customerPhone: nullableStr(r.customer_phone),
  }
}

function toWorkerAccount(r: Row): WorkerAccount {
  return {
    verificationStatus: str(r.verification_status) as WorkerAccount['verificationStatus'],
    verificationNote: nullableStr(r.verification_note), bio: str(r.bio), skills: strs(r.skills),
    baseLatitude: nullableNum(r.base_latitude), baseLongitude: nullableNum(r.base_longitude),
    serviceRadiusKm: num(r.service_radius_km), isOnline: r.is_online === true, isPlatformOperator: r.is_platform_operator === true,
  }
}

export type B2cApi = ReturnType<typeof createB2cApi>

export function createB2cApi(client: B2cSupabaseClient) {
  return {
    ...createWorkerDocumentsApi(client),
    ...createBookingMessagesApi(client),
    async bookingsAreOpen(): Promise<boolean> {
      const result = await rows(client.rpc('b2c_public_status'))
      return result[0]?.bookings_open === true
    },
    async listServices(): Promise<readonly CatalogService[]> {
      const result = await rows(client.from('services').select('*, service_vehicle_prices(vehicle_category)').order('sort_order'))
      return result.map((r) => ({
        id: str(r.id), key: str(r.key), category: str(r.category), name: str(r.name), description: str(r.description),
        imageUrl: nullableStr(r.image_url), requirements: str(r.requirements), basePriceCents: num(r.base_price_cents),
        durationMinutes: num(r.duration_minutes), priceIsDraft: r.price_is_draft === true,
        supportedVehicles: (Array.isArray(r.service_vehicle_prices) ? (r.service_vehicle_prices as Row[]) : [])
          .map((v) => str(v.vehicle_category) as VehicleCategory),
      }))
    },
    async listAddons(): Promise<readonly CatalogAddon[]> {
      const result = await rows(client.from('service_addons').select('*').order('sort_order'))
      return result.map((r) => ({
        id: str(r.id), name: str(r.name), description: str(r.description), priceCents: num(r.price_cents),
        durationMinutes: num(r.duration_minutes), priceIsDraft: r.price_is_draft === true,
      }))
    },
    async quote(serviceId: string, category: VehicleCategory, addonIds: readonly string[]): Promise<BookingQuote & { readonly priceIsDraft: boolean }> {
      const [r] = await rows(client.rpc('service_booking_quote', { p_service: serviceId, p_vehicle_category: category, p_addons: addonIds }))
      return {
        basePriceCents: num(r?.base_price_cents), vehicleAdjustmentCents: num(r?.vehicle_adjustment_cents),
        addonsTotalCents: num(r?.addons_total_cents), customerTotalCents: num(r?.customer_total_cents),
        workerEarningsCents: num(r?.worker_earnings_cents), platformFeeCents: num(r?.platform_fee_cents),
        durationMinutes: num(r?.duration_minutes), priceIsDraft: r?.price_is_draft === true,
      }
    },
    async availableSlots(input: { date: string; serviceId: string; category: VehicleCategory; addonIds: readonly string[];
      latitude: number | null; longitude: number | null }): Promise<readonly TimeSlot[]> {
      const result = await rows(client.rpc('service_booking_available_slots', {
        p_date: input.date, p_service: input.serviceId, p_vehicle_category: input.category, p_addons: input.addonIds,
        p_latitude: input.latitude, p_longitude: input.longitude,
      }))
      return result.map((r) => ({ startsAt: str(r.slot_start), isAvailable: r.is_available === true }))
    },
    async createBooking(input: NewBookingInput): Promise<{ readonly id: string; readonly reference: string; readonly status: ServiceBookingStatus }> {
      const [r] = await rows(client.rpc('create_service_booking', {
        p_service: input.serviceId, p_vehicle_category: input.vehicleCategory, p_vehicle_make: input.vehicleMake,
        p_vehicle_model: input.vehicleModel, p_vehicle_year: input.vehicleYear, p_addons: input.addonIds, p_address: input.address,
        p_latitude: input.latitude, p_longitude: input.longitude, p_landmark: input.landmark, p_instructions: input.instructions,
        p_is_immediate: input.isImmediate, p_scheduled_at: input.scheduledAt, p_submission_key: input.submissionKey,
      }))
      return { id: str(r?.booking_id), reference: str(r?.reference), status: str(r?.status) as ServiceBookingStatus }
    },
    async myBookings(): Promise<readonly CustomerBooking[]> {
      const result = await rows(client.rpc('my_service_bookings'))
      return result.map((r) => ({
        id: str(r.booking_id), reference: str(r.reference), status: str(r.status) as ServiceBookingStatus, serviceName: str(r.service_name),
        addonNames: strs(r.addon_names), vehicleCategory: str(r.vehicle_category) as VehicleCategory, vehicleMake: str(r.vehicle_make),
        vehicleModel: str(r.vehicle_model), address: str(r.address), isImmediate: r.is_immediate === true, scheduledAt: str(r.scheduled_at),
        durationMinutes: num(r.duration_minutes), customerTotalCents: num(r.customer_total_cents), paymentMethod: str(r.payment_method),
        paymentStatus: str(r.payment_status) as PaymentStatus, workerName: str(r.worker_name), workerPhone: nullableStr(r.worker_phone),
        hasReview: r.has_review === true,
      }))
    },
    cancelBooking: async (id: string, reason?: string): Promise<void> => {
      await run(client.rpc('cancel_service_booking', { p_booking: id, p_reason: reason ?? null }))
    },
    retrySearch: async (id: string): Promise<void> => {
      await run(client.rpc('retry_service_booking_search', { p_booking: id }))
    },
    reviewBooking: async (id: string, rating: number, comment: string): Promise<void> => {
      await run(client.rpc('review_service_booking', { p_booking: id, p_rating: rating, p_comment: comment }))
    },
    async listAddresses(): Promise<readonly SavedAddress[]> {
      const result = await rows(client.from('customer_addresses').select('*').order('created_at', { ascending: false }))
      return result.map((r) => ({
        id: str(r.id), label: str(r.label), address: str(r.address), latitude: num(r.latitude), longitude: num(r.longitude),
        landmark: str(r.landmark), instructions: str(r.instructions),
      }))
    },
    saveAddress: async (customerId: string, input: Omit<SavedAddress, 'id'>): Promise<void> => {
      await run(client.from('customer_addresses').insert({ customer_id: customerId, ...input }))
    },
    deleteAddress: async (id: string): Promise<void> => {
      await run(client.from('customer_addresses').delete().eq('id', id))
    },
    async listVehicles(): Promise<readonly SavedVehicle[]> {
      const result = await rows(client.from('customer_vehicles').select('*').order('created_at', { ascending: false }))
      return result.map((r) => ({
        id: str(r.id), category: str(r.category) as VehicleCategory, make: str(r.make), model: str(r.model), year: nullableNum(r.year),
      }))
    },
    saveVehicle: async (customerId: string, input: Omit<SavedVehicle, 'id'>): Promise<void> => {
      await run(client.from('customer_vehicles').insert({ customer_id: customerId, ...input }))
    },
    deleteVehicle: async (id: string): Promise<void> => {
      await run(client.from('customer_vehicles').delete().eq('id', id))
    },
    async workerAccount(workerId: string): Promise<WorkerAccount | null> {
      const result = await rows(client.from('independent_workers').select('*').eq('profile_id', workerId))
      return result[0] ? toWorkerAccount(result[0]) : null
    },
    saveWorkerProfile: async (input: { bio: string; skills: readonly string[]; latitude: number | null; longitude: number | null; radiusKm: number }): Promise<void> => {
      await run(client.rpc('save_independent_worker_profile', {
        p_bio: input.bio, p_skills: input.skills, p_latitude: input.latitude, p_longitude: input.longitude, p_radius_km: input.radiusKm,
      }))
    },
    setOnline: async (isOnline: boolean): Promise<void> => {
      await run(client.rpc('set_independent_worker_online', { p_is_online: isOnline }))
    },
    heartbeat: async (): Promise<void> => {
      await run(client.rpc('independent_worker_heartbeat'))
    },
    async workerHours(): Promise<readonly WorkerHoursRow[]> {
      const result = await rows(client.from('independent_worker_hours').select('*').order('weekday'))
      return result.map((r) => ({ weekday: num(r.weekday), startMinute: num(r.start_minute), endMinute: num(r.end_minute) }))
    },
    saveWorkerDay: async (workerId: string, weekday: number, range: { startMinute: number; endMinute: number } | null): Promise<void> => {
      await run(client.from('independent_worker_hours').delete().eq('worker_id', workerId).eq('weekday', weekday))
      if (range) {
        await run(client.from('independent_worker_hours').insert({ worker_id: workerId, weekday, start_minute: range.startMinute, end_minute: range.endMinute }))
      }
    },
    async workerServiceIds(): Promise<readonly string[]> {
      const result = await rows(client.from('independent_worker_services').select('service_id'))
      return result.map((r) => str(r.service_id))
    },
    setWorkerService: async (workerId: string, serviceId: string, isOffered: boolean): Promise<void> => {
      await run(isOffered
        ? client.from('independent_worker_services').insert({ worker_id: workerId, service_id: serviceId })
        : client.from('independent_worker_services').delete().eq('worker_id', workerId).eq('service_id', serviceId))
    },
    async dispatchRequests(): Promise<readonly DispatchRequest[]> {
      const result = await rows(client.rpc('my_dispatch_requests'))
      return result.map((r) => ({
        id: str(r.request_id), bookingId: str(r.booking_id), reference: str(r.reference), serviceName: str(r.service_name),
        addonNames: strs(r.addon_names), vehicleCategory: str(r.vehicle_category) as VehicleCategory, isImmediate: r.is_immediate === true,
        scheduledAt: str(r.scheduled_at), durationMinutes: num(r.duration_minutes), distanceKm: nullableNum(r.distance_km),
        workerEarningsCents: num(r.worker_earnings_cents), expiresAt: str(r.expires_at),
      }))
    },
    acceptRequest: async (id: string): Promise<void> => {
      await run(client.rpc('accept_dispatch_request', { p_request: id }))
    },
    declineRequest: async (id: string): Promise<void> => {
      await run(client.rpc('decline_dispatch_request', { p_request: id }))
    },
    async assignedBookings(): Promise<readonly AssignedBooking[]> {
      return (await rows(client.rpc('my_assigned_service_bookings'))).map(toAssigned)
    },
    advanceBooking: async (id: string, expected: ServiceBookingStatus): Promise<void> => {
      await run(client.rpc('advance_service_booking', { p_booking: id, p_expected_status: expected }))
    },
    releaseBooking: async (id: string, reason: string): Promise<void> => {
      await run(client.rpc('release_service_booking', { p_booking: id, p_reason: reason }))
    },
    /** Only an operator washer can cancel. Every other washer hands the job back with releaseBooking. */
    operatorCancelBooking: async (id: string, reason: string): Promise<void> => {
      await run(client.rpc('operator_cancel_service_booking', { p_booking: id, p_reason: reason }))
    },
    reportProblem: async (id: string, report: string): Promise<void> => {
      await run(client.rpc('report_service_booking_problem', { p_booking: id, p_report: report }))
    },
    async workerSummary(): Promise<WorkerSummary> {
      const [r] = await rows(client.rpc('my_independent_worker_summary'))
      return {
        completedCount: num(r?.completed_count), activeCount: num(r?.active_count), earningsCents: num(r?.earnings_cents),
        reviewCount: num(r?.review_count), averageRating: nullableNum(r?.average_rating),
      }
    },
    async workerReviews(): Promise<readonly { readonly rating: number; readonly comment: string; readonly createdAt: string }[]> {
      const result = await rows(client.rpc('my_independent_worker_reviews'))
      return result.map((r) => ({ rating: num(r.rating), comment: str(r.comment), createdAt: str(r.created_at) }))
    },
    deleteMyAccount: async (): Promise<void> => {
      await run(client.rpc('delete_my_account'))
    },
    registerPushToken: async (token: string, platform: 'ios' | 'android'): Promise<void> => {
      await run(client.rpc('register_device_push_token', { p_token: token, p_platform: platform }))
    },
    removePushToken: async (token: string): Promise<void> => {
      await run(client.rpc('remove_device_push_token', { p_token: token }))
    },
    adminSummary: async (): Promise<Row> => (await rows(client.rpc('admin_b2c_summary')))[0] ?? {},
    adminCatalog: async (): Promise<Row> => (await run(client.rpc('admin_catalog'))) as Row,
    adminSaveService: async (args: Row): Promise<void> => {
      await run(client.rpc('admin_save_service', args))
    },
    adminSaveAddon: async (args: Row): Promise<void> => {
      await run(client.rpc('admin_save_addon', args))
    },
    adminSetVehiclePrice: async (serviceId: string, category: VehicleCategory, adjustmentCents: number | null): Promise<void> => {
      await run(client.rpc('admin_set_service_vehicle_price', { p_service: serviceId, p_vehicle_category: category, p_adjustment_cents: adjustmentCents }))
    },
    adminUpdateRules: async (args: { bookingsOpen: boolean; commissionBps: number; requestTtlSeconds: number; searchWindowMinutes: number; travelBufferMinutes: number }): Promise<void> => {
      await run(client.rpc('admin_update_platform_rules', {
        p_bookings_open: args.bookingsOpen, p_commission_bps: args.commissionBps, p_request_ttl_seconds: args.requestTtlSeconds,
        p_search_window_minutes: args.searchWindowMinutes, p_travel_buffer_minutes: args.travelBufferMinutes,
      }))
    },
    adminWorkers: async (): Promise<readonly Row[]> => rows(client.rpc('admin_independent_workers')),
    async adminPlatformOperatorIds(): Promise<readonly string[]> {
      const result = await run(client.rpc('admin_platform_operator_ids'))
      // PostgREST returns a set of scalars as plain values; older versions wrap each one in an object.
      return Array.isArray(result)
        ? result.map((value: unknown) => (typeof value === 'object' && value !== null ? str((value as Row).admin_platform_operator_ids) : str(value)))
        : []
    },
    adminReviewWorker: async (workerId: string, status: string, note: string): Promise<void> => {
      await run(client.rpc('admin_review_independent_worker', { p_worker: workerId, p_status: status, p_note: note }))
    },
    adminBookings: async (status: string | null): Promise<readonly Row[]> => rows(client.rpc('admin_service_bookings', { p_status: status })),
    adminBookingCase: async (id: string): Promise<Row> => (await run(client.rpc('admin_service_booking_case', { p_booking: id }))) as Row,
  }
}
