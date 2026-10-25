import type { JobOpeningContent } from '../../domain/models/JobOpening'

/** What the opening asks of applicants, shown as the shop entered it, before the worker applies. */
export interface ApplyOpeningRequirements {
  readonly minimumQualifications: readonly string[]
  readonly preferredQualifications: readonly string[]
  readonly requiredTraining: string | null
}

export type ApplyOpeningRequirementsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'loaded'; readonly requirements: ApplyOpeningRequirements }

export function toApplyOpeningRequirements(
  jobOpeningContent: Pick<
    JobOpeningContent,
    'minimumQualifications' | 'preferredQualifications' | 'requiredTraining'
  >,
): ApplyOpeningRequirements {
  return {
    minimumQualifications: jobOpeningContent.minimumQualifications,
    preferredQualifications: jobOpeningContent.preferredQualifications,
    requiredTraining: jobOpeningContent.requiredTraining,
  }
}
