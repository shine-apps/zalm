import { feedQuerySchema } from '../../schemas/points'

/** 全站近期积分获取动态（游客可读）；捐献记录在 service 层已强制隐去 note。 */
export default defineEventHandler(async (event) => {
  const query = parseQuery(event, feedQuerySchema)
  const { data, total } = await getFeedView({
    category: query.category,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
