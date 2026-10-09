/** 我的报名列表（登录用户）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const query = parseQuery(event, pageQuerySchema)
  const { data, total } = await listMineView(user.id, query.page, query.pageSize)
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
