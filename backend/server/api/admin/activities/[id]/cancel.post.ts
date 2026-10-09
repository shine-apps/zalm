import { activityIdParamSchema } from '../../../../schemas/activity'

/** 取消活动（admin 后台）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const { id } = parseParams(event, activityIdParamSchema)
  return ok(await cancelActivity(id), '活动已取消')
})
