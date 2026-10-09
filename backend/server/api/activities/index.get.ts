import { activityListQuerySchema } from '../../schemas/activity'

/** 活动分页列表（游客可读）。 */
export default defineEventHandler(async (event) => {
  const query = parseQuery(event, activityListQuerySchema)
  const { data, total } = await listActivityView({
    state: query.state,
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
