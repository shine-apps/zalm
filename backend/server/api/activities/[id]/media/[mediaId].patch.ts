import { activityMediaParamsSchema, activityMediaUpdateBodySchema } from '../../../../schemas/activity'

/** 更新相册项描述（activity_admin 或 admin；空串清空）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id, mediaId } = parseParams(event, activityMediaParamsSchema)
  const body = await parseBody(event, activityMediaUpdateBodySchema)
  const item = await setActivityMediaDescription(id, mediaId, body.description)
  return ok(item, '描述已更新')
})
