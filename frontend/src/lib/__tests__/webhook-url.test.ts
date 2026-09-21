/**
 * Security hardening — webhook URL allowlist / SSRF tests
 */
import { describe, it, expect } from 'vitest'
import {
  assertSafeWebhookUrl,
  UnsafeWebhookUrlError,
  BUILTIN_WEBHOOK_HOSTS,
} from '../../../../supabase/functions/shared/webhook-url.ts'

function expectReject(url: string) {
  expect(() => assertSafeWebhookUrl(url)).toThrow(UnsafeWebhookUrlError)
}

describe('assertSafeWebhookUrl', () => {
  it('accepts HTTPS Slack hooks host', () => {
    const u = assertSafeWebhookUrl('https://hooks.slack.com/services/T00/B00/xxx')
    expect(u.hostname).toBe('hooks.slack.com')
  })

  it('accepts HTTPS Discord hosts from UI placeholders', () => {
    expect(assertSafeWebhookUrl('https://discord.com/api/webhooks/1/abc').hostname).toBe('discord.com')
    expect(assertSafeWebhookUrl('https://discordapp.com/api/webhooks/1/abc').hostname).toBe('discordapp.com')
  })

  it('accepts explicit extra allowlist host', () => {
    const u = assertSafeWebhookUrl('https://alerts.example.com/hook', {
      extraAllowlist: ['alerts.example.com'],
    })
    expect(u.hostname).toBe('alerts.example.com')
  })

  it('rejects HTTP', () => {
    expectReject('http://hooks.slack.com/services/T00/B00/xxx')
  })

  it('rejects localhost and loopback', () => {
    expectReject('https://localhost/hook')
    expectReject('https://127.0.0.1/hook')
    expectReject('https://[::1]/hook')
  })

  it('rejects private IPv4', () => {
    expectReject('https://10.0.0.1/hook')
    expectReject('https://192.168.1.1/hook')
    expectReject('https://172.16.0.1/hook')
  })

  it('rejects link-local and metadata', () => {
    expectReject('https://169.254.169.254/latest/meta-data/')
    expectReject('https://metadata.google.internal/')
  })

  it('rejects credentials in URL', () => {
    expectReject('https://user:pass@hooks.slack.com/services/T00/B00/xxx')
  })

  it('rejects unapproved public hosts', () => {
    expectReject('https://evil.example/hook')
    expectReject('https://example.com/webhook')
  })

  it('rejects attacker subdomains of allowlisted roots', () => {
    expectReject('https://hooks.slack.com.evil.com/x')
    expectReject('https://evil.hooks.slack.com/x')
  })

  it('rejects malformed URLs', () => {
    expectReject('not-a-url')
    expectReject('')
  })

  it('documents builtin hosts matching WebhookSettings UI', () => {
    expect(BUILTIN_WEBHOOK_HOSTS).toContain('hooks.slack.com')
    expect(BUILTIN_WEBHOOK_HOSTS).toContain('discord.com')
  })
})
