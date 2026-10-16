import { activityTemplateListQuerySchema } from '../../../schemas/activity-template'

/** 活动模板分页列表（admin，含创建者信息）。 */
export default defineEventHandler(async (event) => {
  const query = parseQuery(event, activityTemplateListQuerySchema)
  const { rows, total } = await listAdminTemplateViews({
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(
    rows,
    buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize })
  )
})
