import type { Config } from 'tailwindcss'

/**
 * "Executive intelligence" palette — original, deliberately not Marvel/HUD.
 * Warm near-black ground, layered graphite panels, restrained cyan/cobalt/amber
 * accents. Financial figures use tabular numerals so columns align.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: 'rgb(var(--ground) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        panelRaised: 'rgb(var(--panel-raised) / <alpha-value>)',
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        signal: 'rgb(var(--signal) / <alpha-value>)',
        cobalt: 'rgb(var(--cobalt) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
        positive: 'rgb(var(--positive) / <alpha-value>)',
        negative: 'rgb(var(--negative) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        metric: ['2.25rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
      },
      borderRadius: { panel: '14px' },
      boxShadow: {
        panel: '0 1px 0 rgb(255 255 255 / 0.03) inset, 0 20px 40px -24px rgb(0 0 0 / 0.7)',
        glow: '0 0 40px -12px rgb(var(--signal) / 0.5)',
      },
    },
  },
  plugins: [],
}

export default config
