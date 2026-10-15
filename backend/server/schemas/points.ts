import { z } from 'zod'
import { DONATION_KINDS, POINTS_CATEGORIES, POINTS_SOURCES } from '../database/schema'
import { pageQuerySchema } from '../utils/pagination'

/** ISO 字符串 → Date（非法值在 transform 阶段发 issue）。 */
const isoDate = z.string().trim().min(1).transform((value, ctx) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '时间格式不正确' })
    return z.NEVER
  }
  return d
})

/** 手工录入积分：必须为正整数 1..9999（0 分录入无意义，活动签到 0 分不写流水）。 */
export const manualPointsBodySchema = z
  .object({
    category: z.enum(POINTS_CATEGORIES),
    // Better Auth 用户 id 非 uuid 格式，按现有 manualCheckInBodySchema 口径放宽为 1..64
    userId: z.string().min(1).max(64),
    points: z.number().int().min(1).max(9999),
    activityId: z.string().uuid().optional(),
    donationKind: z.enum(DONATION_KINDS).optional(),
    note: z.string().trim().max(200).default(''),
    createdAt: isoDate.optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.category === 'activity') {
      if (!data.activityId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activityId'], message: '活动积分必须选择活动' })
      }
      if (data.donationKind !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['donationKind'], message: '活动积分不能携带捐献类型' })
      }
    } else {
      if (!data.donationKind) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['donationKind'], message: '捐献积分必须选择捐献类型' })
      }
      if (data.activityId !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activityId'], message: '捐献积分不能携带活动' })
      }
    }
  })

export type ManualPointsBody = z.infer<typeof manualPointsBodySchema>

export const reversalBodySchema = z
  .object({
    reason: z.string().trim().min(1, '请填写冲正原因').max(200, '冲正原因不能超过 200 字')
  })
  .strict()

export const ledgerIdParamsSchema = z.object({
  id: z.string().uuid()
})

export const leaderboardQuerySchema = pageQuerySchema.extend({
  dimension: z.enum(['total', 'activity', 'donation']).default('total')
})

export const feedQuerySchema = pageQuerySchema.extend({
  category: z.enum(POINTS_CATEGORIES).optional()
})

export const myLedgerQuerySchema = pageQuerySchema.extend({
  category: z.enum(POINTS_CATEGORIES).optional()
})

export const adminLedgerQuerySchema = pageQuerySchema.extend({
  category: z.enum(POINTS_CATEGORIES).optional(),
  source: z.enum(POINTS_SOURCES).optional(),
  keyword: z.string().trim().min(1).max(50).optional()
})

export const activityPickerQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(50).optional()
})
