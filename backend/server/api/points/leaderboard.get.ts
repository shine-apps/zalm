import { leaderboardQuerySchema } from '../../schemas/points'

/** 积分排行榜（登录可见）：dimension=total|activity|donation，默认 total。 */
export default defineEventHandler(async (event) => {
  const me = requireUser(event)
  const query = parseQuery(event, leaderboardQuerySchema)
  const { data, total } = await getLeaderboardView({
    dimension: query.dimension,
    page: query.page,
    pageSize: query.pageSize,
    viewerId: me.id
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
