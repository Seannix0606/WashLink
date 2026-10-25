import { z } from 'zod'

// Shared zod building blocks for owner and worker forms that mirror database limits.

/** Trimmed text; empty becomes null. */
export function optionalText(maximumLength: number, fieldLabel: string): z.ZodType<string | null> {
  return z
    .string()
    .trim()
    .max(maximumLength, `${fieldLabel} must be ${String(maximumLength)} characters or fewer.`)
    .nullable()
    .transform((value) => (value === null || value.length === 0 ? null : value))
}

export function textList(options: {
  readonly maximumCount: number
  readonly maximumItemLength: number
  readonly listLabel: string
  readonly itemLabel: string
}): z.ZodType<string[]> {
  return z
    .array(
      z
        .string()
        .trim()
        .min(1, `${options.itemLabel} cannot be empty.`)
        .max(
          options.maximumItemLength,
          `Each ${options.itemLabel.toLowerCase()} must be ${String(options.maximumItemLength)} characters or fewer.`,
        ),
    )
    .max(
      options.maximumCount,
      `Add at most ${String(options.maximumCount)} ${options.listLabel}.`,
    )
}

export type FormFieldErrors = Readonly<Partial<Record<string, string>>>

/** First error message per top-level field, for inline form errors. */
export function collectFieldErrors(validationError: z.ZodError): FormFieldErrors {
  const fieldErrors: Partial<Record<string, string>> = {}
  for (const validationIssue of validationError.issues) {
    const fieldName = String(validationIssue.path.at(0) ?? 'form')
    fieldErrors[fieldName] ??= validationIssue.message
  }
  return fieldErrors
}
