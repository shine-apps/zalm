import { describe, expect, it } from 'vitest'
import {
  buildCancelledNotifications,
  buildCheckedInNotifications,
  buildRegisteredNotifications,
  buildUpdatedNotifications,
  diffActivityChanges,
  type ChangeableActivity
} from './notification-content'
import type { ActivityUpdateBody } from '../schemas/activity'

const T0 = new Date('2026-11-01T10:00:00.000Z')
const T1 = new Date('2026-11-01T12:00:00.000Z')

function activity(over: Partial<ChangeableActivity> = {}): ChangeableActivity {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: '敬老陪伴活动',
    startTime: T0,
    endTime: T1,
    registerDeadline: T0,
    location: { name: '社区活动中心', address: '幸福路 1 号', latitude: null, longitude: null },
    ...over
  }
}

describe('diffActivityChanges（活动变更检测）', () => {
  it('空补丁 => 无变更', () => {
    expect(diffActivityChanges(activity(), {} as ActivityUpdateBody)).toEqual([])
  })

  it('检测标题变更；标题未变不报', () => {
    expect(diffActivityChanges(activity(), { title: '新标题' })).toEqual(['title'])
    expect(diffActivityChanges(activity(), { title: '敬老陪伴活动' })).toEqual([])
  })

  it('检测开始/结束时间变更', () => {
    expect(diffActivityChanges(activity(), { startTime: new Date('2026-11-02T10:00:00.000Z') })).toEqual([
      'startTime'
    ])
    expect(diffActivityChanges(activity(), { endTime: new Date('2026-11-01T13:00:00.000Z') })).toEqual([
      'endTime'
    ])
    expect(diffActivityChanges(activity(), { startTime: T0 })).toEqual([])
  })

  it('报名截止时间被清空（null）也算变更；同值不报', () => {
    expect(diffActivityChanges(activity(), { registerDeadline: null })).toEqual(['registerDeadline'])
    expect(diffActivityChanges(activity(), { registerDeadline: T0 })).toEqual([])
    const noDeadline = activity({ registerDeadline: null })
    expect(diffActivityChanges(noDeadline, { registerDeadline: null })).toEqual([])
  })

  it('检测地点变更（名称/地址/经纬度）；深相等不报', () => {
    expect(
      diffActivityChanges(activity(), {
        location: { name: '新场地', address: '幸福路 1 号', latitude: null, longitude: null }
      })
    ).toEqual(['location'])
    expect(
      diffActivityChanges(activity(), {
        location: { name: '社区活动中心', address: '幸福路 1 号', latitude: 39.9, longitude: 116.4 }
      })
    ).toEqual(['location'])
    expect(
      diffActivityChanges(activity(), {
        location: { name: '社区活动中心', address: '幸福路 1 号', latitude: null, longitude: null }
      })
    ).toEqual([])
  })

  it('描述/分类/封面/容量/积分变化不产生通知', () => {
    expect(
      diffActivityChanges(activity(), {
        description: '新描述',
        categories: ['助学帮扶'],
        coverUrl: 'https://example.com/c.jpg',
        capacity: 100,
        points: 20
      })
    ).toEqual([])
  })

  it('多字段同时变更按固定顺序返回', () => {
    expect(
      diffActivityChanges(activity(), {
        location: { name: '新场地', address: '新地址', latitude: null, longitude: null },
        title: '新标题',
        endTime: new Date('2026-11-01T14:00:00.000Z'),
        registerDeadline: null
      })
    ).toEqual(['title', 'endTime', 'registerDeadline', 'location'])
  })
})

describe('活动通知文案 builders', () => {
  it('报名成功：每人一条，类型/跳转正确，正文含活动标题', () => {
    const drafts = buildRegisteredNotifications(activity(), ['u1', 'u2'])
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({
      userId: 'u1',
      type: 'activity.registered',
      title: '报名成功',
      targetType: 'activity',
      targetId: '11111111-1111-1111-1111-111111111111'
    })
    expect(drafts[0]!.body).toContain('敬老陪伴活动')
    expect(drafts[1]!.userId).toBe('u2')
  })

  it('空接收人 => 空数组', () => {
    expect(buildRegisteredNotifications(activity(), [])).toEqual([])
  })

  it('扫码签到（有积分）正文含积分；0 分不提积分；data 记录 method/points', () => {
    const withPoints = buildCheckedInNotifications(activity(), ['u1'], { method: 'scan', points: 5 })
    expect(withPoints[0]!.title).toBe('签到成功')
    expect(withPoints[0]!.body).toContain('5 积分')
    expect(withPoints[0]!.data).toEqual({ method: 'scan', points: 5 })

    const zero = buildCheckedInNotifications(activity(), ['u1'], { method: 'scan', points: 0 })
    expect(zero[0]!.body).not.toContain('积分')
    expect(zero[0]!.data).toEqual({ method: 'scan', points: 0 })
  })

  it('手动补签正文体现组织者代签，data.method=manual', () => {
    const drafts = buildCheckedInNotifications(activity(), ['u1'], { method: 'manual', points: 0 })
    expect(drafts[0]!.body).toContain('组织者')
    expect(drafts[0]!.data).toEqual({ method: 'manual', points: 0 })
  })

  it('活动取消：正文含标题', () => {
    const drafts = buildCancelledNotifications(activity(), ['u1'])
    expect(drafts[0]).toMatchObject({ type: 'activity.cancelled', title: '活动已取消' })
    expect(drafts[0]!.body).toContain('敬老陪伴活动')
  })

  it('活动变更：开始/结束时间合并为「活动时间」且不重复，标签按固定顺序', () => {
    const drafts = buildUpdatedNotifications(activity({ title: '新标题' }), ['u1'], [
      'startTime',
      'endTime'
    ])
    expect(drafts[0]!.type).toBe('activity.updated')
    expect(drafts[0]!.title).toBe('活动信息变更')
    expect(drafts[0]!.body).toContain('活动时间')
    expect(drafts[0]!.body.match(/活动时间/g)).toHaveLength(1)
    expect(drafts[0]!.data).toEqual({ changedFields: ['startTime', 'endTime'] })

    const multi = buildUpdatedNotifications(activity(), ['u1'], [
      'title',
      'startTime',
      'registerDeadline',
      'location'
    ])
    expect(multi[0]!.body).toContain('标题、活动时间、报名截止时间、地点')
  })
})
