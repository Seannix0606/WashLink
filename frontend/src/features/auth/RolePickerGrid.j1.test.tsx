import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SignUpRole } from '../../domain/models/AuthenticatedUser'
import { RolePickerGrid } from './RolePickerGrid'

describe('RolePickerGrid (J1 registration, D-9)', () => {
  it('j1_role_picker_offers_worker', async () => {
    const user = userEvent.setup()
    const onRoleSelected = vi.fn<(nextRole: SignUpRole) => void>()

    render(<RolePickerGrid selectedRole="customer" onRoleSelected={onRoleSelected} />)

    const roleButtons = screen.getAllByRole('button')
    expect(roleButtons).toHaveLength(3)
    expect(screen.queryByText(/admin/i)).not.toBeInTheDocument()

    const workerOption = screen.getByRole('button', { name: /I want car wash work/ })
    expect(workerOption).toHaveAttribute('aria-pressed', 'false')
    await user.click(workerOption)
    expect(onRoleSelected).toHaveBeenCalledWith('worker')
  })
})
