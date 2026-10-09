import { activityIdParamSchema, checkInBodySchema } from '../../../schemas/activity'

/** 扫码/输码自助签到（登录用户）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const { code } = await parseBody(event, checkInBodySchema)
  const registration = await checkInToActivity(id, user.id, code)
  return ok(registration, '签到成功')
})
