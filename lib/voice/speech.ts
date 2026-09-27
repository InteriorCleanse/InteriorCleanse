/**
 * Preparing a reply to be spoken.
 *
 * Two engines can read a reply aloud: the browser's own synthesiser, which is
 * free and reads exactly what it is given, and an expressive cloud voice (Fish
 * Audio), which performs a mood tag such as `(laughing)` rather than reading
 * the word. The same reply must sound right through either, so the text is
 * prepared here, once, with the engine's abilities as the only input.
 *
 * Nothing here is a security control. The reply already passed through the
 * secret redactor on its way to the screen; this is about how it sounds.
 */

/**
 * Longest utterance sent to a cloud voice. Long enough for a full spoken
 * answer (the voice addendum asks for about 80 words), short enough that a
 * runaway reply cannot spend a workspace's voice budget on one turn.
 */
export const SPEECH_MAX_CHARS = 1_500

/**
 * Mood and delivery tags the expressive engine performs. Written the way Fish
 * Audio's S1 model reads them — in parentheses, at the start of a phrase. A tag
 * outside this list is ordinary text and is left alone: an operator asking
 * about "[Q3 targets]" must hear the words, not have them silently removed.
 */
export const MOOD_TAGS = [
  'angry', 'sad', 'excited', 'surprised', 'satisfied', 'delighted', 'scared',
  'worried', 'upset', 'nervous', 'frustrated', 'empathetic', 'embarrassed',
  'confident', 'interested', 'curious', 'confused', 'joyful', 'relaxed',
  'grateful', 'proud', 'calm', 'serious', 'cheerful', 'friendly', 'sincere',
  'whispering', 'shouting', 'soft tone', 'in a hurry tone',
  'laughing', 'chuckling', 'sighing', 'sobbing', 'panting', 'groaning',
  'long pause', 'break',
] as const

const TAG_PATTERN = new RegExp(
  `[\\[(]\\s*(${MOOD_TAGS.map((t) => t.replace(/ /g, '[ -]?')).join('|')})\\s*[\\])]`,
  'gi',
)

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

/** `[laughing]` and `( laughing )` become `(laughing)`; unknown tags are untouched. */
export function normaliseMoodTags(text: string): string {
  return text.replace(TAG_PATTERN, (_m, tag: string) => `(${tag.toLowerCase().replace(/-/g, ' ')})`)
}

/** Removes known mood tags entirely, for an engine that would read them as words. */
export function stripMoodTags(text: string): string {
  return text.replace(TAG_PATTERN, ' ').replace(/\s{2,}/g, ' ').trim()
}

/**
 * Cuts a long reply at a sentence boundary rather than mid-word. A hard cut
 * leaves a voice trailing off in the middle of a figure, which is worse than
 * a reply that stops one sentence early.
 */
export function clampSpeech(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const head = text.slice(0, maxChars)
  const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  // A boundary in the first part of the text is a real one; one at the very
  // start would leave almost nothing, so fall back to the last word break.
  if (sentenceEnd >= maxChars * 0.4) return head.slice(0, sentenceEnd + 1).trim()
  const wordEnd = head.lastIndexOf(' ')
  return (wordEnd > 0 ? head.slice(0, wordEnd) : head).trim()
}

export type SpeechOptions = {
  /** True for an engine that performs mood tags; false for one that would read them. */
  expressive: boolean
  maxChars?: number
}

/** The text an engine should be handed for a given on-screen reply. */
export function prepareForSpeech(markdown: string, options: SpeechOptions): string {
  const plain = speakable(markdown)
  const tagged = options.expressive ? normaliseMoodTags(plain) : stripMoodTags(plain)
  return clampSpeech(tagged, options.maxChars ?? SPEECH_MAX_CHARS)
}
