// Harness-only Tailwind config: same theme, different content glob, so the
// render harness compiles the real utility CSS rather than a hand-written shim.
import base from './tailwind.config'

const config = { ...base, content: ['/tmp/assistant-body.html'] }

export default config
