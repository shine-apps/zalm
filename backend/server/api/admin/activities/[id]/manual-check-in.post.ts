import { activityIdParamSchema, manualCheckInBodySchema } from '../../../../schemas/activity'

/** 手动补签（admin 后台）。 */
export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const { userId } = await parseBody(event, manualCheckInBodySchema)
  return ok(await manualCheckIn(id, userId, admin.id), '补签成功')
})
