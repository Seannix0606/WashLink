import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  SaveWorkerPrivateContactInput,
  SaveWorkerProfileInput,
} from '../../../domain/models/WorkerProfile'
import { WorkerProfileOnboardingFlow } from './WorkerProfileOnboardingFlow'

describe('WorkerProfileOnboardingFlow (J1 worker profile)', () => {
  it('j1_worker_onboarding_flow_validates_and_submits', async () => {
    const user = userEvent.setup()
    const onSubmitWorkerProfile = vi.fn<
      (
        workerProfileInput: SaveWorkerProfileInput,
        workerPrivateContactInput: SaveWorkerPrivateContactInput,
      ) => Promise<boolean>
    >(() => Promise.resolve(true))
    const onWorkerProfileSaved = vi.fn()

    render(
      <WorkerProfileOnboardingFlow
        initialWorkerProfile={null}
        initialWorkerPrivateContact={null}
        submitLabel="Create profile"
        onSubmitWorkerProfile={onSubmitWorkerProfile}
        onWorkerProfileSaved={onWorkerProfileSaved}
      />,
    )

    // Profile steps say who can see the profile.
    expect(screen.getByText(/you and WashLink administrators/)).toBeInTheDocument()

    // Step 1 blocks without a headline and rejects out-of-range years.
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/Add a short headline/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Headline/), 'Car wash attendant')
    await user.type(screen.getByLabelText(/Years of experience/), '75')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Years of experience must be 60 or less.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/Years of experience/))
    await user.type(screen.getByLabelText(/Years of experience/), '4')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Step 2: skills are added with Enter; duplicates are ignored.
    expect(screen.getByRole('heading', { name: 'Skills and locations' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /^Skills/ }), 'Hand wash{Enter}')
    await user.type(screen.getByRole('textbox', { name: /^Skills/ }), 'hand wash{Enter}')
    expect(screen.getAllByRole('button', { name: /^Remove/ })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Step 3: availability must be chosen explicitly.
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Choose your availability.')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/^Availability\*/), 'weekends_only')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Step 4: private contact notice is shown; invalid email is rejected.
    expect(screen.getByText(/contact details are visible only to you/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Contact email/), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(onSubmitWorkerProfile).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText(/^Contact email/))
    await user.click(screen.getByRole('button', { name: 'Create profile' }))

    expect(onSubmitWorkerProfile).toHaveBeenCalledWith(
      {
        headline: 'Car wash attendant',
        experienceSummary: null,
        yearsOfExperience: 4,
        skills: ['Hand wash'],
        preferredLocations: [],
        availabilityStatus: 'weekends_only',
        availabilityNotes: null,
      },
      { contactPhone: null, contactEmail: null, preferredContactMethod: null },
    )
    expect(onWorkerProfileSaved).toHaveBeenCalledTimes(1)
  })
})
