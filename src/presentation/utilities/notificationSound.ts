interface AudioContextHolder {
  current: AudioContext | null
}

export function createEmptyAudioContextHolder(): AudioContextHolder {
  return { current: null }
}

export function playShortNotificationChime(
  audioContextHolder: AudioContextHolder,
): void {
  const audioContext = getOrCreateAudioContext(audioContextHolder)
  const oscillatorNode = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  oscillatorNode.type = 'sine'
  oscillatorNode.frequency.setValueAtTime(880, audioContext.currentTime)
  gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + 0.25,
  )

  oscillatorNode.connect(gainNode)
  gainNode.connect(audioContext.destination)
  oscillatorNode.start()
  oscillatorNode.stop(audioContext.currentTime + 0.25)
}

function getOrCreateAudioContext(
  audioContextHolder: AudioContextHolder,
): AudioContext {
  audioContextHolder.current ??= new AudioContext()
  return audioContextHolder.current
}
