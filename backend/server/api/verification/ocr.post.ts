import { getMediaFileByUrl } from '../../database/repositories/media'
import { ocrRequestSchema } from '../../schemas/verification'

export default defineEventHandler(async (event) => {
  requireUser(event) // 登录即可，无需角色
  const body = await parseBody(event, ocrRequestSchema)

  // URL → media_file → COS key（登记时 metadata.key 已存）
  const media = await getMediaFileByUrl(body.imageUrl)
  const key = media?.metadata?.key
  const parsed = typeof key === 'string' ? parseObjectKey(key) : null
  if (!parsed || parsed.scope !== 'verification') {
    throw createApiError('VALIDATION_ERROR', { message: '证件照未登记或不属于认证域' })
  }

  const buffer = await getCosObjectBuffer(key as string)
  const result = body.kind === 'personal'
    ? await recognizeIdCard(buffer)
    : await recognizeBizLicense(buffer)

  return ok({ fields: result?.fields ?? null })
})
