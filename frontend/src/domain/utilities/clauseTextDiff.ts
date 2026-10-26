/** Word-level difference between a standard clause and an owner's version (LCS, no library). */

export type ClauseDiffSegmentKind = 'same' | 'removed' | 'added'

export interface ClauseDiffSegment {
  readonly kind: ClauseDiffSegmentKind
  readonly text: string
}

/** Above this many table cells the diff falls back to "whole text removed / added". */
const maximumTableCells = 1_000_000

/** Words and the whitespace between them, so joining the tokens gives the original text. */
function tokenize(clauseText: string): string[] {
  return clauseText.split(/(\s+)/).filter((textToken) => textToken.length > 0)
}

function appendSegment(segments: ClauseDiffSegment[], kind: ClauseDiffSegmentKind, text: string): void {
  const previousSegment = segments.at(-1)
  if (previousSegment?.kind === kind) {
    segments[segments.length - 1] = { kind, text: previousSegment.text + text }
    return
  }
  segments.push({ kind, text })
}

function wholeTextDiff(standardText: string, versionText: string): ClauseDiffSegment[] {
  const segments: ClauseDiffSegment[] = []
  if (standardText.length > 0) {
    segments.push({ kind: 'removed', text: standardText })
  }
  if (versionText.length > 0) {
    segments.push({ kind: 'added', text: versionText })
  }
  return segments
}

/**
 * Segments that rebuild both texts: `same` + `removed` = the standard text, `same` + `added`
 * = the version text. Adjacent segments of one kind are merged.
 */
export function diffClauseWords(standardText: string, versionText: string): ClauseDiffSegment[] {
  if (standardText === versionText) {
    return standardText.length > 0 ? [{ kind: 'same', text: standardText }] : []
  }
  const standardTokens = tokenize(standardText)
  const versionTokens = tokenize(versionText)
  const rowCount = standardTokens.length
  const columnCount = versionTokens.length
  if ((rowCount + 1) * (columnCount + 1) > maximumTableCells) {
    return wholeTextDiff(standardText, versionText)
  }
  // lengths[i][j] = LCS length of standardTokens[i..] and versionTokens[j..].
  const lengths: number[][] = Array.from({ length: rowCount + 1 }, () => new Array<number>(columnCount + 1).fill(0))
  for (let i = rowCount - 1; i >= 0; i -= 1) {
    const currentRow = lengths[i] ?? []
    const nextRow = lengths[i + 1] ?? []
    for (let j = columnCount - 1; j >= 0; j -= 1) {
      currentRow[j] =
        standardTokens[i] === versionTokens[j]
          ? (nextRow[j + 1] ?? 0) + 1
          : Math.max(nextRow[j] ?? 0, currentRow[j + 1] ?? 0)
    }
  }
  const segments: ClauseDiffSegment[] = []
  let i = 0
  let j = 0
  while (i < rowCount && j < columnCount) {
    const standardToken = standardTokens[i] ?? ''
    const versionToken = versionTokens[j] ?? ''
    if (standardToken === versionToken) {
      appendSegment(segments, 'same', standardToken)
      i += 1
      j += 1
    } else if ((lengths[i + 1]?.[j] ?? 0) >= (lengths[i]?.[j + 1] ?? 0)) {
      appendSegment(segments, 'removed', standardToken)
      i += 1
    } else {
      appendSegment(segments, 'added', versionToken)
      j += 1
    }
  }
  for (; i < rowCount; i += 1) {
    appendSegment(segments, 'removed', standardTokens[i] ?? '')
  }
  for (; j < columnCount; j += 1) {
    appendSegment(segments, 'added', versionTokens[j] ?? '')
  }
  return segments
}
