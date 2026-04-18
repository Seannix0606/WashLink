import type { ReactElement } from 'react'
import { joinClassNames } from '../classNames'

type AvatarSizeVariant = 'sm' | 'md' | 'lg'

interface AvatarProps {
  readonly fullName: string
  readonly imageUrl?: string
  readonly size?: AvatarSizeVariant
  readonly className?: string
}

const sizeClassNameBySizeKey: Record<AvatarSizeVariant, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
}

export function Avatar({
  fullName,
  imageUrl,
  size = 'md',
  className,
}: AvatarProps): ReactElement {
  const initials = buildInitialsFromFullName(fullName)

  return (
    <span
      className={joinClassNames(
        'inline-flex items-center justify-center overflow-hidden rounded-full bg-[var(--color-brand-100)] font-semibold text-[var(--color-brand-800)]',
        sizeClassNameBySizeKey[size],
        className,
      )}
      aria-label={fullName}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={fullName}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  )
}

function buildInitialsFromFullName(fullName: string): string {
  const trimmedFullName = fullName.trim()
  if (trimmedFullName.length === 0) {
    return '?'
  }
  const words = trimmedFullName.split(/\s+/).slice(0, 2)
  return words.map((word) => word.charAt(0).toUpperCase()).join('')
}
