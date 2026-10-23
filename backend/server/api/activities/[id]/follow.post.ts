import { activityIdParamSchema } from '../../../schemas/activity'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  return ok(await followActivity(id, user.id), '已关注')
})
