/**
 * Non-blocking check for wording that could ask a worker to pay for required initial
 * training (English and Filipino). It never blocks saving and is not a legal review:
 * it only prompts the owner to re-read the free-text terms they wrote.
 */
const feeLikePatterns: readonly { readonly word: string; readonly pattern: RegExp }[] = [
  { word: 'fee', pattern: /\bfees?\b/i },
  { word: 'bayad', pattern: /bayad/i },
  { word: 'deposit', pattern: /\bdeposit/i },
  { word: 'bond', pattern: /\bbonds?\b/i },
  { word: 'deduct', pattern: /\bdeduct/i },
  { word: 'kaltas', pattern: /kaltas/i },
  { word: 'repay', pattern: /\brepay/i },
  { word: 'multa', pattern: /\bmulta\b/i },
  { word: 'penalty', pattern: /\bpenalt(?:y|ies)\b/i },
  { word: 'charge', pattern: /\bcharg(?:e|es|ed|ing)\b/i },
]

export const feeLikeWordingWarning =
  'Training must be free for workers. Check that these terms do not ask workers to pay, deposit, or repay anything.'

/** The fee-like words found in any of the texts, in list order, without duplicates. */
export function findFeeLikeWords(texts: readonly string[]): readonly string[] {
  return feeLikePatterns
    .filter(({ pattern }) => texts.some((text) => pattern.test(text)))
    .map(({ word }) => word)
}
