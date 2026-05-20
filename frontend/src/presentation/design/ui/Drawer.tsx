import type { ReactElement, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

interface DrawerProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
  readonly description?: string
  readonly children: ReactNode
  readonly footer?: ReactNode
}

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
}: DrawerProps): ReactElement {
  return (
    <AnimatePresence>
      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-[var(--shadow-popover)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--color-ink-200)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-ink-900)]">
                  {title}
                </h2>
                {description ? (
                  <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton
                accessibleLabel="Close"
                onClick={onClose}
                icon={<X className="h-4 w-4" />}
              />
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer ? (
              <footer className="border-t border-[var(--color-ink-200)] bg-[var(--color-surface-muted)] px-5 py-3">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
