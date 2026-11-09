import type { ReactElement } from 'react'
import { Toaster, toast } from 'sonner'
import { useTheme } from '../../theme/ThemeContext'

export function ApplicationToaster(): ReactElement {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      theme={resolvedTheme}
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
