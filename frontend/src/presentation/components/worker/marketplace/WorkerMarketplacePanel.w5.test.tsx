import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { JobApplicationService } from '../../../../application/services/JobApplicationService'
import { MarketplaceService } from '../../../../application/services/MarketplaceService'
import type { MarketplaceJobOpening } from '../../../../domain/models/MarketplaceJobOpening'
import {
  buildMarketplaceJobOpening,
  createMockJobApplicationRepository,
  createMockMarketplaceRepository,
} from '../../../../test/jobApplicationFixtures'
import { WorkerMarketplacePanel } from './WorkerMarketplacePanel'

function renderPanel(marketplaceRepository: ReturnType<typeof createMockMarketplaceRepository>): void {
  render(
    <WorkerMarketplacePanel
      marketplaceService={new MarketplaceService(marketplaceRepository)}
      jobApplicationService={new JobApplicationService(createMockJobApplicationRepository())}
      hasWorkerProfile
      onCreateProfileRequested={(): void => undefined}
    />,
  )
}

describe('Worker marketplace panel (W5)', () => {
  it('w5_marketplace_shows_training_notice_before_results', async () => {
    const marketplaceRepository = createMockMarketplaceRepository()
    marketplaceRepository.searchJobOpenings.mockResolvedValue([buildMarketplaceJobOpening()])
    renderPanel(marketplaceRepository)

    const resultList = await screen.findByRole('list', { name: 'Job openings' })
    const notice = screen.getByRole('region', { name: 'Training and paid work are different' })
    expect(notice).toHaveTextContent('is free for you')
    // The notice comes before the filters and the results in the document.
    expect(notice.compareDocumentPosition(resultList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const searchForm = screen.getByRole('search', { name: 'Search job openings' })
    expect(notice.compareDocumentPosition(searchForm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('w5_marketplace_loading_empty_error_states', async () => {
    const user = userEvent.setup()
    const marketplaceRepository = createMockMarketplaceRepository()
    let resolveFirstSearch: (openings: MarketplaceJobOpening[]) => void = () => undefined
    marketplaceRepository.searchJobOpenings.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstSearch = resolve
      }),
    )
    renderPanel(marketplaceRepository)

    // Loading
    expect(screen.getByLabelText('Loading job openings')).toHaveAttribute('aria-busy', 'true')
    // Empty
    resolveFirstSearch([])
    expect(await screen.findByText('No job openings found')).toBeInTheDocument()

    // Error, with the mapped message and a retry
    marketplaceRepository.searchJobOpenings.mockRejectedValueOnce(new Error('Could not search job openings.'))
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not search job openings.')
    expect(screen.queryByText('No job openings found')).toBeNull()

    // Success after retry
    marketplaceRepository.searchJobOpenings.mockResolvedValueOnce([
      buildMarketplaceJobOpening({ title: 'Detailer' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => {
      expect(screen.getByRole('list', { name: 'Job openings' })).toHaveTextContent('Detailer')
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
