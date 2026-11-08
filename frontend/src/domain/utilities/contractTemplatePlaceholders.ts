/**
 * The `{{key}}` allowlist (mirror of contract_template_placeholders, w8b) and the same
 * check the database runs (contract_template_placeholders_in, w8d). The database stays
 * the authority; this only gives the owner the error before saving.
 */
export const contractTemplatePlaceholderKeys: readonly string[] = [
  'owner_full_name',
  'worker_full_name',
  'shop_name',
  'shop_address',
  'role_title',
  'worker_classification',
  'start_date',
  'end_date',
  'schedule_summary',
  'pay_details',
]

const placeholderPattern = /\{\{([^{}]*)\}\}/g

export function unknownPlaceholderMessage(placeholderToken: string): string {
  return `Unknown placeholder {{${placeholderToken}}}.`
}

/** The distinct placeholder keys used in a text, sorted. */
export function placeholdersIn(clauseText: string): string[] {
  const placeholderTokens = new Set<string>()
  for (const placeholderMatch of clauseText.matchAll(placeholderPattern)) {
    placeholderTokens.add(placeholderMatch[1])
  }
  return [...placeholderTokens].sort()
}

/**
 * The database message for the first unknown or malformed placeholder, or null when every
 * `{{key}}` is allowlisted and no stray braces remain.
 */
export function findPlaceholderProblem(
  clauseText: string,
  allowedKeys: readonly string[] = contractTemplatePlaceholderKeys,
): string | null {
  const unknownToken = placeholdersIn(clauseText).find((placeholderToken) => !allowedKeys.includes(placeholderToken))
  if (unknownToken !== undefined) {
    return unknownPlaceholderMessage(unknownToken.slice(0, 40))
  }
  const remainingText = clauseText.replace(placeholderPattern, '')
  if (!remainingText.includes('{{') && !remainingText.includes('}}')) {
    return null
  }
  const openingToken = /\{\{([^{}]{0,40})/.exec(remainingText)?.[1]
  const closingToken = /([^{}]{0,40})\}\}/.exec(remainingText)?.[1]
  return unknownPlaceholderMessage(openingToken ?? closingToken ?? '')
}

/** Same text the database stores: CRLF to LF, trimmed (w8d contract_template_normalize_text). */
export function normalizeClauseText(clauseText: string): string {
  return clauseText.replace(/\r\n?/g, '\n').trim()
}

/** Placeholders the server allows only in locked safeguard clauses (w8d); never in owner text. */
export const lockedOnlyPlaceholderKeys: readonly string[] = ['worker_classification', 'owner_full_name', 'worker_full_name']

/** Keys an owner may use in editable bodies and shop-specific terms. */
export const ownerUsablePlaceholderKeys: readonly string[] = contractTemplatePlaceholderKeys.filter(
  (placeholderKey) => !lockedOnlyPlaceholderKeys.includes(placeholderKey),
)

/** Invisible characters the w8c CHECKs refuse: U+200B..U+200F, U+2060, U+FEFF. */
const invisibleCharacterPattern = /[\u200B-\u200F\u2060\uFEFF]/u

export function containsInvisibleCharacters(clauseText: string): boolean {
  return invisibleCharacterPattern.test(clauseText)
}

export function usesLockedOnlyPlaceholder(clauseText: string): boolean {
  return placeholdersIn(clauseText).some((placeholderKey) => lockedOnlyPlaceholderKeys.includes(placeholderKey))
}

/**
 * Same check as the server: lower-case, keep only letters and digits, then refuse any text
 * that would read as a WashLink or platform safeguard ("Washlink-Safe guard", "PLATFORM safeguard").
 */
export function impersonatesSafeguard(clauseText: string): boolean {
  const lettersAndDigits = clauseText.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  return lettersAndDigits.includes('washlinksafeguard') || lettersAndDigits.includes('platformsafeguard')
}
