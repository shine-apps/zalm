import { describe, expect, it } from 'vitest'
import {
  adminLedgerQuerySchema,
  leaderboardQuerySchema,
  manualPointsBodySchema,
  reversalBodySchema
} from './points'

const goodUser = {
  userId: 'u-1234567890abcdef',
  points: 20,
  note: '2026 秋季助学捐款',
  activityId: '8b1f2c50-1111-4aaa-bbbb-222222222222'
}

describe('manualPointsBodySchema', () => {
  it('accepts activity award with activityId', () => {
    const parsed = manualPointsBodySchema.parse({ ...goodUser, category: 'activity' })
    expect(parsed.category).toBe('activity')
    expect(parsed.activityId).toBe(goodUser.activityId)
    expect(parsed.donationKind).toBeUndefined()
    expect(parsed.note).toBe(goodUser.note)
  })

  it('accepts donation award with donationKind and defaults note', () => {
    const parsed = manualPointsBodySchema.parse({
      category: 'donation',
      userId: goodUser.userId,
      points: 100,
      donationKind: 'money'
    })
    expect(parsed.donationKind).toBe('money')
    expect(parsed.note).toBe('')
  })

  it('rejects activity without activityId, donation without donationKind', () => {
    expect(
      manualPointsBodySchema.safeParse({ category: 'activity', userId: goodUser.userId, points: 1 })
        .success
    ).toBe(false)
    expect(
      manualPointsBodySchema.safeParse({ category: 'donation', userId: goodUser.userId, points: 1 })
        .success
    ).toBe(false)
  })

  it('rejects crossed fields and out-of-range points', () => {
    expect(
      manualPointsBodySchema.safeParse({
        category: 'activity',
        userId: goodUser.userId,
        points: 1,
        activityId: goodUser.activityId,
        donationKind: 'goods'
      }).success
    ).toBe(false)
    expect(
      manualPointsBodySchema.safeParse({ ...goodUser, category: 'activity', points: 0 }).success
    ).toBe(false)
    expect(
      manualPointsBodySchema.safeParse({ ...goodUser, category: 'activity', points: 10000 }).success
    ).toBe(false)
  })

  it('parses createdAt ISO string to Date', () => {
    const parsed = manualPointsBodySchema.parse({
      category: 'donation',
      userId: goodUser.userId,
      points: 5,
      donationKind: 'goods',
      createdAt: '2026-09-01T10:00:00+08:00'
    })
    expect(parsed.createdAt).toBeInstanceOf(Date)
  })
})

describe('other points schemas', () => {
  it('leaderboard dimension defaults to total', () => {
    expect(leaderboardQuerySchema.parse({}).dimension).toBe('total')
    expect(leaderboardQuerySchema.parse({ dimension: 'activity' }).dimension).toBe('activity')
    expect(leaderboardQuerySchema.safeParse({ dimension: 'xxx' }).success).toBe(false)
  })

  it('reversal reason required 1..200', () => {
    expect(reversalBodySchema.safeParse({ reason: '' }).success).toBe(false)
    expect(reversalBodySchema.parse({ reason: '录错用户' }).reason).toBe('录错用户')
  })

  it('admin ledger query accepts filters', () => {
    const q = adminLedgerQuerySchema.parse({ category: 'donation', source: 'manual_donation', keyword: ' 张 ' })
    expect(q).toMatchObject({ category: 'donation', source: 'manual_donation', keyword: '张' })
  })
})
