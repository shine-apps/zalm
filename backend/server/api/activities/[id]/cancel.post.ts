import { activityIdParamSchema } from '../../../schemas/activity'

/** 取消活动（终态，activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  const activity = await cancelActivity(id)
  return ok(activity, '活动已取消')
})
