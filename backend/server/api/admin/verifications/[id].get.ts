import { getVerificationWithApplicantById } from '../../../database/repositories/verifications'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createApiError('VALIDATION_ERROR', { message: '缺少认证申请 id' })
  }
  const found = await getVerificationWithApplicantById(id)
  if (!found) {
    throw createApiError('NOT_FOUND', { message: '认证申请不存在' })
  }
  return ok(toAdminVerificationView(found.verification, found.applicant))
})
