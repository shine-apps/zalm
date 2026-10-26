import { findApprovedVerifications } from '../../../database/repositories/verifications'
import { getUserById } from '../../../database/repositories/users'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createApiError('VALIDATION_ERROR', { message: '缺少用户 id' })
  }
  const target = await getUserById(id)
  if (!target || target.banned) {
    throw createApiError('NOT_FOUND', { message: '用户不存在' })
  }
  const rows = await findApprovedVerifications(id)
  return ok(rows.map(toPublicVerificationView))
})
