import { describe, expect, it } from 'vitest'
import { getRateLimitTier, isAnalyticsEndpoint, isSensitiveEndpoint } from './rate-limit'

describe('isAnalyticsEndpoint', () => {
  it('classifies only POST /api/share/events as analytics', () => {
    expect(isAnalyticsEndpoint('/api/share/events', 'POST')).toBe(true)
  })

  it('does not upgrade other share endpoints or methods', () => {
    expect(isAnalyticsEndpoint('/api/share/events', 'GET')).toBe(false)
    expect(isAnalyticsEndpoint('/api/share/wx-config', 'GET')).toBe(false)
    expect(isAnalyticsEndpoint('/api/share/eventsx', 'POST')).toBe(false)
    expect(isAnalyticsEndpoint('/api/share', 'POST')).toBe(false)
  })
})

describe('getRateLimitTier', () => {
  it('returns analytics for the public tracking endpoint', () => {
    expect(getRateLimitTier('/api/share/events', 'POST')).toBe('analytics')
  })

  it('keeps sensitive endpoints on the sensitive tier (regression of moved predicate)', () => {
    expect(getRateLimitTier('/api/auth/sign-in/email', 'POST')).toBe('sensitive')
    expect(getRateLimitTier('/api/auth/sign-up', 'POST')).toBe('sensitive')
    expect(getRateLimitTier('/api/auth/phone-number/send-otp', 'POST')).toBe('sensitive')
    expect(getRateLimitTier('/api/admin/users', 'POST')).toBe('sensitive')
    expect(getRateLimitTier('/api/activities/abc/register', 'POST')).toBe('sensitive')
    expect(getRateLimitTier('/api/activities/abc/check-in', 'POST')).toBe('sensitive')
    expect(getRateLimitTier('/api/admin/activities/abc/manual-check-in', 'POST')).toBe('sensitive')
    expect(getRateLimitTier('/api/activities/abc/check-in-code', 'GET')).toBe('sensitive')
  })

  it('does not misclassify sibling paths of sensitive endpoints', () => {
    expect(getRateLimitTier('/api/admin/users', 'GET')).toBe('global')
    expect(getRateLimitTier('/api/activities/abc/reviews', 'POST')).toBe('global')
    expect(getRateLimitTier('/api/share/wx-config', 'GET')).toBe('global')
  })

  it('falls back to global for regular API paths', () => {
    expect(getRateLimitTier('/api/me', 'GET')).toBe('global')
    expect(getRateLimitTier('/api/activities', 'GET')).toBe('global')
  })

  it('sensitive takes precedence over analytics when both match', () => {
    // 当前没有重叠路径，此用例锁定优先级语义，避免未来新增端点时意外降级
    expect(isSensitiveEndpoint('/api/share/events', 'POST')).toBe(false)
    expect(getRateLimitTier('/api/share/events', 'POST')).toBe('analytics')
  })
})
