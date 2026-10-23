import { activityIdParamSchema } from '../../../schemas/activity'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  return ok(await unfollowActivity(id, user.id), '已取消关注')
})
