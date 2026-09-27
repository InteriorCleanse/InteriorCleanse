import { describe, expect, it } from 'vitest'
import { executeApprovedAction } from '@/lib/assistant/execute'
import { TOOLS_BY_NAME, type ToolContext } from '@/lib/assistant/tools'
import { connector } from '@/lib/integrations/registry'
import {
  SITE_HTML_LIMIT,
  extractHtml,
  siteContentSecurityPolicy,
  siteSystemPrompt,
  validateSiteHtml,
} from '@/lib/sites/generate'
import {
  DeployError,
  VERCEL_DEPLOY_URL,
  deployRequest,
  deployToVercel,
  slugify,
} from '@/lib/sites/vercel'

/**
 * "It builds real projects": from a brief to a private page to a public
 * address, with a human approval at each step. The page's constraints, the
 * host request, and the executor's refusals are all pinned here without a
 * model or a network.
 */

const PAGE = '<!doctype html><html><head><title>Sunrise Bakery</title><style>body{margin:0}</style></head><body><h1>Sunrise Bakery</h1><script>document.title="x"</script></body></html>'

describe('extractHtml', () => {
  it('unwraps a fenced document and drops any preamble or afterword', () => {
    expect(extractHtml('Here you go:\n```html\n' + PAGE + '\n```\nLet me know!')).toBe(PAGE)
    expect(extractHtml('Sure.\n' + PAGE + '\nAnything else?')).toBe(PAGE)
  })

  it('returns the trimmed text when there is no document, so validation can say so', () => {
    expect(extractHtml('  I cannot do that.  ')).toBe('I cannot do that.')
  })
})

describe('validateSiteHtml', () => {
  it('accepts a self-contained page with inline style and script', () => {
    expect(validateSiteHtml(PAGE)).toEqual({ ok: true })
  })

  it('rejects anything that is not a whole document', () => {
    expect(validateSiteHtml('')).toMatchObject({ ok: false })
    expect(validateSiteHtml('<div>hi</div>')).toMatchObject({ ok: false, reason: expect.stringMatching(/complete HTML/) })
  })

  it('rejects a page that reaches outside itself', () => {
    const cases = [
      '<script src="https://evil.example/x.js"></script>',
      '<iframe src="https://evil.example"></iframe>',
      '<object data="x"></object>',
      '<embed src="x">',
      '<base href="https://evil.example/">',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
      '<link rel="stylesheet" href="https://evil.example/x.css">',
    ]
    for (const bad of cases) {
      const html = PAGE.replace('<body>', `<body>${bad}`)
      expect(validateSiteHtml(html), bad).toMatchObject({ ok: false })
    }
  })

  it('allows a Google Fonts stylesheet, the one external resource the prompt permits', () => {
    const html = PAGE.replace(
      '<head>',
      '<head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
    )
    expect(validateSiteHtml(html)).toEqual({ ok: true })
  })

  it('rejects a page over the column limit', () => {
    const html = PAGE.replace('<body>', `<body>${'x'.repeat(SITE_HTML_LIMIT)}`)
    expect(validateSiteHtml(html)).toMatchObject({ ok: false, reason: expect.stringMatching(/too large/) })
  })

  it('serves the page in a sandbox that cannot reach the product', () => {
    const csp = siteContentSecurityPolicy()
    expect(csp).toMatch(/^sandbox /)
    expect(csp).not.toMatch(/allow-same-origin/)
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("form-action 'none'")
  })

  it('tells the model to leave placeholders rather than invent facts', () => {
    expect(siteSystemPrompt()).toMatch(/\[opening hours\]/)
    expect(siteSystemPrompt()).toMatch(/Never load a script/)
  })
})

describe('slugify', () => {
  it('makes a Vercel project name from a site name', () => {
    expect(slugify('Sunrise Bakery!')).toBe('sunrise-bakery')
    // Accents fold to their letters rather than vanishing.
    expect(slugify('  Café — Nº 1  ')).toBe('cafe-no-1')
    expect(slugify('')).toBe('site')
    expect(slugify('x'.repeat(100)).length).toBeLessThanOrEqual(52)
  })
})

describe('deployToVercel', () => {
  const input = { token: 'vercelTokenAbcdefghijklmnop', name: 'Sunrise Bakery', html: PAGE }

  it('sends the token in a header and the page inline, to production', () => {
    const { url, init } = deployRequest(input)
    expect(url).toBe(VERCEL_DEPLOY_URL)
    expect(url).not.toContain(input.token)
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${input.token}`)
    const body = JSON.parse(String(init.body)) as { name: string; files: { file: string; data: string }[]; target: string }
    expect(body.name).toBe('sunrise-bakery')
    expect(body.files).toEqual([{ file: 'index.html', data: PAGE }])
    expect(body.target).toBe('production')
    expect(String(init.body)).not.toContain(input.token)
  })

  it('returns the production alias as the address, and the deployment id', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ id: 'dpl_1', url: 'sunrise-bakery-abc.vercel.app', alias: ['sunrise-bakery.vercel.app'] }), {
        status: 200,
      })) as unknown as typeof globalThis.fetch
    const result = await deployToVercel({ ...input, fetch: fetchImpl })
    expect(result).toEqual({ url: 'https://sunrise-bakery.vercel.app', deploymentId: 'dpl_1' })
  })

  it('treats a rejected token as permanent and a 5xx as retryable', async () => {
    const at = async (status: number) =>
      deployToVercel({ ...input, fetch: (async () => new Response('', { status })) as unknown as typeof globalThis.fetch })
        .then(() => null)
        .catch((e: unknown) => e as DeployError)
    expect((await at(401))!.retryable).toBe(false)
    expect((await at(401))!.message).toMatch(/Reconnect Vercel/)
    expect((await at(503))!.retryable).toBe(true)
  })
})

describe('the Vercel connector', () => {
  it('is available, needs one token, and says what it will not touch', () => {
    const vercel = connector('vercel')!
    expect(vercel.status).toBe('available')
    expect(vercel.credentials.map((c) => c.key)).toEqual(['token'])
    expect(vercel.doesNotProvide.join(' ')).toMatch(/only to create deployments/)
  })
})

describe('the site tools', () => {
  const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({
    organizationId: 'org-1',
    isDemo: false,
    currency: 'GBP',
    can: () => true,
    ...over,
  })

  it('build_site previews a private page and names no host', async () => {
    const build = TOOLS_BY_NAME.get('build_site')!
    const args = build.schema.parse({ name: 'Sunrise Bakery', brief: 'A bakery site with the menu and opening hours.' })
    const preview = (await build.execute(args, ctx())).preview!
    expect(preview.summary).toContain('Sunrise Bakery')
    expect(preview.summary).toMatch(/private preview/)
    expect(preview.targetIntegration).toBeNull()
    expect(preview.fields.map((f) => f.label)).toContain('Visibility')
  })

  it('publish_site names Vercel as where the page leaves the workspace', async () => {
    const publish = TOOLS_BY_NAME.get('publish_site')!
    const args = publish.schema.parse({ siteId: '6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b', siteName: 'Sunrise Bakery' })
    const preview = (await publish.execute(args, ctx())).preview!
    expect(preview.targetIntegration).toBe('vercel')
    expect(preview.summary).toMatch(/public web/)
  })

  it('list_sites cites the table and every site, with the address as the link', async () => {
    const list = TOOLS_BY_NAME.get('list_sites')!
    const result = await list.execute(
      {},
      ctx({
        listSites: async () => [
          { id: 's1', name: 'Sunrise Bakery', status: 'published', publishedUrl: 'https://sunrise-bakery.vercel.app', createdAt: '2026-09-01T00:00:00Z' },
          { id: 's2', name: 'Draft', status: 'generated', publishedUrl: null, createdAt: '2026-09-02T00:00:00Z' },
        ],
      }),
    )
    expect(result.citations).toEqual(['site_builds', 'site:s1', 'site:s2'])
    expect(result.sources).toEqual([
      { key: 'site:s1', label: 'Sunrise Bakery', url: 'https://sunrise-bakery.vercel.app' },
      { key: 'site:s2', label: 'Draft', url: null },
    ])
  })
})

/**
 * A fake of the two query shapes the executor uses, recording what it wrote.
 * Not a Supabase mock: just enough chain to make the calls resolve.
 */
function fakeSupabase(options: { site?: { id: string; name: string; html: string } | null } = {}) {
  const inserted: Record<string, unknown>[] = []
  const updated: Record<string, unknown>[] = []
  const chain = (result: unknown) => {
    const self: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'insert', 'update', 'single', 'maybeSingle']) {
      self[method] = (arg: unknown) => {
        if (method === 'insert') inserted.push(arg as Record<string, unknown>)
        if (method === 'update') updated.push(arg as Record<string, unknown>)
        if (method === 'single' || method === 'maybeSingle') return Promise.resolve(result)
        return self
      }
    }
    // `.update(...).eq(...)` is awaited directly.
    ;(self as { then?: unknown }).then = (resolve: (v: unknown) => void) => resolve({ error: null })
    return self
  }
  return {
    inserted,
    updated,
    client: {
      from: (table: string) =>
        chain(
          table === 'site_builds'
            ? options.site === undefined
              ? { data: { id: 'site-1' }, error: null }
              : { data: options.site, error: null }
            : { data: { id: 'row-1' }, error: null },
        ),
    } as unknown as Parameters<typeof executeApprovedAction>[0]['supabase'],
  }
}

describe('executing a site action', () => {
  const build = {
    toolName: 'build_site',
    args: { name: 'Sunrise Bakery', brief: 'A bakery site with the menu and opening hours.' },
    organizationId: 'org-1',
    actorUserId: 'user-1',
  }

  it('writes the generated page when it passes validation', async () => {
    const db = fakeSupabase()
    const result = await executeApprovedAction({
      ...build,
      supabase: db.client,
      services: { generateSite: async () => '```html\n' + PAGE + '\n```' },
    })
    expect(result).toMatchObject({ ok: true, recordId: 'site-1' })
    expect(db.inserted[0]).toMatchObject({ organization_id: 'org-1', name: 'Sunrise Bakery', html: PAGE, status: 'generated' })
  })

  it('refuses a page that reaches outside itself, and saves nothing', async () => {
    const db = fakeSupabase()
    const result = await executeApprovedAction({
      ...build,
      supabase: db.client,
      services: { generateSite: async () => PAGE.replace('<body>', '<body><script src="https://evil.example/x.js"></script>') },
    })
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/not allowed.*Nothing was saved/) })
    expect(db.inserted).toEqual([])
  })

  it('says plainly when no model is configured', async () => {
    const result = await executeApprovedAction({ ...build, supabase: fakeSupabase().client })
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/not configured/) })
  })

  it('publishes through the host and records the address', async () => {
    const db = fakeSupabase({ site: { id: 'site-1', name: 'Sunrise Bakery', html: PAGE } })
    const result = await executeApprovedAction({
      toolName: 'publish_site',
      args: { siteId: '6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b', siteName: 'Sunrise Bakery' },
      organizationId: 'org-1',
      actorUserId: 'user-1',
      supabase: db.client,
      services: { publishSite: async () => ({ url: 'https://sunrise-bakery.vercel.app', deploymentId: 'dpl_1' }) },
    })
    expect(result).toMatchObject({ ok: true, summary: expect.stringContaining('sunrise-bakery.vercel.app') })
    expect(db.updated[0]).toMatchObject({ status: 'published', published_url: 'https://sunrise-bakery.vercel.app', deployment_id: 'dpl_1' })
  })

  it('refuses to publish without a connected host, and a site that is not here', async () => {
    const connected = fakeSupabase({ site: { id: 'site-1', name: 'S', html: PAGE } })
    const none = await executeApprovedAction({
      toolName: 'publish_site',
      args: { siteId: '6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b', siteName: 'S' },
      organizationId: 'org-1',
      actorUserId: 'user-1',
      supabase: connected.client,
    })
    expect(none).toMatchObject({ ok: false, reason: expect.stringMatching(/Vercel is not connected/) })

    const missing = await executeApprovedAction({
      toolName: 'publish_site',
      args: { siteId: '6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b', siteName: 'S' },
      organizationId: 'org-1',
      actorUserId: 'user-1',
      supabase: fakeSupabase({ site: null }).client,
      services: { publishSite: async () => ({ url: 'x', deploymentId: 'y' }) },
    })
    expect(missing).toMatchObject({ ok: false, reason: expect.stringMatching(/not in this workspace/) })
  })

  it('records a failed publish with the reason, never a token', async () => {
    const db = fakeSupabase({ site: { id: 'site-1', name: 'S', html: PAGE } })
    const result = await executeApprovedAction({
      toolName: 'publish_site',
      args: { siteId: '6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b', siteName: 'S' },
      organizationId: 'org-1',
      actorUserId: 'user-1',
      supabase: db.client,
      services: {
        publishSite: async () => {
          throw new DeployError('Vercel rejected the token. Reconnect Vercel with a new token.', false)
        },
      },
    })
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/Reconnect Vercel/) })
    expect(db.updated[0]).toMatchObject({ status: 'failed' })
  })
})
