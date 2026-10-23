import type { ActivityView } from '@/api/activity'
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_FALLBACK,
  enrolledText,
  isFull,
  progressPercent,
  seatBadge,
  shortChineseDate,
} from './home'

function activity(over: Partial<ActivityView> = {}): ActivityView {
  return {
    id: 'a1',
    title: '测试活动',
    description: '',
    coverUrl: null,
    location: { name: '仓库', address: '', latitude: null, longitude: null },
    categories: [],
    startTime: '2026-10-20T01:00:00.000Z',
    endTime: '2026-10-20T03:00:00.000Z',
    registerDeadline: null,
    capacity: 30,
    points: 0,
    status: 'published',
    state: 'upcoming',
    createdBy: 'u1',
    createdAt: '',
    updatedAt: '',
    registeredCount: 12,
    checkedInCount: 0,
    remaining: 18,
    myRegistration: null,
    media: [],
    isFollowed: false,
    ...over,
  }
}

describe('招募卡派生函数', () => {
  it('满员判定与席位角标', () => {
    expect(isFull(activity({ remaining: 18 }))).toBe(false)
    expect(seatBadge(activity({ remaining: 18 }))).toBe('报名中 · 剩 18 席')
    expect(isFull(activity({ capacity: 20, registeredCount: 20, remaining: 0 }))).toBe(true)
    expect(seatBadge(activity({ capacity: 20, registeredCount: 20, remaining: 0 }))).toBe('名额已满')
  })

  it('不限名额时无进度条，角标只显示报名中', () => {
    const a = activity({ capacity: null, remaining: null })
    expect(seatBadge(a)).toBe('报名中')
    expect(progressPercent(a)).toBeNull()
    expect(enrolledText(a)).toBe('已报 12/不限')
  })

  it('名额进度百分比取整且封顶 100', () => {
    expect(progressPercent(activity())).toBe(40)
    expect(progressPercent(activity({ capacity: 20, registeredCount: 20, remaining: 0 }))).toBe(100)
  })

  it('中文短日期', () => {
    expect(shortChineseDate('2026-10-05T01:00:00.000Z')).toBe('10月5日')
  })

  it('五个分类都有兜底图标', () => {
    expect(Object.keys(CATEGORY_FALLBACK)).toHaveLength(5)
  })
})
