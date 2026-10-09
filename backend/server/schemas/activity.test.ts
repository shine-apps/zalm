import { describe, expect, it } from 'vitest'
import {
  activityCreateBodySchema,
  activityListQuerySchema,
  activityLocationSchema,
  checkInBodySchema,
  collectTimeIssues,
  manualCheckInBodySchema
} from './activity'

const loc = { name: '中山公园', address: '厦门市思明区公园南路', latitude: 24.4776, longitude: 118.0894 }
const baseBody = {
  title: '秋日助学走访',
  description: '走访困境学生家庭',
  location: loc,
  startTime: '2026-11-01T09:00:00+08:00',
  endTime: '2026-11-01T12:00:00+08:00',
  registerDeadline: '2026-10-31T18:00:00+08:00',
  capacity: 30
}

describe('activityLocationSchema', () => {
  it('accepts a full location', () => {
    expect(activityLocationSchema.parse(loc)).toEqual(loc)
  })

  it('defaults missing coordinates to null (manual address fallback)', () => {
    const parsed = activityLocationSchema.parse({ name: '村委会', address: '某村' })
    expect(parsed.latitude).toBeNull()
    expect(parsed.longitude).toBeNull()
  })

  it('rejects when only one coordinate is present', () => {
    expect(activityLocationSchema.safeParse({ ...loc, longitude: null }).success).toBe(false)
  })

  it('rejects blank name/address and out-of-range coordinates', () => {
    expect(activityLocationSchema.safeParse({ name: ' ', address: 'a' }).success).toBe(false)
    expect(activityLocationSchema.safeParse({ ...loc, latitude: 91 }).success).toBe(false)
    expect(activityLocationSchema.safeParse({ ...loc, longitude: 200 }).success).toBe(false)
  })

  it('accepts southern/western hemisphere (negative) coordinates', () => {
    const negative = { ...loc, latitude: -33.8688, longitude: -70.6693 }
    expect(activityLocationSchema.safeParse(negative).success).toBe(true)
  })
})

describe('activityCreateBodySchema', () => {
  it('accepts a valid body', () => {
    const parsed = activityCreateBodySchema.parse(baseBody)
    expect(parsed.startTime).toBeInstanceOf(Date)
    expect(parsed.description).toBe('走访困境学生家庭')
  })

  it('defaults description and allows null deadline/capacity', () => {
    const parsed = activityCreateBodySchema.parse({
      title: '小型茶话会',
      location: loc,
      startTime: baseBody.startTime,
      endTime: baseBody.endTime,
      registerDeadline: null,
      capacity: null
    })
    expect(parsed.description).toBe('')
    expect(parsed.registerDeadline).toBeNull()
    expect(parsed.capacity).toBeNull()
  })

  it('rejects end <= start and deadline after start', () => {
    expect(activityCreateBodySchema.safeParse({ ...baseBody, endTime: baseBody.startTime }).success).toBe(false)
    expect(
      activityCreateBodySchema.safeParse({ ...baseBody, registerDeadline: '2026-11-02T00:00:00+08:00' }).success
    ).toBe(false)
  })

  it('rejects bad title length and non-positive capacity', () => {
    expect(activityCreateBodySchema.safeParse({ ...baseBody, title: 'x' }).success).toBe(false)
    expect(activityCreateBodySchema.safeParse({ ...baseBody, capacity: 0 }).success).toBe(false)
  })

  it('rejects unknown keys', () => {
    expect(activityCreateBodySchema.safeParse({ ...baseBody, hacker: 1 }).success).toBe(false)
  })
})

describe('collectTimeIssues', () => {
  const start = new Date('2026-11-01T09:00:00+08:00')
  const end = new Date('2026-11-01T12:00:00+08:00')
  it('returns no issues for valid times', () => {
    expect(collectTimeIssues({ startTime: start, endTime: end, registerDeadline: null })).toEqual([])
  })
  it('flags endTime and deadline paths', () => {
    const issues = collectTimeIssues({
      startTime: start,
      endTime: start,
      registerDeadline: new Date('2026-11-01T10:00:00+08:00')
    })
    expect(issues.map(i => i.path)).toEqual(['endTime', 'registerDeadline'])
  })
})

describe('other activity schemas', () => {
  it('checkInBodySchema only accepts 6 digits', () => {
    expect(checkInBodySchema.safeParse({ code: '042137' }).success).toBe(true)
    expect(checkInBodySchema.safeParse({ code: '42137' }).success).toBe(false)
    expect(checkInBodySchema.safeParse({ code: 'abcdef' }).success).toBe(false)
  })

  it('manualCheckInBodySchema requires a user id', () => {
    expect(manualCheckInBodySchema.safeParse({ userId: 'u1' }).success).toBe(true)
    expect(manualCheckInBodySchema.safeParse({}).success).toBe(false)
  })

  it('activityListQuerySchema defaults state and coerces page', () => {
    const q = activityListQuerySchema.parse({ page: '2', pageSize: '10' })
    expect(q.state).toBe('active')
    expect(q.page).toBe(2)
    expect(activityListQuerySchema.parse({ state: 'past' }).state).toBe('past')
  })
})
