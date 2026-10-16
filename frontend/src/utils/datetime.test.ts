import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
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

  describe('formatRelativeTime（消息列表相对时间，now 显式传入保证确定性）', () => {
    const now = new Date('2026-10-16T10:00:00.000Z')

    it('1 分钟内 => 刚刚（含未来时间兜底）', () => {
      expect(formatRelativeTime('2026-10-16T09:59:30.000Z', now)).toBe('刚刚')
      expect(formatRelativeTime('2026-10-16T10:01:00.000Z', now)).toBe('刚刚')
    })

    it('1 分钟~1 小时 => N 分钟前', () => {
      expect(formatRelativeTime('2026-10-16T09:55:00.000Z', now)).toBe('5分钟前')
    })

    it('1~24 小时 => N 小时前', () => {
      expect(formatRelativeTime('2026-10-16T08:00:00.000Z', now)).toBe('2小时前')
    })

    it('1~7 天 => N 天前', () => {
      expect(formatRelativeTime('2026-10-13T10:00:00.000Z', now)).toBe('3天前')
    })

    it('7 天及更早 => 回退到 YYYY-MM-DD', () => {
      expect(formatRelativeTime('2026-10-01T09:00:00.000Z', now)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('空值/非法输入 => 空串', () => {
      expect(formatRelativeTime(null, now)).toBe('')
      expect(formatRelativeTime('bad', now)).toBe('')
    })
  })
})
