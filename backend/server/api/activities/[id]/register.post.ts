import { activityIdParamSchema } from '../../../schemas/activity'

/** 报名活动（登录用户；满员/截止/取消 → 409，重复报名幂等）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const registration = await registerToActivity(id, user.id)
  setResponseStatus(event, 201)
  return ok(registration, '报名成功')
})
