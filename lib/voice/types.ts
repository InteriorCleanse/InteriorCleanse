/**
 * Voice provider interfaces.
 *
 * Speech is behind an adapter for a specific commercial reason: the browser's
 * built-in engines are free and require no key, but their quality and language
 * coverage vary by platform, and in Chrome the recogniser sends audio to a
 * Google service. A workspace that cannot accept that — or that wants a better
 * voice — must be able to swap in Deepgram, Whisper, or ElevenLabs without any
 * component changing.
 *
 * So nothing in the UI imports a Web Speech type. It imports these.
 */

export type VoiceAvailability =
  | { available: true }
  /** Why not, in words the operator can act on. */
  | { available: false; reason: string }

export type TranscriptChunk = {
  text: string
  /** False while the recogniser is still revising this phrase. */
  isFinal: boolean
  /** 0–1 where the provider reports one; null where it does not. */
  confidence: number | null
}

export type SpeechToTextSession = {
  stop: () => void
  abort: () => void
}

export type SpeechToTextProvider = {
  readonly id: string
  readonly label: string
  /**
   * Where the audio goes. Surfaced in the UI, because "this is processed by a
   * third party" is something a person is entitled to know before speaking.
   */
  readonly processing: 'on-device' | 'provider-cloud'
  isAvailable: () => VoiceAvailability
  start: (handlers: {
    onChunk: (chunk: TranscriptChunk) => void
    onError: (message: string) => void
    onEnd: () => void
    language?: string
  }) => SpeechToTextSession
}

export type SpeechHandle = {
  cancel: () => void
}

export type TextToSpeechProvider = {
  readonly id: string
  readonly label: string
  readonly processing: 'on-device' | 'provider-cloud'
  isAvailable: () => VoiceAvailability
  speak: (
    text: string,
    handlers?: { onStart?: () => void; onEnd?: () => void; onError?: (message: string) => void },
  ) => SpeechHandle
  cancelAll: () => void
}

export const VOICE_UNSUPPORTED =
  'Voice is not available in this browser. Everything here works by typing.'
