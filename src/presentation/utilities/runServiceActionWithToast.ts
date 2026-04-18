import { applicationToast } from '../design/ui'

interface ServiceActionToastConfiguration<TResult> {
  readonly successMessage?: string | ((actionResult: TResult) => string)
  readonly fallbackErrorMessage: string
  readonly shouldShowSuccessToast?: boolean
}

export async function runServiceActionWithToast<TResult>(
  performServiceAction: () => Promise<TResult>,
  toastConfiguration: ServiceActionToastConfiguration<TResult>,
): Promise<TResult | null> {
  try {
    const actionResult = await performServiceAction()
    if (
      (toastConfiguration.shouldShowSuccessToast ?? true) &&
      toastConfiguration.successMessage !== undefined
    ) {
      const resolvedSuccessMessage =
        typeof toastConfiguration.successMessage === 'function'
          ? toastConfiguration.successMessage(actionResult)
          : toastConfiguration.successMessage
      applicationToast.success(resolvedSuccessMessage)
    }
    return actionResult
  } catch (serviceActionError) {
    const errorMessage =
      serviceActionError instanceof Error &&
      serviceActionError.message.length > 0
        ? serviceActionError.message
        : toastConfiguration.fallbackErrorMessage
    applicationToast.error(errorMessage)
    return null
  }
}
