import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

// eslint-config-next 16 ships flat config natively — no FlatCompat shim needed.
const config = [
  // `.claude/` holds vendored third-party agent skills; their scripts are not
  // this project's code and are not held to its lint rules.
  // `extension/` and `desktop/` are separate runtimes (Chrome MV3, Electron)
  // with their own globals; the parts worth testing are imported by tests.
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      '.claude/**',
      'extension/**',
      'desktop/**',
    ],
  },
  ...coreWebVitals,
  ...typescript,
]

export default config
