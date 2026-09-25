import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, THEMES, isTheme, normalizeTheme } from '@/lib/theme'

describe('theme values', () => {
  it('has Arch as the default and first option', () => {
    expect(DEFAULT_THEME).toBe('arch')
    expect(THEMES[0]!.value).toBe('arch')
  })

  it('offers exactly the three known themes', () => {
    expect(THEMES.map((t) => t.value)).toEqual(['arch', 'dark', 'light'])
  })

  it('recognises only real theme values', () => {
    for (const t of THEMES) expect(isTheme(t.value)).toBe(true)
    for (const junk of ['', 'Arch', 'neon', null, undefined, 42]) expect(isTheme(junk)).toBe(false)
  })

  it('falls back to the default for anything unknown, so a bad store value cannot break the page', () => {
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme('nonsense')).toBe('arch')
    expect(normalizeTheme(null)).toBe('arch')
    expect(normalizeTheme(undefined)).toBe('arch')
  })
})
