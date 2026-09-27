/**
 * The wake word.
 *
 * "Hey Arch, what did we sell yesterday?" — one utterance that both opens the
 * assistant and asks the question. The matcher is pure so the exact phrases
 * that wake it are pinned by tests rather than discovered by shouting at a
 * laptop.
 *
 * Only a leading name wakes it. The name in the middle of a sentence spoken to
 * someone else in the room must not open a microphone.
 */

export type WakeMatch =
  | { heard: true; command: string }
  | { heard: false }

const PREFIXES = ['hey', 'hi', 'ok', 'okay', 'yo', 'alright']

/** Lowercase, punctuation to spaces, one space between words. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether a transcript starts with the assistant's name, and what follows it.
 *
 * `names` takes several spellings because recognisers hear a short name in
 * several ways — "Arch" arrives as "arch", "art" or "arc" — and the operator
 * can list the ones theirs produces.
 */
export function matchWakeWord(transcript: string, names: string | readonly string[]): WakeMatch {
  const list = (typeof names === 'string' ? [names] : [...names])
    .map(normalise)
    .filter((n) => n.length > 0)
  if (list.length === 0) return { heard: false }

  const text = normalise(transcript)
  if (!text) return { heard: false }

  const pattern = new RegExp(
    `^(?:(?:${PREFIXES.join('|')}) )?(?:${list.map(escape).join('|')})(?: (.*))?$`,
  )
  const match = pattern.exec(text)
  if (!match) return { heard: false }

  return { heard: true, command: (match[1] ?? '').trim() }
}
