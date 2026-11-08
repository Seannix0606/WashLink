import { useEffect, useState } from 'react'

/** Chrome and Edge fire this before offering to install a site. It is not in the DOM typings yet. */
interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>
}

export type InstallState =
  /** Already running as the installed app. */
  | 'installed'
  /** The browser can show its own install dialog. */
  | 'promptable'
  /** iPhone and iPad: installing is Share, then Add to Home Screen. */
  | 'ios'
  /** Anything else: the browser menu's Install app or Add to Home Screen. */
  | 'manual'

function isStandalone(): boolean {
  const navigatorWithStandalone = window.navigator as Navigator & { readonly standalone?: boolean }
  return navigatorWithStandalone.standalone === true
    || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
}

function isAppleMobile(): boolean {
  const { userAgent, maxTouchPoints } = window.navigator
  return /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1)
}

export function useInstallPrompt(): { readonly installState: InstallState; readonly install: () => Promise<void> } {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState<boolean>(isStandalone)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = (): void => {
      setDeferredPrompt(null)
      setIsInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return (): void => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async (): Promise<void> => {
    if (!deferredPrompt) {
      return
    }
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  const installState: InstallState = isInstalled ? 'installed' : deferredPrompt ? 'promptable' : isAppleMobile() ? 'ios' : 'manual'
  return { installState, install }
}
