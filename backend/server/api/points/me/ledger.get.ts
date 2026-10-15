import { myLedgerQuerySchema } from '../../../schemas/points'

/** 我的积分明细（含本人完整备注）。 */
export default defineEventHandler(async (event) => {
  const me = requireUser(event)
  const query = parseQuery(event, myLedgerQuerySchema)
  const { data, total } = await getMyLedgerView({
    userId: me.id,
    category: query.category,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
