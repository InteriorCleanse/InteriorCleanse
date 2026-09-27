import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        plate: 'var(--plate)',
        ink: 'var(--ink)',
        graphite: 'var(--graphite)',
        stone: 'var(--stone)',
        hairline: 'var(--hairline)',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"Instrument Sans Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
}
export default config
