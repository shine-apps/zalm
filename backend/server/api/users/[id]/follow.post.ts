import { followTargetIdParamSchema } from '../../../schemas/follow'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, followTargetIdParamSchema)
  return ok(await followUser(id, user.id), '已关注')
})
