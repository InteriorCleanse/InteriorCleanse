/**
 * Fish Audio text-to-speech.
 *
 * The expressive cloud voice: it sounds like a person, reads a mood tag as a
 * mood rather than a word, and costs a fraction of the alternatives. It is
 * called only from the server, with the deployment's key, and only for a
 * signed-in member of a workspace — the browser never sees the key and never
 * talks to the vendor directly.
 *
 * Built around an injectable `fetch` so the request shape and the failure
 * classes are unit-tested without a network, the same way the connectors are.
 * Nothing here logs the text it is asked to say: a reply is workspace data.
 */

export const FISH_TTS_URL = 'https://api.fish.audio/v1/tts'

/** The current expressive model. Overridable by environment, see `voiceEnv`. */
export const FISH_DEFAULT_MODEL = 's1'

export class SynthesisError extends Error {
  constructor(
    message: string,
    /** True for a vendor having a bad minute; false for a key, credit or input problem. */
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'SynthesisError'
  }
}

export type FishRequestInput = {
  text: string
  apiKey: string
  /** A voice id from the vendor's library, or null for the model's default voice. */
  voiceId: string | null
  model: string
}

/**
 * The exact request to send. The key travels in a header and nowhere else —
 * not in the URL, where a proxy or a log line would keep it.
 */
export function fishRequest(input: FishRequestInput): { url: string; init: RequestInit } {
  return {
    url: FISH_TTS_URL,
    init: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
        // Model selection is a header on this API, not a body field.
        model: input.model,
      },
      body: JSON.stringify({
        text: input.text,
        format: 'mp3',
        latency: 'normal',
        normalize: true,
        ...(input.voiceId ? { reference_id: input.voiceId } : {}),
      }),
    },
  }
}

/** Turns a vendor status into a message an operator can act on, and whether to retry. */
export function describeSynthesisFailure(status: number): { message: string; retryable: boolean } {
  if (status === 401 || status === 403) {
    return { message: 'The voice service rejected this deployment’s key. Check FISH_AUDIO_API_KEY.', retryable: false }
  }
  if (status === 402) {
    return { message: 'The voice service reports no credit left on this account.', retryable: false }
  }
  if (status === 429) {
    return { message: 'The voice service is busy. The browser voice is used for now.', retryable: true }
  }
  if (status >= 500) {
    return { message: `The voice service returned ${status}. The browser voice is used for now.`, retryable: true }
  }
  return { message: `The voice service refused the request (${status}).`, retryable: false }
}

export async function synthesiseWithFish(
  input: FishRequestInput & { fetch?: typeof globalThis.fetch },
): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const doFetch = input.fetch ?? globalThis.fetch
  const { url, init } = fishRequest(input)

  let response: Response
  try {
    response = await doFetch(url, init)
  } catch {
    throw new SynthesisError('The voice service could not be reached.', true)
  }

  if (!response.ok) {
    const failure = describeSynthesisFailure(response.status)
    throw new SynthesisError(failure.message, failure.retryable)
  }

  const audio = await response.arrayBuffer()
  if (audio.byteLength === 0) {
    throw new SynthesisError('The voice service returned no audio.', true)
  }

  return { audio, contentType: response.headers.get('content-type') ?? 'audio/mpeg' }
}
