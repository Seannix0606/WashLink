import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingRatingStarInput } from './BookingRatingStarInput'

describe('BookingRatingStarInput (J18 ratings)', () => {
  it('j18_rating_star_input_reports_selected_stars', async () => {
    const user = userEvent.setup()
    const handleRatingStarsChanged = vi.fn<(nextRatingStars: number) => void>()
    render(
      <BookingRatingStarInput
        selectedRatingStars={0}
        onRatingStarsChanged={handleRatingStarsChanged}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rate 4 stars — Great' }))

    expect(handleRatingStarsChanged).toHaveBeenCalledTimes(1)
    expect(handleRatingStarsChanged).toHaveBeenCalledWith(4)
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('j18_rating_star_input_disabled_blocks_selection', async () => {
    const user = userEvent.setup()
    const handleRatingStarsChanged = vi.fn<(nextRatingStars: number) => void>()
    render(
      <BookingRatingStarInput
        selectedRatingStars={2}
        onRatingStarsChanged={handleRatingStarsChanged}
        isDisabled
      />,
    )

    const fiveStarButton = screen.getByRole('button', {
      name: 'Rate 5 stars — Excellent',
    })
    expect(fiveStarButton).toBeDisabled()
    await user.click(fiveStarButton)

    expect(handleRatingStarsChanged).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Rate 2 stars — Fair' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
