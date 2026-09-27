import { z } from 'zod'
import { can } from '@/lib/authz'
import { isFishAudioConfigured, voiceEnv } from '@/lib/env'
import { logFailure } from '@/lib/log'
import { limitKey, rateLimit, rateLimitHeaders } from '@/lib/ratelimit-configured'
import { getSessionContext } from '@/lib/session'
import { SynthesisError, synthesiseWithFish } from '@/lib/voice/fish'
import { SPEECH_MAX_CHARS, prepareForSpeech } from '@/lib/voice/speech'

/**
 * Speaking a reply through the expressive cloud voice.
 *
 * The browser sends text, we send back audio. The vendor key stays on the
 * server; the person must be signed in and allowed to use the assistant; and
 * the request is rate-limited per workspace and person because every call
 * spends money. When no cloud voice is configured the response says so and
 * names the fallback, so the dock uses the browser's synthesiser instead of
 * showing an error for a feature the deployment never promised.
 *
 * The text is workspace data — a reply about revenue — and is not logged.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({ text: z.string().min(1).max(8_000) })

const NOT_CONFIGURED = {
  error: 'No cloud voice is configured on this deployment. The browser voice is used instead.',
  fallback: 'browser',
}

export async function POST(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  if (!isFishAudioConfigured()) return Response.json(NOT_CONFIGURED, { status: 503 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Malformed request.' }, { status: 400 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = {
    userId: session.userId,
    tenantRole: membership.role,
    platformRole: session.platformRole,
  }
  if (!can(actor, 'assistant:query')) {
    return Response.json({ error: 'Your role does not include using the assistant.' }, { status: 403 })
  }

  const limit = await rateLimit({
    key: limitKey('speech', membership.organizationId, session.userId),
    policy: 'speech',
  })
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many spoken replies at once. The browser voice is used for now.', fallback: 'browser' },
      { status: 429, headers: rateLimitHeaders(limit) },
    )
  }

  const text = prepareForSpeech(parsed.data.text, { expressive: true, maxChars: SPEECH_MAX_CHARS })
  if (!text) return Response.json({ error: 'Nothing to say.' }, { status: 400 })

  const env = voiceEnv()
  try {
    const { audio, contentType } = await synthesiseWithFish({
      text,
      apiKey: env.FISH_AUDIO_API_KEY,
      voiceId: env.FISH_AUDIO_VOICE_ID ?? null,
      model: env.FISH_AUDIO_MODEL,
    })
    return new Response(audio, {
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store',
        'x-voice-provider': 'fish-audio',
      },
    })
  } catch (error) {
    // Our own message classes only; the vendor's body is never forwarded.
    logFailure('assistant.speak', error)
    const known = error instanceof SynthesisError
    return Response.json(
      { error: known ? error.message : 'The voice service failed.', fallback: 'browser' },
      { status: known && !error.retryable ? 502 : 503 },
    )
  }
}
