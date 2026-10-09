import { activityIdParamSchema } from '../../../schemas/activity'

/** 获取当前窗口签到码（activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  return ok(await getOrganizerCheckInCode(id))
})
