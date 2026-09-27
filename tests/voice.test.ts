import { describe, expect, it } from 'vitest'
import {
  FISH_TTS_URL,
  SynthesisError,
  describeSynthesisFailure,
  fishRequest,
  synthesiseWithFish,
} from '@/lib/voice/fish'
import {
  MOOD_TAGS,
  SPEECH_MAX_CHARS,
  clampSpeech,
  normaliseMoodTags,
  prepareForSpeech,
  speakable,
  stripMoodTags,
} from '@/lib/voice/speech'
import { matchWakeWord } from '@/lib/voice/wake'

/**
 * The spoken side of the assistant: what an engine is handed, how the wake
 * word is heard, and the exact request that reaches the voice vendor. All of
 * it pure, so a change to a tag list or a header fails here before it fails
 * out loud in someone's office.
 */

describe('speakable', () => {
  it('strips markdown a synthesiser would otherwise read out', () => {
    const text = speakable('## Revenue\n\n- **Net revenue** was `£12,400`\n- [details](https://x.y)\n\n| a | b |')
    // Line breaks survive as pauses; every markdown character is gone.
    expect(text.split(/\s+/).join(' ')).toBe('Revenue Net revenue was £12,400 details a b')
    expect(text).not.toMatch(/[#*`|[\]()]/)
  })
})

describe('mood tags', () => {
  it('normalises square brackets and spacing to the form the engine performs', () => {
    expect(normaliseMoodTags('[laughing] That was a good month.')).toBe('(laughing) That was a good month.')
    expect(normaliseMoodTags('( Excited ) Revenue is up.')).toBe('(excited) Revenue is up.')
    expect(normaliseMoodTags('[long-pause] Then the bad news.')).toBe('(long pause) Then the bad news.')
  })

  it('leaves an unknown bracketed phrase alone, because it is words', () => {
    // "[Q3 targets]" is a thing the operator said, not a mood.
    expect(normaliseMoodTags('See [Q3 targets] for the plan.')).toBe('See [Q3 targets] for the plan.')
    expect(stripMoodTags('See [Q3 targets] for the plan.')).toBe('See [Q3 targets] for the plan.')
  })

  it('removes known tags entirely for an engine that would read them', () => {
    expect(stripMoodTags('(laughing) That was a good month.')).toBe('That was a good month.')
    expect(stripMoodTags('Up ten percent. (sighing) Refunds too.')).toBe('Up ten percent. Refunds too.')
  })

  it('performs every listed tag and only those', () => {
    for (const tag of MOOD_TAGS) {
      expect(normaliseMoodTags(`[${tag}] hello`)).toBe(`(${tag}) hello`)
    }
    expect(stripMoodTags('[dancing] hello')).toBe('[dancing] hello')
  })
})

describe('clampSpeech', () => {
  it('returns short text unchanged', () => {
    expect(clampSpeech('Short.', 100)).toBe('Short.')
  })

  it('cuts at the last sentence boundary rather than mid-figure', () => {
    const text = 'Revenue was twelve thousand. Profit was four thousand. Refunds were three hundred and twelve pounds.'
    const cut = clampSpeech(text, 70)
    expect(cut).toBe('Revenue was twelve thousand. Profit was four thousand.')
  })

  it('falls back to a word boundary when no sentence ends early enough', () => {
    const text = 'a'.repeat(30) + ' ' + 'b'.repeat(30) + ' ' + 'c'.repeat(30)
    const cut = clampSpeech(text, 70)
    expect(cut).toBe('a'.repeat(30) + ' ' + 'b'.repeat(30))
  })
})

describe('prepareForSpeech', () => {
  it('keeps mood tags for the expressive engine and drops them for the browser', () => {
    const reply = '**(excited)** Net revenue was up eleven percent this month.'
    expect(prepareForSpeech(reply, { expressive: true })).toBe(
      '(excited) Net revenue was up eleven percent this month.',
    )
    expect(prepareForSpeech(reply, { expressive: false })).toBe(
      'Net revenue was up eleven percent this month.',
    )
  })

  it('never exceeds the utterance limit', () => {
    const long = 'Revenue was up. '.repeat(400)
    expect(prepareForSpeech(long, { expressive: true }).length).toBeLessThanOrEqual(SPEECH_MAX_CHARS)
  })
})

describe('matchWakeWord', () => {
  it('hears the name at the start, with or without a greeting, and returns the command', () => {
    expect(matchWakeWord('Hey Arch, what did we sell yesterday?', 'Arch')).toEqual({
      heard: true,
      command: 'what did we sell yesterday',
    })
    expect(matchWakeWord('arch how are margins', 'Arch')).toEqual({
      heard: true,
      command: 'how are margins',
    })
    expect(matchWakeWord('OK Arch', 'Arch')).toEqual({ heard: true, command: '' })
  })

  it('does not wake on the name mid-sentence, spoken to someone else', () => {
    expect(matchWakeWord('I told Arch about the numbers', 'Arch')).toEqual({ heard: false })
    expect(matchWakeWord('archive the old orders', 'Arch')).toEqual({ heard: false })
  })

  it('accepts the spellings a recogniser produces for a short name', () => {
    const names = ['Arch', 'Art', 'Arc']
    expect(matchWakeWord('hey art what is revenue', names)).toEqual({
      heard: true,
      command: 'what is revenue',
    })
    expect(matchWakeWord('arc', names)).toEqual({ heard: true, command: '' })
  })

  it('is a regex-safe match even for a name with punctuation', () => {
    expect(matchWakeWord('hey j.a.r.v.i.s show me refunds', 'J.A.R.V.I.S')).toEqual({
      heard: true,
      command: 'show me refunds',
    })
  })

  it('hears nothing from an empty transcript or an empty name', () => {
    expect(matchWakeWord('', 'Arch')).toEqual({ heard: false })
    expect(matchWakeWord('hey arch', '')).toEqual({ heard: false })
  })
})

describe('fishRequest', () => {
  const input = { text: '(excited) Hello there.', apiKey: 'fish-secret-key-0001', voiceId: 'voice-1', model: 's1' }

  it('sends the key in a header and nowhere else', () => {
    const { url, init } = fishRequest(input)
    expect(url).toBe(FISH_TTS_URL)
    expect(url).not.toContain('fish-secret')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer fish-secret-key-0001')
    expect(String(init.body)).not.toContain('fish-secret')
  })

  it('selects the model by header and the voice by reference id', () => {
    const { init } = fishRequest(input)
    expect((init.headers as Record<string, string>).model).toBe('s1')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.reference_id).toBe('voice-1')
    expect(body.text).toBe('(excited) Hello there.')
    expect(body.format).toBe('mp3')
  })

  it('omits the reference id when no voice is chosen, so the default voice is used', () => {
    const { init } = fishRequest({ ...input, voiceId: null })
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect('reference_id' in body).toBe(false)
  })
})

describe('synthesiseWithFish', () => {
  const input = { text: 'Hello.', apiKey: 'fish-secret-key-0001', voiceId: null, model: 's1' }

  it('returns the audio and its type', async () => {
    const fetchImpl = (async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      })) as unknown as typeof globalThis.fetch

    const result = await synthesiseWithFish({ ...input, fetch: fetchImpl })
    expect(result.contentType).toBe('audio/mpeg')
    expect(result.audio.byteLength).toBe(3)
  })

  it('treats a bad key or no credit as permanent and a busy vendor as retryable', async () => {
    const at = async (status: number) =>
      synthesiseWithFish({
        ...input,
        fetch: (async () => new Response('', { status })) as unknown as typeof globalThis.fetch,
      })
        .then(() => null)
        .catch((e: unknown) => e as SynthesisError)

    expect((await at(401))!.retryable).toBe(false)
    expect((await at(402))!.retryable).toBe(false)
    expect((await at(429))!.retryable).toBe(true)
    expect((await at(503))!.retryable).toBe(true)
    expect(describeSynthesisFailure(401).message).toMatch(/FISH_AUDIO_API_KEY/)
  })

  it('does not treat an empty 200 as speech', async () => {
    const error = await synthesiseWithFish({
      ...input,
      fetch: (async () => new Response(new Uint8Array(0), { status: 200 })) as unknown as typeof globalThis.fetch,
    })
      .then(() => null)
      .catch((e: unknown) => e as SynthesisError)
    expect(error).toBeInstanceOf(SynthesisError)
  })

  it('reports an unreachable vendor as retryable', async () => {
    const error = await synthesiseWithFish({
      ...input,
      fetch: (async () => {
        throw new Error('ECONNRESET')
      }) as unknown as typeof globalThis.fetch,
    })
      .then(() => null)
      .catch((e: unknown) => e as SynthesisError)
    expect(error!.retryable).toBe(true)
  })
})
