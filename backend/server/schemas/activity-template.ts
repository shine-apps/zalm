import { z } from 'zod'
import { ACTIVITY_CATEGORIES } from '../database/schema'
import { keywordQuerySchema, pageQuerySchema } from '../utils/pagination'
import { activityLocationSchema, isoDate } from './activity'

/** 模板名称（仅后台/选择器展示，非活动标题）。 */
export const templateNameSchema = z.string().trim().min(2).max(30)

/**
 * 模板可预设字段：全部允许缺失（与活动创建 schema 同源，但去掉必填）。
 * - 可空字段传 null 表示「清空该项预设」（更新语义）；缺省 key 表示「不改动」。
 * - 分类允许空数组（=未预设），与活动创建至少一个分类的要求不同。
 * - 时间字段不做时间关系校验：模板不产生真实排期，且允许部分/整体缺失。
 */
const templatePresetFields = {
  title: z.string().trim().min(2).max(50).nullable().optional(),
  description: z.string().max(2000).optional(),
  coverUrl: z.string().url().max(500).nullable().optional(),
  location: activityLocationSchema.nullable().optional(),
  categories: z
    .array(z.enum(ACTIVITY_CATEGORIES))
    .max(ACTIVITY_CATEGORIES.length, '分类数量超出限制')
    .optional(),
  startTime: isoDate.nullable().optional(),
  endTime: isoDate.nullable().optional(),
  registerDeadline: isoDate.nullable().optional(),
  capacity: z.number().int().min(1).max(99999).nullable().optional(),
  points: z.number().int().min(0).max(9999).nullable().optional()
}

export const activityTemplateCreateBodySchema = z
  .object({
    name: templateNameSchema,
    ...templatePresetFields
  })
  .strict()

export const activityTemplateUpdateBodySchema = z
  .object({
    name: templateNameSchema.optional(),
    ...templatePresetFields
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, { message: '至少提供一个待更新字段' })

/** 活动详情页「存为模板」：只收集模板名，其余字段服务端从活动复制（时间强制留空）。 */
export const templateFromActivityBodySchema = z
  .object({ name: templateNameSchema })
  .strict()

export const activityTemplateListQuerySchema = pageQuerySchema.merge(keywordQuerySchema)

export const activityTemplateIdParamSchema = z.object({
  id: z.string().uuid()
})

export const templateFromActivityParamsSchema = z.object({
  activityId: z.string().uuid()
})

export type ActivityTemplateCreateBody = z.infer<typeof activityTemplateCreateBodySchema>
export type ActivityTemplateUpdateBody = z.infer<typeof activityTemplateUpdateBodySchema>
export type TemplateFromActivityBody = z.infer<typeof templateFromActivityBodySchema>
