// A tiny press: HTML in, pixels or pages out. Chromium renders the same
// fonts and CSS the site uses, so a cover, a PDF and a product card agree.
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined

let browser
export async function open() {
  browser ??= await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] })
  return browser
}
export async function close() { await browser?.close(); browser = undefined }

/** Screenshot `html` laid out at width×height CSS px, at `scale` device pixels per px. */
export async function png(html, { width, height, scale = 1, out, transparent = false, type = 'png', quality }) {
  const b = await open()
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: scale })
  const page = await ctx.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: out, omitBackground: transparent, type, quality, fullPage: false })
  await ctx.close()
  return out
}

/** Print `html` to a Letter PDF with backgrounds. Pages are `.page` blocks. */
export async function pdf(html, { out, size = 'Letter' }) {
  const b = await open()
  const ctx = await b.newContext()
  const page = await ctx.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.pdf({ path: out, format: size, printBackground: true, preferCSSPageSize: true })
  await ctx.close()
  return out
}
