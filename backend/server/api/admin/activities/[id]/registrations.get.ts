import { activityIdParamSchema } from '../../../../schemas/activity'

/** 活动报名/签到名单与统计（admin 后台）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const query = parseQuery(event, pageQuerySchema)
  const { rows, total, stats } = await getRegistrationListView(id, query.page, query.pageSize)
  const envelope = paginated(
    rows,
    buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize })
  )
  return { ...envelope, stats }
})
