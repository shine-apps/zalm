import { adminLedgerQuerySchema } from '../../../schemas/points'
import { getAdminLedgerView } from '../../../utils/points-service'

/** 全量积分流水（含备注/操作人，仅 admin）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const query = parseQuery(event, adminLedgerQuerySchema)
  const { data, total } = await getAdminLedgerView({
    category: query.category,
    source: query.source,
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
