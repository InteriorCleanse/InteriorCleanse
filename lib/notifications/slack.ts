/**
 * Slack, as a notification channel.
 *
 * An incoming webhook, not a bot. A webhook is one URL that can post to one
 * channel and do nothing else — it cannot read messages, list users, or be
 * turned into a way in. A bot token can. For a product whose job is to say
 * "refund rate is above your threshold" in a channel, the webhook is the whole
 * requirement, and the smaller credential is the right one to custody.
 *
 * The URL is the secret. It is sealed in the vault like an API key, and the
 * transport is handed it at send time and never logs it — Slack's error
 * responses do not echo it, but the request URL itself would, so the failure
 * path describes the status and nothing else.
 *
 * One transport per workspace, not per person: a channel is a shared place,
 * and the per-person preferences (quiet hours, severity floors) are about
 * being woken, which a channel post does not do. The channel gets warnings
 * and critical alerts, never info — a Slack channel that carries every
 * briefing is muted within a week.
 */

export type SlackMessage = {
  title: string
  body: string
  evidence: string | null
  severity: 'info' | 'warning' | 'critical'
  workspace: string
  link: string
}

export type SlackResult =
  | { sent: true }
  | { sent: false; retryable: boolean; detail: string }

export type SlackTransport = {
  send(message: SlackMessage): Promise<SlackResult>
}

/** The floor for a channel post. Info is noise in a shared channel. */
export const SLACK_MIN_SEVERITY: SlackMessage['severity'] = 'warning'

const SEVERITY_ICON: Record<SlackMessage['severity'], string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
}

export function isSlackWebhookUrl(value: string): boolean {
  return /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(
    value.trim(),
  )
}

/**
 * Block Kit payload. Plain text in `text` as the notification fallback, then a
 * header, the body, the evidence in a quiet context block, and one button.
 * Everything is mrkdwn-escaped: a product name containing `<` would otherwise
 * be read as a link.
 */
export function renderSlackPayload(message: SlackMessage): Record<string, unknown> {
  const icon = SEVERITY_ICON[message.severity]
  return {
    text: `${icon} ${message.title} — ${message.workspace}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `${icon} ${message.title}`.slice(0, 150), emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: escapeMrkdwn(message.body).slice(0, 3000) } },
      ...(message.evidence
        ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: escapeMrkdwn(message.evidence).slice(0, 3000) }] }]
        : []),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: `Open ${message.workspace}`.slice(0, 75), emoji: false },
            url: /^https?:\/\//i.test(message.link) ? message.link : undefined,
          },
        ],
      },
    ],
  }
}

export function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function slackWebhookTransport(options: {
  webhookUrl: string
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}): SlackTransport {
  const doFetch = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 8_000

  return {
    async send(message) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response
      try {
        response = await doFetch(options.webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(renderSlackPayload(message)),
          signal: controller.signal,
        })
      } catch {
        return { sent: false, retryable: true, detail: 'Slack could not be reached.' }
      } finally {
        clearTimeout(timer)
      }

      if (response.ok) return { sent: true }

      // Body discarded on principle; Slack's are short and safe, but the rule
      // is the same for every transport.
      await response.text().catch(() => '')

      // Slack returns 404 for a revoked or deleted webhook and 410 for one
      // removed with its app. Both are permanent: the URL must be replaced.
      if (response.status === 404 || response.status === 410 || response.status === 403) {
        return {
          sent: false,
          retryable: false,
          detail: 'Slack rejected the webhook. It has been removed or revoked — reconnect with a new one.',
        }
      }
      if (response.status === 429) {
        return { sent: false, retryable: true, detail: 'Slack is rate limiting posts to this channel.' }
      }
      return {
        sent: false,
        retryable: response.status >= 500,
        detail: `Slack returned ${response.status}.`,
      }
    },
  }
}
