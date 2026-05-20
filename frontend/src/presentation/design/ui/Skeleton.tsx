import type { HTMLAttributes, ReactElement } from 'react'
import { joinClassNames } from '../classNames'

type SkeletonShapeVariant = 'rect' | 'circle' | 'text'

interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  readonly shape?: SkeletonShapeVariant
  readonly widthClassName?: string
  readonly heightClassName?: string
}

const shapeClassNameByShapeKey: Record<SkeletonShapeVariant, string> = {
  rect: 'rounded-[var(--radius-control)]',
  circle: 'rounded-full',
  text: 'rounded-md',
}

export function Skeleton({
  shape = 'rect',
  widthClassName = 'w-full',
  heightClassName = 'h-4',
  className,
  ...htmlAttributes
}: SkeletonProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={joinClassNames(
        'block bg-[var(--color-ink-100)] wl-pulse',
        shapeClassNameByShapeKey[shape],
        widthClassName,
        heightClassName,
        className,
      )}
      {...htmlAttributes}
    />
  )
}
