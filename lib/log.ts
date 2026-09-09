/**
 * Server-side failure logging.
 *
 * The launch checklist asks us to confirm no request body is ever logged in
 * production. A grep confirms it for today; this makes it structural. There is
 * one way to log a failure, and its signature cannot take a body:
 *
 *   - `error` is reduced to its name, an HTTP status if it carries one, and
 *     the first `MESSAGE_LIMIT` characters of its message. The message is
 *     bounded because vendor errors quote the offending request — an Anthropic
 *     400 echoes the prompt, a Postgres constraint violation echoes the row —
 *     and a full message in a log line is a request body by another name.
 *   - `fields` accepts only primitives. Passing the request, the args, or the
 *     payload is a type error, and a non-primitive that slips past the types at
 *     runtime is dropped rather than serialised.
 *
 * Direct `console.*` calls are forbidden in `app/` and `lib/` outside this
 * file, and `tests/logging.test.ts` fails the build if one appears. That is the
 * confirmation: not that nobody has logged a body, but that nobody can without
 * first deleting the test that says so.
 */

export type LogField = string | number | boolean | null | undefined

/** Long enough to identify the failure, short enough not to be the payload. */
export const MESSAGE_LIMIT = 200

type Sink = (line: string) => void

let sink: Sink = (line) => process.stderr.write(`${line}\n`)

/** Test seam: capture lines instead of writing to stderr. */
export function setLogSink(next: Sink | null): void {
  sink = next ?? ((line) => process.stderr.write(`${line}\n`))
}

export function logFailure(
  scope: string,
  error: unknown,
  fields: Record<string, LogField> = {},
): void {
  const entry: Record<string, LogField> = {
    level: 'error',
    scope,
    at: new Date().toISOString(),
    ...primitiveOnly(fields),
    ...describe(error),
  }
  sink(JSON.stringify(entry))
}

export function logWarning(scope: string, fields: Record<string, LogField> = {}): void {
  sink(
    JSON.stringify({
      level: 'warn',
      scope,
      at: new Date().toISOString(),
      ...primitiveOnly(fields),
    }),
  )
}

function describe(error: unknown): Record<string, LogField> {
  if (error instanceof Error) {
    const status = (error as { status?: unknown }).status
    return {
      errorName: error.name,
      errorMessage: truncate(error.message),
      ...(typeof status === 'number' ? { status } : {}),
    }
  }
  if (typeof error === 'string') return { errorMessage: truncate(error) }
  // Anything else — an object, a response — is not something to serialise.
  return { errorName: typeof error }
}

function truncate(text: string): string {
  return text.length <= MESSAGE_LIMIT ? text : `${text.slice(0, MESSAGE_LIMIT)}…`
}

function primitiveOnly(fields: Record<string, unknown>): Record<string, LogField> {
  const out: Record<string, LogField> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = typeof value === 'string' ? truncate(value) : value
    }
  }
  return out
}
