import { describe, expect, it } from 'vitest'
import { shareEventBodySchema, wxConfigQuerySchema } from './share'

const validEvent = {
  platform: 'wx-h5',
  page: '/pages/activity/detail',
  targetType: 'activity',
  targetId: '550e8400-e29b-41d4-a716-446655440000',
  channel: 'friend',
  event: 'channel_select',
  shareUrl: 'https://example.com/h5/#/pages/activity/detail?id=x',
  panelId: 'p-abc123',
  extra: { from: 'detail-card' }
}

describe('shareEventBodySchema', () => {
  it('accepts a full valid event', () => {
    expect(shareEventBodySchema.safeParse(validEvent).success).toBe(true)
  })

  it('accepts a minimal guest event with only required fields', () => {
    const parsed = shareEventBodySchema.safeParse({
      platform: 'mp-weixin',
      page: '/pages/activity/detail',
      event: 'panel_open'
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects unknown platform/event/channel values', () => {
    expect(shareEventBodySchema.safeParse({ ...validEvent, platform: 'wap' }).success).toBe(false)
    expect(shareEventBodySchema.safeParse({ ...validEvent, event: 'share_success' }).success).toBe(false)
    expect(shareEventBodySchema.safeParse({ ...validEvent, channel: 'qq' }).success).toBe(false)
  })

  it('rejects blank/overlong page and unknown keys', () => {
    expect(shareEventBodySchema.safeParse({ ...validEvent, page: '  ' }).success).toBe(false)
    expect(
      shareEventBodySchema.safeParse({ ...validEvent, page: 'x'.repeat(129) }).success
    ).toBe(false)
    expect(shareEventBodySchema.safeParse({ ...validEvent, hacker: 1 }).success).toBe(false)
  })

  it('rejects non-JSON or oversized extra', () => {
    expect(
      shareEventBodySchema.safeParse({ ...validEvent, extra: { fn: () => 1 } }).success
    ).toBe(false)
    expect(
      shareEventBodySchema.safeParse({
        ...validEvent,
        extra: { blob: 'x'.repeat(2100) }
      }).success
    ).toBe(false)
  })
})

describe('wxConfigQuerySchema', () => {
  it('accepts http and https URLs', () => {
    expect(wxConfigQuerySchema.safeParse({ url: 'https://example.com/h5/' }).success).toBe(true)
    expect(wxConfigQuerySchema.safeParse({ url: 'http://localhost:3333/h5/' }).success).toBe(true)
  })

  it('rejects non-http or malformed URLs', () => {
    expect(wxConfigQuerySchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false)
    expect(wxConfigQuerySchema.safeParse({ url: 'not-a-url' }).success).toBe(false)
    expect(wxConfigQuerySchema.safeParse({}).success).toBe(false)
  })
})
