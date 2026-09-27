import type { SpeechHandle, TextToSpeechProvider, VoiceAvailability } from './types'

/**
 * The expressive cloud voice, as the browser sees it.
 *
 * The browser sends the reply's text to our own `/api/assistant/speak` and
 * plays back whatever audio comes back. It never holds a vendor key and never
 * talks to the vendor: the route does that, as the signed-in person, under the
 * same rate limit as every other thing that spends money.
 *
 * A failure is reported through `onError` and nothing else — the dock decides
 * whether to fall back to the browser's own synthesiser, so a vendor outage
 * costs the person a nicer voice, not the answer.
 */
export function remoteTextToSpeech(endpoint = '/api/assistant/speak'): TextToSpeechProvider {
  let current: SpeechHandle | null = null

  return {
    id: 'fish-audio',
    label: 'Fish Audio voice',
    processing: 'provider-cloud',

    isAvailable(): VoiceAvailability {
      if (typeof window === 'undefined' || typeof Audio === 'undefined') {
        return { available: false, reason: 'This browser cannot play audio replies.' }
      }
      return { available: true }
    },

    speak(text, handlers = {}) {
      current?.cancel()

      let cancelled = false
      let audio: HTMLAudioElement | null = null
      let objectUrl: string | null = null
      const controller = new AbortController()

      const cleanup = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        objectUrl = null
        audio = null
      }

      void (async () => {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          })
          if (cancelled) return

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null
            handlers.onError?.(payload?.error ?? 'The voice service is unavailable.')
            return
          }

          const blob = await response.blob()
          if (cancelled) return

          objectUrl = URL.createObjectURL(blob)
          audio = new Audio(objectUrl)
          audio.onplay = () => handlers.onStart?.()
          audio.onended = () => {
            cleanup()
            handlers.onEnd?.()
          }
          audio.onerror = () => {
            cleanup()
            handlers.onError?.('The reply could not be played.')
          }
          await audio.play()
        } catch (error) {
          if (cancelled) return
          cleanup()
          // A browser that blocks autoplay throws NotAllowedError; every other
          // failure is the network. Both are worth one plain sentence.
          const blocked = error instanceof Error && error.name === 'NotAllowedError'
          handlers.onError?.(
            blocked
              ? 'The browser blocked audio until you interact with the page.'
              : 'The voice service could not be reached.',
          )
        }
      })()

      const handle: SpeechHandle = {
        cancel: () => {
          cancelled = true
          controller.abort()
          audio?.pause()
          cleanup()
        },
      }
      current = handle
      return handle
    },

    cancelAll() {
      current?.cancel()
      current = null
    },
  }
}
