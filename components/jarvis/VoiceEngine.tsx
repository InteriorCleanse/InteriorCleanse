'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Voice in and out via the browser's native Web Speech API.
 *
 * No API key, no vendor, no per-minute cost, no usage cap. Chrome, Edge and
 * Safari ship SpeechRecognition; Firefox does not, so `supported` gates the
 * microphone UI and the typed input stays the universal path.
 */

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export function useVoice() {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [supported, setSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    const SpeechRecognition = (w.SpeechRecognition || w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined

    if (!SpeechRecognition) {
      setSupported(false)
      return
    }
    setSupported(true)

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      setTranscript(
        Array.from(event.results)
          .map((r) => r[0].transcript)
          .join(''),
      )
    }

    recognition.onend = () => setListening(false)
    recognition.onerror = (event) => {
      setListening(false)
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        setError('Microphone access was blocked. Allow it in your browser settings, or type instead.')
      } else if (event?.error && event.error !== 'aborted' && event.error !== 'no-speech') {
        setError(`Speech recognition error: ${event.error}`)
      }
    }

    recognitionRef.current = recognition
    return () => recognition.abort()
  }, [])

  // Chrome populates getVoices() asynchronously — the first call returns [].
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices()
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load)
      window.speechSynthesis.cancel()
    }
  }, [])

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return
    setError(null)
    setTranscript('')
    try {
      recognitionRef.current.start()
    } catch {
      // start() throws if recognition is already running — that is the state we want anyway.
    }
    setListening(true)
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text.trim()) return
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)

    const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices()
    const preferred =
      voices.find((v) => v.name.includes('Google UK English Male')) ||
      voices.find((v) => v.name.includes('Daniel')) ||
      voices.find((v) => v.name.includes('Google US English')) ||
      voices.find((v) => v.lang === 'en-GB') ||
      voices.find((v) => v.lang.startsWith('en'))

    if (preferred) utterance.voice = preferred
    utterance.rate = 1.02
    utterance.pitch = 0.95
    utterance.volume = 1

    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }, [])

  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  return {
    listening,
    speaking,
    transcript,
    supported,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  }
}
