import type { ReactElement } from 'react'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Input } from '../../design/ui'

interface WorkerProfileTagListInputProps {
  readonly fieldName: string
  readonly label: string
  readonly helperText: string
  readonly placeholder: string
  readonly tags: readonly string[]
  readonly maximumTagCount: number
  readonly maximumTagLength: number
  readonly errorText?: string
  readonly onTagsChange: (nextTags: string[]) => void
}

export function WorkerProfileTagListInput({
  fieldName,
  label,
  helperText,
  placeholder,
  tags,
  maximumTagCount,
  maximumTagLength,
  errorText,
  onTagsChange,
}: WorkerProfileTagListInputProps): ReactElement {
  const [pendingTag, setPendingTag] = useState<string>('')
  const trimmedPendingTag = pendingTag.trim()
  const isDuplicateTag = tags.some(
    (existingTag) => existingTag.toLowerCase() === trimmedPendingTag.toLowerCase(),
  )
  const canAddTag =
    trimmedPendingTag.length > 0 && !isDuplicateTag && tags.length < maximumTagCount

  const addPendingTag = (): void => {
    if (!canAddTag) {
      return
    }
    onTagsChange([...tags, trimmedPendingTag])
    setPendingTag('')
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input
            name={fieldName}
            label={label}
            placeholder={placeholder}
            value={pendingTag}
            maxLength={maximumTagLength}
            errorText={errorText}
            helperText={`${helperText} ${String(tags.length)}/${String(maximumTagCount)} added.`}
            onChange={(changeEvent): void => {
              setPendingTag(changeEvent.target.value)
            }}
            onKeyDown={(keyboardEvent): void => {
              if (keyboardEvent.key === 'Enter') {
                keyboardEvent.preventDefault()
                addPendingTag()
              }
            }}
          />
        </div>
        <Button
          variant="secondary"
          leadingIcon={<Plus className="h-4 w-4" />}
          disabled={!canAddTag}
          onClick={addPendingTag}
          aria-label={`Add to ${label.toLowerCase()}`}
          className="mb-6"
        >
          Add
        </Button>
      </div>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-brand-50)] py-1 pl-3 pr-1 text-xs font-medium text-[var(--color-brand-800)]"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={(): void => {
                  onTagsChange(tags.filter((existingTag) => existingTag !== tag))
                }}
                className="rounded-full p-1 hover:bg-[var(--color-brand-100)]"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
