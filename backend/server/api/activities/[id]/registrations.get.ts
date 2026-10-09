import { activityIdParamSchema } from '../../../schemas/activity'

/** 活动报名/签到名单与统计（activity_admin 或 admin；含完整手机号）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  const query = parseQuery(event, pageQuerySchema)
  const { rows, total, stats } = await getRegistrationListView(id, query.page, query.pageSize)
  const envelope = paginated(
    rows,
    buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize })
  )
  return { ...envelope, stats }
})
