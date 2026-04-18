import { useCallback, useRef, useState } from 'react'
import {
  createEmptyAudioContextHolder,
  playShortNotificationChime,
} from '../utilities/notificationSound'

interface UseNewBookingNotificationResult {
  readonly isNotificationVisible: boolean
  readonly triggerNewBookingNotification: () => void
  readonly closeNotificationBanner: () => void
}

export function useNewBookingNotification(): UseNewBookingNotificationResult {
  const [isNotificationVisible, setIsNotificationVisible] =
    useState<boolean>(false)
  const audioContextHolderReference = useRef(createEmptyAudioContextHolder())

  const triggerNewBookingNotification = useCallback((): void => {
    setIsNotificationVisible(true)
    playShortNotificationChime(audioContextHolderReference.current)
  }, [])

  const closeNotificationBanner = useCallback((): void => {
    setIsNotificationVisible(false)
  }, [])

  return {
    isNotificationVisible,
    triggerNewBookingNotification,
    closeNotificationBanner,
  }
}
