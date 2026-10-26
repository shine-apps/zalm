import { getVerificationById, reviewVerification } from '../../../../database/repositories/verifications'
import { reviewVerificationSchema } from '../../../../schemas/verification'

export default defineEventHandler(async (event) => {
  const admin = requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createApiError('VALIDATION_ERROR', { message: '缺少认证申请 id' })
  }
  const body = await parseBody(event, reviewVerificationSchema)

  const existing = await getVerificationById(id)
  if (!existing) {
    throw createApiError('NOT_FOUND', { message: '认证申请不存在' })
  }

  const reviewed = await reviewVerification({
    id,
    action: body.action,
    reviewerId: admin.id,
    rejectReason: body.rejectReason
  })
  if (!reviewed) {
    throw createApiError('CONFLICT', { message: '该申请已被处理，请刷新列表' })
  }

  const draft = reviewed.status === 'approved'
    ? buildVerificationApprovedNotification({ userId: reviewed.userId, kind: reviewed.kind })
    : buildVerificationRejectedNotification({
        userId: reviewed.userId,
        kind: reviewed.kind,
        rejectReason: reviewed.rejectReason ?? body.rejectReason ?? ''
      })
  await notifyUsers([draft])

  return ok(toAdminVerificationView(reviewed))
})
