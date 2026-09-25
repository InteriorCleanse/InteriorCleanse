import {
  VOICE_UNSUPPORTED,
  type SpeechToTextProvider,
  type SpeechToTextSession,
  type TextToSpeechProvider,
  type VoiceAvailability,
} from './types'

/**
 * Web Speech API implementations of the voice adapters.
 *
 * These are the defaults because they cost nothing and need no key, which means
 * voice works on a trial workspace on day one. They are not the only option —
 * see types.ts for why the interface exists.
 *
 * All the messy parts of the browser API are contained here: the vendor prefix,
 * the fact that recognition stops itself after a pause, the fact that Safari
 * reports availability but throws on start, and Chrome's habit of firing `end`
 * without `error` when permission is denied.
 */

// The DOM lib does not type the Speech Recognition API, and pulling in a
// third-party type package for two interfaces is not worth the dependency.
type SpeechRecognitionAlternative = { transcript: string; confidence: number }
type SpeechRecognitionResult = { readonly length: number; isFinal: boolean; 0: SpeechRecognitionAlternative }
type SpeechRecognitionEventLike = {
  resultIndex: number
  results: { readonly length: number; [index: number]: SpeechRecognitionResult }
}
type SpeechRecognitionErrorEventLike = { error: string; message?: string }

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Browser error codes turned into something an operator can act on. */
function describeRecognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was blocked. Allow it in your browser settings, or type instead.'
    case 'no-speech':
      return 'Nothing was heard. Try again, or type instead.'
    case 'audio-capture':
      return 'No microphone was found.'
    case 'network':
      return 'Speech recognition could not reach its service. Type instead.'
    case 'aborted':
      return ''
    default:
      return `Speech recognition failed (${code}). Type instead.`
  }
}

export const browserSpeechToText: SpeechToTextProvider = {
  id: 'web-speech',
  label: 'Browser speech recognition',
  // Chrome streams audio to Google's servers; Safari transcribes on device.
  // Claiming on-device here would be a privacy statement we cannot honour.
  processing: 'provider-cloud',

  isAvailable(): VoiceAvailability {
    if (typeof window === 'undefined') return { available: false, reason: VOICE_UNSUPPORTED }
    if (!recognitionCtor()) return { available: false, reason: VOICE_UNSUPPORTED }
    if (!window.isSecureContext) {
      return { available: false, reason: 'Voice needs a secure (https) connection.' }
    }
    return { available: true }
  },

  start({ onChunk, onError, onEnd, language }): SpeechToTextSession {
    const Ctor = recognitionCtor()
    if (!Ctor) {
      onError(VOICE_UNSUPPORTED)
      onEnd()
      return { stop: () => {}, abort: () => {} }
    }

    const recognition = new Ctor()
    recognition.lang = language ?? navigator.language ?? 'en-GB'
    // Continuous, because a person pauses mid-sentence while thinking about
    // their own business and the default cuts them off.
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    // Guards against the double-callback case: some browsers fire `error` and
    // then `end`, others only one of the two.
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      onEnd()
    }

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (!result) continue
        const alternative = result[0]
        if (!alternative) continue
        onChunk({
          text: alternative.transcript,
          isFinal: result.isFinal,
          confidence: Number.isFinite(alternative.confidence) ? alternative.confidence : null,
        })
      }
    }

    recognition.onerror = (event) => {
      const message = describeRecognitionError(event.error)
      if (message) onError(message)
      finish()
    }

    recognition.onend = finish

    try {
      recognition.start()
    } catch {
      // Thrown when start() is called twice, or when Safari advertises support
      // it does not have.
      onError('Voice could not start. Type instead.')
      finish()
    }

    return {
      stop: () => {
        try {
          recognition.stop()
        } catch {
          finish()
        }
      },
      abort: () => {
        try {
          recognition.abort()
        } catch {
          finish()
        }
      },
    }
  },
}

export const browserTextToSpeech: TextToSpeechProvider = {
  id: 'web-speech',
  label: 'Browser speech synthesis',
  processing: 'on-device',

  isAvailable(): VoiceAvailability {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return { available: false, reason: 'This browser cannot read replies aloud.' }
    }
    return { available: true }
  },

  speak(text, handlers = {}) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      handlers.onError?.('This browser cannot read replies aloud.')
      return { cancel: () => {} }
    }

    // Anything queued is stale by the time a new reply exists.
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.02
    utterance.pitch = 1
    utterance.onstart = () => handlers.onStart?.()
    utterance.onend = () => handlers.onEnd?.()
    utterance.onerror = (event) => {
      // Cancelling raises an error event; that is not a failure worth showing.
      if (event.error === 'canceled' || event.error === 'interrupted') {
        handlers.onEnd?.()
        return
      }
      handlers.onError?.('Could not read that aloud.')
    }

    window.speechSynthesis.speak(utterance)
    return { cancel: () => window.speechSynthesis.cancel() }
  },

  cancelAll() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  },
}

/**
 * Strips markdown before speaking. A synthesiser reads "asterisk asterisk
 * revenue asterisk asterisk", which is unbearable within one sentence.
 */
export function speakable(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[#>]+\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
