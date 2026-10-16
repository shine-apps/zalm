import { notificationIdParamSchema } from '../../../schemas/notification'

/** 标记单条通知已读（幂等；他人/不存在 404）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, notificationIdParamSchema)
  const row = await markMyNotificationRead(id, user.id)
  if (!row) throw createApiError('NOT_FOUND', { message: '通知不存在' })
  return ok({ id: row.id, readAt: row.readAt })
})
