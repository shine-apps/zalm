import { listVerifications } from '../../../database/repositories/verifications'
import { listVerificationsQuerySchema } from '../../../schemas/verification'

export default defineEventHandler(async (event) => {
  const query = parseQuery(event, listVerificationsQuerySchema)
  const { items, total } = await listVerifications(query)
  return paginated(
    items.map(item => toAdminVerificationView(item.verification, item.applicant)),
    buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize })
  )
})
