import { activityIdParamSchema, activityMediaBindBodySchema } from '../../../../schemas/activity'

/** 绑定媒体到活动相册（组织者角色，或已签到的活动参与者）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const roles = getRoleNames(event)
  if (!ACTIVITY_ORGANIZER_ROLES.some(role => roles.includes(role))) {
    await requireActivityCheckedIn(id, user.id)
  }
  const body = await parseBody(event, activityMediaBindBodySchema)
  const item = await bindActivityMedia(id, body)
  return ok(item, '已添加到活动相册')
})
