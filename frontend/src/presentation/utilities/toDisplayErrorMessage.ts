/** Message to show for a failed action; services already map database errors to plain text. */
export function toDisplayErrorMessage(caughtError: unknown, fallbackMessage: string): string {
  return caughtError instanceof Error && caughtError.message.length > 0
    ? caughtError.message
    : fallbackMessage
}
