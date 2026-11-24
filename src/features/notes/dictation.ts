type RecognitionEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type RecognitionCtor = new () => Recognition

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const dictationSupported = () => ctor() !== null

/**
 * Browser dictation. Audio goes to the browser's speech service, never to
 * Meridian; this is deliberately documented in the UI rather than hidden.
 */
export function startDictation(opts: {
  lang?: string
  onText: (text: string, final: boolean) => void
  onError?: () => void
  onEnd?: () => void
}): { stop: () => void } | null {
  const C = ctor()
  if (!C) return null
  const recognition = new C()
  recognition.lang = opts.lang ?? navigator.language ?? 'en-US'
  recognition.continuous = true
  recognition.interimResults = true
  recognition.onresult = (event) => {
    let interim = ''
    let final = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) final += result[0].transcript
      else interim += result[0].transcript
    }
    if (final) opts.onText(final, true)
    if (interim) opts.onText(interim, false)
  }
  recognition.onerror = () => opts.onError?.()
  recognition.onend = () => opts.onEnd?.()
  try {
    recognition.start()
  } catch {
    return null
  }
  return { stop: () => recognition.stop() }
}
