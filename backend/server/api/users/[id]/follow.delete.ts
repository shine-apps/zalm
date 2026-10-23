import { followTargetIdParamSchema } from '../../../schemas/follow'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, followTargetIdParamSchema)
  return ok(await unfollowUser(id, user.id), '已取消关注')
})
