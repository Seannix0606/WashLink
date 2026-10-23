import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseBookingRow } from '../supabase/supabaseBookingRow'
import {
  testBookingIdentifier,
  testCustomerIdentifier,
  testShopIdentifier,
} from '../../test/fixtures'
import { SupabaseBookingRepository } from './SupabaseBookingRepository'

type RecordedQueryCall = readonly [methodName: string, methodArguments: unknown[]]

const supabaseClientDouble = vi.hoisted(() => {
  const recordedQueryCalls: RecordedQueryCall[] = []
  const singleResult: {
    data: unknown
    error: { code?: string; message: string } | null
  } = {
    data: null,
    error: null,
  }

  function createQueryBuilder(): Record<string, (...methodArguments: unknown[]) => unknown> {
    const chainableMethodNames = ['update', 'eq', 'is', 'in', 'select', 'insert']
    const queryBuilder: Record<string, (...methodArguments: unknown[]) => unknown> = {}
    for (const methodName of chainableMethodNames) {
      queryBuilder[methodName] = (...methodArguments: unknown[]): unknown => {
        recordedQueryCalls.push([methodName, methodArguments])
        return queryBuilder
      }
    }
    queryBuilder.single = (): Promise<typeof singleResult> => {
      recordedQueryCalls.push(['single', []])
      return Promise.resolve(singleResult)
    }
    return queryBuilder
  }

  const fromTable = (...methodArguments: unknown[]): unknown => {
    recordedQueryCalls.push(['from', methodArguments])
    return createQueryBuilder()
  }

  return { recordedQueryCalls, singleResult, fromTable }
})

vi.mock('../supabase/supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: (): { from: typeof supabaseClientDouble.fromTable } => ({
    from: supabaseClientDouble.fromTable,
  }),
}))

function buildCompletedRatedBookingRow(): SupabaseBookingRow {
  return {
    id: testBookingIdentifier,
    customer_name: 'Test Customer',
    customer_id: testCustomerIdentifier,
    vehicle_type: 'Sedan',
    service_type: 'Basic Wash',
    address: '1 Test Street',
    time: '2026-10-20T10:00:00+00:00',
    booking_status: 'completed',
    created_at: '2026-10-19T10:00:00+00:00',
    shop_id: testShopIdentifier,
    quoted_price: '250.00',
    customer_rating_stars: 4,
    customer_rating_comment: 'Good job',
    customer_rated_at: '2026-10-21T10:00:00+00:00',
  }
}

describe('SupabaseBookingRepository (J18 ratings)', () => {
  beforeEach(() => {
    supabaseClientDouble.recordedQueryCalls.length = 0
    supabaseClientDouble.singleResult.data = null
    supabaseClientDouble.singleResult.error = null
  })

  it('j18_rating_rejects_out_of_range_before_network', async () => {
    const bookingRepository = new SupabaseBookingRepository()

    for (const outOfRangeRatingStars of [0, 6]) {
      await expect(
        bookingRepository.submitBookingRatingForCustomer(
          testBookingIdentifier,
          testCustomerIdentifier,
          outOfRangeRatingStars,
          null,
        ),
      ).rejects.toThrow('Rating must be between 1 and 5 stars.')
    }

    expect(supabaseClientDouble.recordedQueryCalls).toHaveLength(0)
  })

  it('j18_rating_update_filters_completed_unrated_own_booking', async () => {
    supabaseClientDouble.singleResult.data = buildCompletedRatedBookingRow()
    const bookingRepository = new SupabaseBookingRepository()

    const ratedBooking = await bookingRepository.submitBookingRatingForCustomer(
      testBookingIdentifier,
      testCustomerIdentifier,
      4,
      'Good job',
    )

    const recordedMethodNames = supabaseClientDouble.recordedQueryCalls.map(
      ([methodName]) => methodName,
    )
    expect(recordedMethodNames).toEqual([
      'from',
      'update',
      'eq',
      'eq',
      'eq',
      'is',
      'select',
      'single',
    ])
    const [, [tableName]] = supabaseClientDouble.recordedQueryCalls[0]
    expect(tableName).toBe('bookings')
    const [, [updatePayload]] = supabaseClientDouble.recordedQueryCalls[1]
    expect(updatePayload).toMatchObject({
      customer_rating_stars: 4,
      customer_rating_comment: 'Good job',
    })
    const filterArguments = supabaseClientDouble.recordedQueryCalls
      .slice(2, 6)
      .map(([, methodArguments]) => methodArguments)
    expect(filterArguments).toEqual([
      ['id', testBookingIdentifier],
      ['customer_id', testCustomerIdentifier],
      ['booking_status', 'completed'],
      ['customer_rating_stars', null],
    ])
    expect(ratedBooking.customerRatingStars).toBe(4)
    expect(ratedBooking.quotedPrice).toBe(250)
  })

  it('j18_raw_postgres_error_is_not_shown_to_users', async () => {
    supabaseClientDouble.singleResult.error = {
      code: 'XX000',
      message: 'column "customer_rating_stars" of relation "bookings" internal detail',
    }
    const bookingRepository = new SupabaseBookingRepository()

    const ratingPromise = bookingRepository.submitBookingRatingForCustomer(
      testBookingIdentifier,
      testCustomerIdentifier,
      4,
      null,
    )

    await expect(ratingPromise).rejects.toThrow(
      'Could not submit your rating. Please try again.',
    )
    await expect(ratingPromise).rejects.not.toThrow(/relation|column|internal/)
  })
})
