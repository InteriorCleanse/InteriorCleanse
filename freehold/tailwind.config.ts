import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        deed: 'var(--deed)',
        vault: 'var(--vault)',
        seal: 'var(--seal)',
        stone: 'var(--stone)',
        hairline: 'var(--hairline)',
        paper: 'var(--paper)',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"Instrument Sans Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      maxWidth: { prose: '38rem', page: '72rem' },
    },
  },
  plugins: [],
}
export default config
