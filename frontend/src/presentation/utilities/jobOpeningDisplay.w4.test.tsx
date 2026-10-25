import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildJobOpening } from '../../test/fixtures'
import { JobOpeningPreview } from '../components/owner/jobOpenings/JobOpeningPreview'
import {
  formatCompensationAsEntered,
  formatMinimumYearsExperience,
  jobOpeningDetailsDisclaimer,
  notSpecifiedByShopText,
} from './jobOpeningDisplay'

const noCompensation = {
  compensationMinAmount: null,
  compensationMaxAmount: null,
  compensationCurrency: null,
  compensationPeriod: null,
  compensationDetails: null,
} as const

function sectionWithHeading(headingName: string): HTMLElement {
  const previewSection = screen.getByRole('heading', { name: headingName }).closest('section')
  if (previewSection === null) {
    throw new Error(`No section for heading ${headingName}`)
  }
  return previewSection
}

describe('Compensation display (W4)', () => {
  it('w4_compensation_display_shows_only_entered_values', () => {
    const perDay = { ...noCompensation, compensationCurrency: 'PHP', compensationPeriod: 'day' } as const
    expect(formatCompensationAsEntered({ ...perDay, compensationMinAmount: 600, compensationMaxAmount: 600 })).toEqual([
      'PHP 600.00 per day',
    ])
    expect(formatCompensationAsEntered({ ...perDay, compensationMinAmount: 500, compensationMaxAmount: 700 })).toEqual([
      'PHP 500.00 - 700.00 per day',
    ])
    // One value never becomes a range.
    expect(formatCompensationAsEntered({ ...perDay, compensationMinAmount: 500 })).toEqual(['From PHP 500.00 per day'])
    expect(formatCompensationAsEntered({ ...perDay, compensationMaxAmount: 700 })).toEqual(['Up to PHP 700.00 per day'])
    // No rounding: stored cents are shown as stored.
    expect(formatCompensationAsEntered({ ...perDay, compensationMinAmount: 650.5 })).toEqual(['From PHP 650.50 per day'])
    expect(
      formatCompensationAsEntered({
        ...perDay,
        compensationPeriod: 'month',
        compensationMinAmount: 1_234_567.89,
        compensationMaxAmount: 9_999_999.99,
      }),
    ).toEqual(['PHP 1,234,567.89 - 9,999,999.99 per month'])
    // The owner's own words are shown verbatim, after the amount.
    const ownerWords = '  Plus 10% commission per car  '
    expect(
      formatCompensationAsEntered({ ...perDay, compensationMinAmount: 400, compensationDetails: ownerWords }),
    ).toEqual(['From PHP 400.00 per day', ownerWords])
    expect(formatCompensationAsEntered({ ...noCompensation, compensationDetails: 'Commission only' })).toEqual([
      'Commission only',
    ])
  })

  it('w4_compensation_display_says_not_specified_when_empty', () => {
    expect(formatCompensationAsEntered(noCompensation)).toEqual([notSpecifiedByShopText])
    expect(notSpecifiedByShopText).toBe('Not specified by the shop')
    expect(jobOpeningDetailsDisclaimer).toBe(
      'Details as entered by the shop. WashLink does not verify pay or employment terms.',
    )

    render(<JobOpeningPreview jobOpeningContent={buildJobOpening()} shopName="Test Shop" isOwnerPreview={false} />)
    for (const termsHeading of ['Pay', 'Schedule', 'Benefits', 'Other terms']) {
      expect(within(sectionWithHeading(termsHeading)).getByText(notSpecifiedByShopText)).toBeInTheDocument()
    }
    expect(screen.getByText(jobOpeningDetailsDisclaimer)).toBeInTheDocument()
    expect(screen.queryByText(/PHP/)).toBeNull()
  })

  it('w4_preview_pluralizes_minimum_years_experience', () => {
    expect(formatMinimumYearsExperience(0)).toBe('At least 0 years of experience')
    expect(formatMinimumYearsExperience(1)).toBe('At least 1 year of experience')
    expect(formatMinimumYearsExperience(5)).toBe('At least 5 years of experience')

    render(
      <JobOpeningPreview
        jobOpeningContent={buildJobOpening({ minimumYearsExperience: 1 })}
        shopName="Test Shop"
        isOwnerPreview={false}
      />,
    )
    expect(within(sectionWithHeading('Experience')).getByText('At least 1 year of experience')).toBeInTheDocument()
  })
})
