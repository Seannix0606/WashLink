import type { ReactElement } from 'react'
import type { CreateShopInput } from '../../../domain/models/Shop'
import { Modal } from '../../design/ui'
import { ShopSetupStep } from '../onboarding/ShopSetupStep'

interface AddShopModalProps {
  readonly isOpen: boolean
  readonly isSubmitting: boolean
  readonly onClose: () => void
  readonly onShopSetupSubmitted: (createShopInput: CreateShopInput) => void
}

export function AddShopModal({
  isOpen,
  isSubmitting,
  onClose,
  onShopSetupSubmitted,
}: AddShopModalProps): ReactElement {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add a new shop"
      maxWidthClassName="max-w-2xl"
    >
      <ShopSetupStep
        isSubmitting={isSubmitting}
        onShopSetupSubmitted={onShopSetupSubmitted}
      />
    </Modal>
  )
}
