/**
 * Publishing a built page through the workspace's own Vercel account.
 *
 * One request: a deployment with a single inline file. No project setup, no
 * git, no build — a static page needs none of it, and the fewer steps between
 * "approve" and "live" the fewer places one can fail. The token travels in a
 * header and nowhere else, and it is used for this one call: nothing here
 * lists, reads or changes anything else in the account.
 */

export const VERCEL_DEPLOY_URL = 'https://api.vercel.com/v13/deployments'

export class DeployError extends Error {
  constructor(
    message: string,
    /** True for Vercel having a bad minute; false for a token or input problem. */
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'DeployError'
  }
}

/** A Vercel project name: lowercase letters, digits and hyphens, bounded. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52)
    .replace(/-+$/g, '')
  return slug || 'site'
}

export type DeployInput = { token: string; name: string; html: string }

export function deployRequest(input: DeployInput): { url: string; init: RequestInit } {
  return {
    url: VERCEL_DEPLOY_URL,
    init: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: slugify(input.name),
        files: [{ file: 'index.html', data: input.html }],
        projectSettings: { framework: null },
        target: 'production',
      }),
    },
  }
}

export function describeDeployFailure(status: number): DeployError {
  if (status === 401 || status === 403) {
    return new DeployError('Vercel rejected the token. Reconnect Vercel with a new token.', false)
  }
  if (status === 429 || status >= 500) {
    return new DeployError(`Vercel returned ${status}. Try publishing again in a minute.`, true)
  }
  return new DeployError(`Vercel refused the deployment (${status}).`, false)
}

export async function deployToVercel(
  input: DeployInput & { fetch?: typeof globalThis.fetch },
): Promise<{ url: string; deploymentId: string }> {
  const doFetch = input.fetch ?? globalThis.fetch
  const { url, init } = deployRequest(input)

  let response: Response
  try {
    response = await doFetch(url, init)
  } catch {
    throw new DeployError('Vercel could not be reached.', true)
  }
  if (!response.ok) throw describeDeployFailure(response.status)

  const body = (await response.json().catch(() => ({}))) as {
    id?: string
    url?: string
    alias?: string[]
  }
  if (!body.id || !body.url) throw new DeployError('Vercel returned no deployment.', true)

  // The production alias is the stable address; the deployment url is the
  // fallback when the project has none yet.
  const host = body.alias?.[0] ?? body.url
  return { url: `https://${host.replace(/^https?:\/\//, '')}`, deploymentId: body.id }
}
