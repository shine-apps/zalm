import { activityIdParamSchema, activityMediaBindBodySchema } from '../../../../schemas/activity'

/** 绑定媒体到活动相册（activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  const body = await parseBody(event, activityMediaBindBodySchema)
  const item = await bindActivityMedia(id, body)
  return ok(item, '已添加到活动相册')
})
