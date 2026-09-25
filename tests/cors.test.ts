import { describe, expect, it } from 'vitest'
import { corsHeaders, isClientApiPath, parseOrigins } from '@/lib/cors'

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'

describe('parseOrigins', () => {
  it('keeps extension and web origins, drops everything else', () => {
    expect(
      parseOrigins(`${EXT}, https://app.example.com, http://localhost:3000, not-an-origin, *`),
    ).toEqual([EXT, 'https://app.example.com', 'http://localhost:3000'])
  })

  it('never yields a wildcard, however it is spelled', () => {
    expect(parseOrigins('*')).toEqual([])
    expect(parseOrigins('https://*')).toEqual([])
    expect(parseOrigins('chrome-extension://*')).toEqual([])
  })

  it('normalises case and trailing slashes and dedupes', () => {
    expect(parseOrigins('HTTPS://App.Example.com/, https://app.example.com')).toEqual([
      'https://app.example.com',
    ])
  })

  it('rejects an extension id that is not 32 letters a–p', () => {
    expect(parseOrigins('chrome-extension://short')).toEqual([])
    expect(parseOrigins('chrome-extension://abcdefghijklmnopabcdefghijklmnoz')).toEqual([])
  })

  it('is empty when unset', () => {
    expect(parseOrigins(undefined)).toEqual([])
    expect(parseOrigins('')).toEqual([])
  })
})

describe('corsHeaders', () => {
  it('returns credentialed headers for an allowed origin and Vary: Origin', () => {
    const headers = corsHeaders(EXT, [EXT])!
    expect(headers['Access-Control-Allow-Origin']).toBe(EXT)
    expect(headers['Access-Control-Allow-Credentials']).toBe('true')
    expect(headers.Vary).toBe('Origin')
  })

  it('returns nothing for an origin off the list, an empty list, or no origin', () => {
    expect(corsHeaders('https://evil.example', [EXT])).toBeNull()
    expect(corsHeaders(EXT, [])).toBeNull()
    expect(corsHeaders(null, [EXT])).toBeNull()
    expect(corsHeaders(undefined, [EXT])).toBeNull()
  })

  it('never reflects an origin that merely resembles an allowed one', () => {
    expect(corsHeaders('https://app.example.com.evil.example', ['https://app.example.com'])).toBeNull()
    expect(corsHeaders('https://app.example.com:8443', ['https://app.example.com'])).toBeNull()
  })
})

describe('isClientApiPath', () => {
  it('covers the assistant and session routes and nothing else', () => {
    expect(isClientApiPath('/api/assistant')).toBe(true)
    expect(isClientApiPath('/api/assistant/approvals')).toBe(true)
    expect(isClientApiPath('/api/session')).toBe(true)
    expect(isClientApiPath('/api/workspace')).toBe(false)
    expect(isClientApiPath('/api/assistantx')).toBe(false)
    expect(isClientApiPath('/app/command-center')).toBe(false)
  })
})
