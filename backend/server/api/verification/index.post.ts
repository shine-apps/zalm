import { createVerification, findLatestVerification } from '../../database/repositories/verifications'
import { submitVerificationSchema } from '../../schemas/verification'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const body = await parseBody(event, submitVerificationSchema)

  const latest = await findLatestVerification(user.id, body.kind)
  if (latest?.status === 'pending') {
    throw createApiError('CONFLICT', { message: '已有待审核的申请，请等待审核结果' })
  }
  if (latest?.status === 'approved') {
    throw createApiError('CONFLICT', { message: '该类型认证已通过，无需重复提交' })
  }

  // 证件照与展示媒体都必须已完成 COS 登记（防未授权对象入库）；
  // 同时交叉校验声明的媒体类型与 key 路径推导的实际类型一致
  await assertVerificationMedia(body.verificationImage, 'image')
  for (const item of body.showcaseMedia) {
    await assertVerificationMedia(item.url, item.type)
  }

  const row = await createVerification({
    userId: user.id,
    kind: body.kind,
    payload: body.payload,
    verificationImage: body.verificationImage,
    showcaseMedia: body.showcaseMedia,
    introduction: body.introduction,
    ocrResult: body.ocrResult ?? null
  })
  return ok(toMyVerificationView(row))
})
