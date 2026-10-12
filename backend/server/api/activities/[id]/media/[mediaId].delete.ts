import { activityMediaParamsSchema } from '../../../../schemas/activity'

/** 移除相册项（activity_admin 或 admin；media_file 保留，ref_count 归还）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id, mediaId } = parseParams(event, activityMediaParamsSchema)
  await removeActivityMedia(id, mediaId)
  return ok(null, '已从相册移除')
})
