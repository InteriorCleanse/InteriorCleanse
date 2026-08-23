import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Separate config so the render harness (JSX, slower) stays out of `npm test`.
export default defineConfig({
  test: { environment: 'node', include: ['scripts/**/*.test.tsx'] },
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
})
