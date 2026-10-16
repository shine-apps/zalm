import { pageQuerySchema } from '../../../utils/pagination'
import { listMineView } from '../../../utils/activity-service'
import { getUserById } from '../../../database/repositories/users'

/** 公开某用户的活动参与记录（分页）。 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createApiError('VALIDATION_ERROR', { message: '缺少用户 id' })

  const user = await getUserById(id)
  if (!user || user.banned)
    throw createApiError('NOT_FOUND', { message: '用户不存在' })

  const query = parseQuery(event, pageQuerySchema)
  const { data, total } = await listMineView(id, query.page, query.pageSize)
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
