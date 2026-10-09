import { activityIdParamSchema, activityUpdateBodySchema } from '../../schemas/activity'

/** 编辑活动（activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  const body = await parseBody(event, activityUpdateBodySchema)
  const activity = await editActivity(id, body)
  return ok(activity, '活动已更新')
})
