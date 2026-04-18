import type { ReactElement, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

interface ModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly maxWidthClassName?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidthClassName = 'max-w-md',
}: ModalProps): ReactElement {
  return (
    <AnimatePresence>
      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={`relative w-full ${maxWidthClassName} rounded-[var(--radius-surface)] bg-white shadow-[var(--shadow-popover)]`}
          >
            <header className="flex items-center justify-between gap-3 border-b border-[var(--color-ink-200)] px-5 py-4">
              <h2 className="text-base font-semibold text-[var(--color-ink-900)]">
                {title}
              </h2>
              <IconButton
                accessibleLabel="Close"
                onClick={onClose}
                icon={<X className="h-4 w-4" />}
              />
            </header>
            <div className="px-5 py-4">{children}</div>
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
