import { activityIdParamSchema, manualCheckInBodySchema } from '../../../schemas/activity'

/** 管理员现场手动补签（activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  const operator = requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  const { userId } = await parseBody(event, manualCheckInBodySchema)
  const registration = await manualCheckIn(id, userId, operator.id)
  return ok(registration, '补签成功')
})
