import { activityIdParamSchema } from '../../../schemas/activity'

/** 取消报名（活动开始前；登录用户）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const registration = await cancelMyRegistration(id, user.id)
  return ok(registration, '已取消报名')
})
