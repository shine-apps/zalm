import { z } from 'zod'
import { pageQuerySchema } from '../utils/pagination'

/** 通知列表查询：分页 + 可选仅未读（查询字符串只有字符串，按 'true' 判定）。 */
export const notificationListQuerySchema = pageQuerySchema.extend({
  unread: z.enum(['true', 'false']).optional()
})

export const notificationIdParamSchema = z.object({
  id: z.string().uuid()
})
