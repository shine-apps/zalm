import { describe, expect, it } from 'vitest'
import {
  activityTemplateCreateBodySchema,
  activityTemplateUpdateBodySchema,
  activityTemplateListQuerySchema,
  templateFromActivityBodySchema,
  templateFromActivityParamsSchema
} from './activity-template'

const loc = { name: '中山公园', address: '厦门市思明区公园南路', latitude: 24.4776, longitude: 118.0894 }

describe('activityTemplateCreateBodySchema', () => {
  it('requires only name; all preset fields may be missing', () => {
    const parsed = activityTemplateCreateBodySchema.parse({ name: '常规敬老活动' })
    expect(parsed.name).toBe('常规敬老活动')
    expect(parsed.title).toBeUndefined()
    expect(parsed.categories).toBeUndefined()
    expect(parsed.points).toBeUndefined()
  })

  it('accepts a fully specified template and parses times to Date', () => {
    const parsed = activityTemplateCreateBodySchema.parse({
      name: '周日环保巡查',
      title: '周日环保巡查',
      description: '沿河捡拾垃圾',
      coverUrl: 'https://example.com/cover.png',
      location: loc,
      categories: ['乡村振兴'],
      startTime: '2026-11-01T09:00:00+08:00',
      endTime: '2026-11-01T11:00:00+08:00',
      registerDeadline: null,
      capacity: null,
      points: 0
    })
    expect(parsed.startTime).toBeInstanceOf(Date)
    expect(parsed.points).toBe(0)
    expect(parsed.registerDeadline).toBeNull()
  })

  it('accepts empty categories (template may leave category unset)', () => {
    expect(activityTemplateCreateBodySchema.parse({ name: '模板', categories: [] }).categories).toEqual([])
  })

  it('rejects name shorter than 2 or longer than 30', () => {
    expect(activityTemplateCreateBodySchema.safeParse({ name: 'x' }).success).toBe(false)
    expect(activityTemplateCreateBodySchema.safeParse({ name: 'x'.repeat(31) }).success).toBe(false)
  })

  it('rejects invalid category enum, bad url, out-of-range points/capacity', () => {
    expect(activityTemplateCreateBodySchema.safeParse({ name: '模板', categories: ['其他'] }).success).toBe(false)
    expect(
      activityTemplateCreateBodySchema.safeParse({ name: '模板', coverUrl: 'not-a-url' }).success
    ).toBe(false)
    expect(activityTemplateCreateBodySchema.safeParse({ name: '模板', points: 10000 }).success).toBe(false)
    expect(activityTemplateCreateBodySchema.safeParse({ name: '模板', capacity: 0 }).success).toBe(false)
  })

  it('rejects unknown keys', () => {
    expect(activityTemplateCreateBodySchema.safeParse({ name: '模板', hacker: 1 }).success).toBe(false)
  })

  it('rejects location with a single coordinate', () => {
    expect(
      activityTemplateCreateBodySchema.safeParse({ name: '模板', location: { ...loc, longitude: null } }).success
    ).toBe(false)
  })
})

describe('activityTemplateUpdateBodySchema', () => {
  it('rejects empty patch', () => {
    expect(activityTemplateUpdateBodySchema.safeParse({}).success).toBe(false)
  })

  it('accepts null to clear preset fields (e.g. time / location / points)', () => {
    const parsed = activityTemplateUpdateBodySchema.parse({
      location: null,
      startTime: null,
      endTime: null,
      points: null,
      capacity: null
    })
    expect(parsed.location).toBeNull()
    expect(parsed.startTime).toBeNull()
    expect(parsed.points).toBeNull()
  })

  it('accepts renaming and category replacement', () => {
    expect(activityTemplateUpdateBodySchema.parse({ name: '新名称' }).name).toBe('新名称')
    expect(
      activityTemplateUpdateBodySchema.parse({ categories: ['爱心物资', '关爱群体'] }).categories
    ).toEqual(['爱心物资', '关爱群体'])
  })
})

describe('templateFromActivity schemas', () => {
  it('body accepts only name', () => {
    expect(templateFromActivityBodySchema.parse({ name: '模板' })).toEqual({ name: '模板' })
    expect(templateFromActivityBodySchema.safeParse({ name: '模板', title: 'x' }).success).toBe(false)
  })

  it('params require uuid activityId', () => {
    expect(
      templateFromActivityParamsSchema.safeParse({ activityId: '123e4567-e89b-42d3-a456-426614174000' }).success
    ).toBe(true)
    expect(templateFromActivityParamsSchema.safeParse({ activityId: 'x' }).success).toBe(false)
  })
})

describe('activityTemplateListQuerySchema', () => {
  it('coerces paging and keeps keyword', () => {
    const q = activityTemplateListQuerySchema.parse({ page: '2', pageSize: '5', keyword: '环保' })
    expect(q.page).toBe(2)
    expect(q.pageSize).toBe(5)
    expect(q.keyword).toBe('环保')
  })
})
