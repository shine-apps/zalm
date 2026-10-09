import { activityIdParamSchema } from '../../schemas/activity'

/** 活动详情（游客可读；登录时附带我的报名记录）。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, activityIdParamSchema)
  const viewer = getAuthUser(event)
  const detail = await getActivityDetail(id, viewer?.id ?? null)
  return ok(detail)
})
