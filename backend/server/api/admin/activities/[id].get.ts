import { activityIdParamSchema } from '../../../schemas/activity'

/** 活动详情（admin 后台）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const { id } = parseParams(event, activityIdParamSchema)
  return ok(await getActivityDetail(id, null))
})
