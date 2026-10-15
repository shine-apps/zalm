import { describe, expect, it } from 'vitest'
import { formatFeedText } from './points-feed'

const base = {
  userName: '张三',
  points: 10,
  activityTitle: '敬老院慰问',
  category: 'activity',
  source: 'checkin',
} as const

describe('formatFeedText', () => {
  it('签到类动态', () => {
    expect(formatFeedText({ ...base, category: 'activity', source: 'checkin' }))
      .toBe('张三 参与「敬老院慰问」签到，获得 10 积分')
  })

  it('活动补录类动态不带「签到」', () => {
    expect(formatFeedText({ ...base, category: 'activity', source: 'manual_activity' }))
      .toBe('张三 参与「敬老院慰问」，获得 10 积分')
  })

  it('捐献类不区分款/物、不出现金额物资信息', () => {
    expect(
      formatFeedText({
        userName: '李四',
        points: 5,
        category: 'donation',
        source: 'manual_donation',
        activityTitle: null,
      }),
    ).toBe('李四 爱心捐献，获得 5 积分')
  })

  it('活动标题为空时兜底为公益活动', () => {
    expect(formatFeedText({ ...base, activityTitle: null }))
      .toBe('张三 参与「公益活动」签到，获得 10 积分')
    expect(formatFeedText({ ...base, activityTitle: '   ' }))
      .toBe('张三 参与「公益活动」签到，获得 10 积分')
  })
})
