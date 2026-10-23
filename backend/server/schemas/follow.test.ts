import { describe, expect, it } from 'vitest'
import { followTargetIdParamSchema, followsQuerySchema } from './follow'

describe('followsQuerySchema', () => {
  it('requires a known target type', () => {
    expect(followsQuerySchema.safeParse({ type: 'activity' }).success).toBe(true)
    expect(followsQuerySchema.safeParse({ type: 'user' }).success).toBe(true)
    expect(followsQuerySchema.safeParse({ type: 'post' }).success).toBe(false)
    expect(followsQuerySchema.safeParse({}).success).toBe(false)
  })

  it('applies pagination defaults and bounds', () => {
    const parsed = followsQuerySchema.parse({ type: 'activity' })
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
    expect(followsQuerySchema.safeParse({ type: 'activity', page: 0 }).success).toBe(false)
    expect(followsQuerySchema.safeParse({ type: 'activity', pageSize: 101 }).success).toBe(false)
  })
})

describe('followTargetIdParamSchema', () => {
  it('accepts non-uuid Better Auth user ids', () => {
    expect(followTargetIdParamSchema.safeParse({ id: 'kZ8xQ2mN3p' }).success).toBe(true)
  })

  it('rejects blank and over-long ids', () => {
    expect(followTargetIdParamSchema.safeParse({ id: '   ' }).success).toBe(false)
    expect(followTargetIdParamSchema.safeParse({ id: '' }).success).toBe(false)
    expect(followTargetIdParamSchema.safeParse({ id: 'x'.repeat(65) }).success).toBe(false)
  })
})
