import { z } from 'zod'
import { FOLLOW_TARGET_TYPES } from '../database/schema'
import { pageQuerySchema } from '../utils/pagination'

/** 关注目标类型：活动 / 用户。 */
export const followTargetTypeSchema = z.enum(FOLLOW_TARGET_TYPES)

/** GET /api/follows：目标类型必填 + 通用分页参数。 */
export const followsQuerySchema = pageQuerySchema.extend({
  type: followTargetTypeSchema
})

/**
 * 用户维度路由参数：Better Auth 用户 id 非 uuid，按现有 manualCheckInBodySchema
 * 口径放宽为 1..64 字符（活动维度仍用 activityIdParamSchema 的 uuid 校验）。
 */
export const followTargetIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64)
})

export type FollowTargetTypeValue = z.infer<typeof followTargetTypeSchema>
