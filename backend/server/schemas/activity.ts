import { z } from 'zod'
import { ACTIVITY_CATEGORIES } from '../database/schema'
import { keywordQuerySchema, pageQuerySchema } from '../utils/pagination'

export interface TimeIssue {
  path: 'startTime' | 'endTime' | 'registerDeadline'
  message: string
}

/** 合并后的时间关系校验（创建与“编辑时从库中补齐缺省值”共用）。 */
export function collectTimeIssues(input: {
  startTime: Date
  endTime: Date
  registerDeadline: Date | null
}): TimeIssue[] {
  const issues: TimeIssue[] = []
  if (input.endTime <= input.startTime) {
    issues.push({ path: 'endTime', message: '结束时间必须晚于开始时间' })
  }
  if (input.registerDeadline && input.registerDeadline > input.startTime) {
    issues.push({ path: 'registerDeadline', message: '报名截止时间不能晚于活动开始时间' })
  }
  return issues
}

/** ISO 字符串 → Date（非法值在 transform 阶段发 issue）。 */
const isoDate = z.string().trim().min(1).transform((value, ctx) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '时间格式不正确' })
    return z.NEVER
  }
  return d
})

export const activityLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().min(1).max(200),
    // 标准 WGS-84/GCJ-02 合法范围：纬度 [-90, 90]、经度 [-180, 180]（支持南半球/西经负值）
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null)
  })
  .strict()
  .superRefine((data, ctx) => {
    if ((data.latitude === null) !== (data.longitude === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latitude'],
        message: '经纬度必须同时提供或同时为空'
      })
    }
  })

/** 活动分类（固定值域多选，创建必填、更新可选）。 */
export const activityCategoriesSchema = z
  .array(z.enum(ACTIVITY_CATEGORIES))
  .min(1, '请至少选择一个活动分类')
  .max(ACTIVITY_CATEGORIES.length, '分类数量超出限制')

export const activityCreateBodySchema = z
  .object({
    title: z.string().trim().min(2).max(50),
    description: z.string().max(2000).default(''),
    coverUrl: z.string().url().max(500).nullable().optional(),
    location: activityLocationSchema,
    categories: activityCategoriesSchema,
    startTime: isoDate,
    endTime: isoDate,
    registerDeadline: isoDate.nullable().optional(),
    capacity: z.number().int().min(1).max(99999).nullable().optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    for (const issue of collectTimeIssues({
      startTime: data.startTime,
      endTime: data.endTime,
      registerDeadline: data.registerDeadline ?? null
    })) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message })
    }
  })

export const activityUpdateBodySchema = z
  .object({
    title: z.string().trim().min(2).max(50).optional(),
    description: z.string().max(2000).optional(),
    coverUrl: z.string().url().max(500).nullable().optional(),
    location: activityLocationSchema.optional(),
    categories: activityCategoriesSchema.optional(),
    startTime: isoDate.optional(),
    endTime: isoDate.optional(),
    registerDeadline: isoDate.nullable().optional(),
    capacity: z.number().int().min(1).max(99999).nullable().optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, { message: '至少提供一个待更新字段' })

export type ActivityCreateBody = z.infer<typeof activityCreateBodySchema>
export type ActivityUpdateBody = z.infer<typeof activityUpdateBodySchema>

export const activityListQuerySchema = pageQuerySchema.merge(keywordQuerySchema).extend({
  state: z.enum(['active', 'past', 'cancelled']).default('active')
})

export const activityIdParamSchema = z.object({
  id: z.string().uuid()
})

export const checkInBodySchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, '请输入 6 位数字签到码')
  })
  .strict()

export const manualCheckInBodySchema = z
  .object({
    userId: z.string().min(1).max(64)
  })
  .strict()
