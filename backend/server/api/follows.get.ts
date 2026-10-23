import { followsQuerySchema } from '../schemas/follow'
import { buildPaginationMeta } from '../utils/pagination'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { type, page, pageSize } = parseQuery(event, followsQuerySchema)
  const { rows, total } = await listMyFollows(user.id, type, page, pageSize)
  return paginated(rows, buildPaginationMeta(total, { page, pageSize }))
})
