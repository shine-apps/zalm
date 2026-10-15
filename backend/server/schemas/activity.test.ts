import { describe, expect, it } from 'vitest'
import {
  activityCreateBodySchema,
  activityListQuerySchema,
  activityLocationSchema,
  activityMediaBindBodySchema,
  activityMediaUpdateBodySchema,
  activityUpdateBodySchema,
  checkInBodySchema,
  collectTimeIssues,
  manualCheckInBodySchema
} from './activity'

const loc = { name: '中山公园', address: '厦门市思明区公园南路', latitude: 24.4776, longitude: 118.0894 }
const baseBody = {
  title: '秋日助学走访',
  description: '走访困境学生家庭',
  location: loc,
  categories: ['助学帮扶', '传统文化'] as string[],
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
      categories: ['爱心物资'],
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

  it('requires at least one category and rejects values outside the fixed set', () => {
    expect(activityCreateBodySchema.safeParse({ ...baseBody, categories: [] }).success).toBe(false)
    expect(activityCreateBodySchema.safeParse({ ...baseBody, categories: ['其他'] }).success).toBe(false)
    const { categories: _omitted, ...withoutCategories } = baseBody
    expect(activityCreateBodySchema.safeParse(withoutCategories).success).toBe(false)
  })

  it('accepts multiple categories in the fixed value set', () => {
    const parsed = activityCreateBodySchema.parse({
      ...baseBody,
      categories: ['爱心物资', '助学帮扶', '传统文化', '乡村振兴', '关爱群体']
    })
    expect(parsed.categories).toEqual(['爱心物资', '助学帮扶', '传统文化', '乡村振兴', '关爱群体'])
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

describe('activityMediaBindBodySchema', () => {
  const mediaId = '123e4567-e89b-42d3-a456-426614174000'

  it('accepts mediaId without description (defaults to empty)', () => {
    const parsed = activityMediaBindBodySchema.parse({ mediaId })
    expect(parsed.description).toBe('')
  })

  it('accepts an optional description within 200 chars', () => {
    const parsed = activityMediaBindBodySchema.parse({ mediaId, description: '现场合影' })
    expect(parsed.description).toBe('现场合影')
  })

  it('rejects missing or non-uuid mediaId', () => {
    expect(activityMediaBindBodySchema.safeParse({}).success).toBe(false)
    expect(activityMediaBindBodySchema.safeParse({ mediaId: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects description over 200 chars and unknown fields', () => {
    expect(
      activityMediaBindBodySchema.safeParse({ mediaId, description: 'x'.repeat(201) }).success
    ).toBe(false)
    expect(activityMediaBindBodySchema.safeParse({ mediaId, extra: 1 }).success).toBe(false)
  })
})

describe('activityMediaUpdateBodySchema', () => {
  it('accepts empty description (clearing)', () => {
    expect(activityMediaUpdateBodySchema.parse({ description: '' }).description).toBe('')
  })

  it('rejects missing or overlong description', () => {
    expect(activityMediaUpdateBodySchema.safeParse({}).success).toBe(false)
    expect(
      activityMediaUpdateBodySchema.safeParse({ description: 'x'.repeat(201) }).success
    ).toBe(false)
  })
})

describe('activity points', () => {
  it('defaults points to 0 when omitted', () => {
    const parsed = activityCreateBodySchema.parse({ ...baseBody })
    expect(parsed.points).toBe(0)
  })

  it('accepts points in 0..9999 and rejects out of range / non-integer', () => {
    expect(activityCreateBodySchema.parse({ ...baseBody, points: 10 }).points).toBe(10)
    expect(activityCreateBodySchema.parse({ ...baseBody, points: 9999 }).points).toBe(9999)
    expect(activityCreateBodySchema.safeParse({ ...baseBody, points: -1 }).success).toBe(false)
    expect(activityCreateBodySchema.safeParse({ ...baseBody, points: 10000 }).success).toBe(false)
    expect(activityCreateBodySchema.safeParse({ ...baseBody, points: 1.5 }).success).toBe(false)
  })

  it('update schema accepts optional points', () => {
    expect(activityUpdateBodySchema.parse({ points: 5 })).toEqual({ points: 5 })
  })
})
