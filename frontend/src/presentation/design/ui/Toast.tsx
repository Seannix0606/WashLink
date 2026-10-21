import type { ReactElement } from 'react'
import { Toaster, toast } from 'sonner'

export function ApplicationToaster(): ReactElement {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          fontFamily: 'var(--font-sans)',
          borderRadius: 'var(--radius-control)',
        },
      }}
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const applicationToast = toast
