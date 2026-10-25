import { describe, expect, it } from 'vitest'
import { jobApplicationLimits } from '../../domain/models/JobApplication'
import { coverNoteSchema, coverNoteTooLongMessage } from './jobApplicationSchemas'
import { parseMarketplaceFilterDraft, emptyMarketplaceFilterDraft } from './marketplaceFilterDraft'

describe('jobApplicationSchemas (W5)', () => {
  it('w5_cover_note_schema_mirrors_db_limit', () => {
    // Same limit and message as the job_applications CHECK and create_job_application.
    expect(jobApplicationLimits.coverNoteMaxLength).toBe(1000)
    expect(coverNoteTooLongMessage).toBe('The cover note must be 1000 characters or fewer.')
    expect(coverNoteSchema.safeParse('a'.repeat(1000))).toEqual({ success: true, data: 'a'.repeat(1000) })
    const tooLong = coverNoteSchema.safeParse('a'.repeat(1001))
    expect(tooLong.success).toBe(false)
    expect(tooLong.error?.issues.at(0)?.message).toBe(coverNoteTooLongMessage)
    // Trimmed like the database (nullif(trim(...), '')): surrounding spaces do not count.
    expect(coverNoteSchema.parse(`  ${'a'.repeat(1000)}  `)).toBe('a'.repeat(1000))
    expect(coverNoteSchema.parse('   ')).toBeNull()
    expect(coverNoteSchema.parse(null)).toBeNull()

    // Search filters mirror search_job_openings input checks.
    expect(parseMarketplaceFilterDraft({ ...emptyMarketplaceFilterDraft, query: 'a'.repeat(81) })).toEqual({
      isValid: false,
      fieldName: 'query',
      errorMessage: 'Search filters must be 80 characters or fewer.',
    })
    expect(parseMarketplaceFilterDraft({ ...emptyMarketplaceFilterDraft, minPayAmount: '500' })).toEqual({
      isValid: false,
      fieldName: 'payPeriod',
      errorMessage: 'Choose a pay period to filter by pay amount.',
    })
    expect(
      parseMarketplaceFilterDraft({ ...emptyMarketplaceFilterDraft, minPayAmount: '-1', payPeriod: 'day' }),
    ).toMatchObject({ isValid: false, errorMessage: 'The minimum pay amount cannot be negative.' })
  })
})
