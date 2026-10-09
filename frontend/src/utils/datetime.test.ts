import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatTimeRange,
  secondsUntilNextMinute,
} from './datetime'

describe('datetime formatting', () => {
  it('formats an ISO string to YYYY-MM-DD HH:mm', () => {
    expect(formatDateTime('2026-10-08T05:06:07.000Z')).toBeTypeOf('string')
    const out = formatDateTime('2026-10-08T05:06:00Z')
    // 只约束格式骨架，时区由运行环境决定
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('formats date only', () => {
    expect(formatDate('2026-10-08T05:06:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns empty string for nullish / invalid input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('not-a-date')).toBe('')
  })

  it('formats a same-day range on one line', () => {
    const out = formatTimeRange('2026-10-08T01:00:00Z', '2026-10-08T03:00:00Z')
    expect(out).toContain('~')
    expect(out.startsWith('2026-10-')).toBe(true)
  })

  it('computes seconds until the next minute boundary', () => {
    expect(secondsUntilNextMinute(0)).toBe(60)
    expect(secondsUntilNextMinute(30_000)).toBe(30)
    expect(secondsUntilNextMinute(59_000)).toBe(1)
  })
})
