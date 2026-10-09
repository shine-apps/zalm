import { activityCreateBodySchema } from '../../schemas/activity'

/** 发布活动（activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  const organizer = requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const body = await parseBody(event, activityCreateBodySchema)
  const activity = await publishActivity(body, organizer.id)
  setResponseStatus(event, 201)
  return ok(activity, '活动发布成功')
})
