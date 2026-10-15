import { describe, expect, it } from 'vitest'
import {
  buildReversalNote,
  isReversal,
  sourceLabel,
  toFeedItem,
  toLedgerView,
  type FeedJoinInput
} from './points-views'

const baseRow: FeedJoinInput = {
  id: 'l1',
  userId: 'u1',
  points: 10,
  category: 'activity',
  source: 'checkin',
  activityId: 'a1',
  registrationId: 'r1',
  donationKind: null,
  note: '',
  createdBy: null,
  reversalOf: null,
  createdAt: new Date('2026-10-14T09:00:00+08:00'),
  userName: '张三',
  userImage: null,
  activityTitle: '敬老院慰问'
}

describe('toFeedItem（全站动态：隐私裁剪）', () => {
  it('活动记录带活动标题，不含 note/registrationId 等敏感或内部字段', () => {
    const item = toFeedItem(baseRow)
    expect(item).toEqual({
      id: 'l1',
      userId: 'u1',
      userName: '张三',
      userImage: null,
      points: 10,
      category: 'activity',
      source: 'checkin',
      activityTitle: '敬老院慰问',
      donationKind: null,
      createdAt: '2026-10-14T01:00:00.000Z'
    })
    expect('note' in item).toBe(false)
    expect('registrationId' in item).toBe(false)
  })

  it('捐献记录只暴露 donationKind，绝不暴露 note', () => {
    const item = toFeedItem({
      ...baseRow,
      id: 'l2',
      category: 'donation',
      source: 'manual_donation',
      activityId: null,
      registrationId: null,
      donationKind: 'money',
      note: '捐款 1000 元',
      activityTitle: null
    })
    expect(item.donationKind).toBe('money')
    expect(item.activityTitle).toBeNull()
    expect('note' in item).toBe(false)
  })
})

describe('toLedgerView（本人明细：保留 note）', () => {
  it('活动明细带标题与备注', () => {
    const v = toLedgerView({ ...baseRow, note: '补录线下活动' })
    expect(v.note).toBe('补录线下活动')
    expect(v.activityTitle).toBe('敬老院慰问')
  })
})

describe('冲正辅助', () => {
  it('buildReversalNote 拼接原备注与原因', () => {
    expect(buildReversalNote('录错用户', '多录 20 分')).toBe('冲正：录错用户；原因：多录 20 分')
    expect(buildReversalNote('', '测试')).toBe('冲正：（原记录无备注）；原因：测试')
  })
  it('isReversal 仅识别 source=reversal', () => {
    expect(isReversal({ source: 'reversal' })).toBe(true)
    expect(isReversal({ source: 'checkin' })).toBe(false)
  })
  it('sourceLabel 中文映射齐全', () => {
    expect(sourceLabel('checkin')).toBe('签到奖励')
    expect(sourceLabel('manual_activity')).toBe('活动补录')
    expect(sourceLabel('manual_donation')).toBe('捐献录入')
    expect(sourceLabel('reversal')).toBe('冲正')
  })
})
