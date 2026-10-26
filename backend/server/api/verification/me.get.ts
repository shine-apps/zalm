import { findLatestVerification } from '../../database/repositories/verifications'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const [personal, enterprise] = await Promise.all([
    findLatestVerification(user.id, 'personal'),
    findLatestVerification(user.id, 'enterprise')
  ])
  return ok({
    personal: personal ? toMyVerificationView(personal) : null,
    enterprise: enterprise ? toMyVerificationView(enterprise) : null
  })
})
