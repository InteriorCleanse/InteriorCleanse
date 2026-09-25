import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MESSAGE_LIMIT, logFailure, logWarning, setLogSink } from '@/lib/log'

/**
 * "Confirm no request body is logged in production."
 *
 * A grep confirms it for today. This confirms it for every commit: there is
 * one logger, its signature cannot accept a body, and any raw `console.*` in
 * server code fails the build. Deleting this test is the only way past it,
 * which is the point — the confirmation becomes a decision somebody has to
 * make on purpose.
 */

const SERVER_DIRS = ['app', 'lib']
const ALLOWED = new Set(['lib/log.ts'])

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full)
    return /\.(ts|tsx)$/.test(entry) ? [full] : []
  })
}

describe('server code never calls console directly', () => {
  it('routes every log line through lib/log.ts', () => {
    const root = process.cwd()
    const offenders: string[] = []

    for (const dir of SERVER_DIRS) {
      for (const file of walk(path.join(root, dir))) {
        const relative = path.relative(root, file)
        if (ALLOWED.has(relative)) continue

        const source = readFileSync(file, 'utf8')
        // Client components may legitimately console in the browser; the
        // concern here is the server, where a log line is a durable record.
        if (source.startsWith("'use client'")) continue

        for (const [index, line] of source.split('\n').entries()) {
          if (/\bconsole\.(log|error|warn|info|debug|trace)\s*\(/.test(line)) {
            offenders.push(`${relative}:${index + 1}`)
          }
        }
      }
    }

    expect(
      offenders,
      `Raw console calls in server code. Use logFailure/logWarning from lib/log.ts:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('the logger', () => {
  const lines: string[] = []

  afterEach(() => {
    lines.length = 0
    setLogSink(null)
  })

  const capture = () => setLogSink((line) => lines.push(line))
  const last = () => JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>

  it('bounds the error message, because vendor errors quote the request', () => {
    capture()
    const body = JSON.stringify({ prompt: 'x'.repeat(5_000), apiKey: 'should-not-appear-in-full' })
    logFailure('test', new Error(`Invalid request: ${body}`))

    const logged = String(last().errorMessage)
    expect(logged.length).toBeLessThanOrEqual(MESSAGE_LIMIT + 1)
    expect(logged).not.toContain('should-not-appear-in-full')
  })

  it('records the error name and an HTTP status when there is one', () => {
    capture()
    const error = Object.assign(new Error('rate limited'), { status: 429 })
    logFailure('test', error)
    expect(last().errorName).toBe('Error')
    expect(last().status).toBe(429)
  })

  it('drops non-primitive fields rather than serialising them', () => {
    capture()
    // A caller that defeats the types with a cast still cannot get an object
    // into the line.
    logFailure('test', new Error('x'), {
      ok: 'kept',
      body: { secret: 'leaked' } as unknown as string,
      args: ['leaked'] as unknown as string,
    })
    const line = lines[0]!
    expect(line).toContain('kept')
    expect(line).not.toContain('leaked')
  })

  it('truncates string fields to the same bound', () => {
    capture()
    logWarning('test', { detail: 'y'.repeat(1_000) })
    expect(String(last().detail).length).toBeLessThanOrEqual(MESSAGE_LIMIT + 1)
  })

  it('does not serialise a non-Error thrown value', () => {
    capture()
    logFailure('test', { request: { body: 'leaked' } })
    expect(lines[0]).not.toContain('leaked')
    expect(last().errorName).toBe('object')
  })

  it('emits one JSON object per line, so a log pipeline can parse it', () => {
    capture()
    logFailure('scope.a', new Error('one'))
    logWarning('scope.b', { code: 'two' })
    expect(lines).toHaveLength(2)
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow()
    expect(last().scope).toBe('scope.b')
  })
})
