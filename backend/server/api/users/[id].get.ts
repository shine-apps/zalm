import { getUserById } from '../../database/repositories/users'
import { getUserRoleNames } from '../../utils/auth'

/**
 * 公开用户资料（隐私安全白名单字段）。
 * 不含 email/phone/banned 等敏感字段；已封禁用户对游客不可见（返回 404），
 * 登录者若查看自己仍会展示完整资料走 /me 端点，不走这里。
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createApiError('VALIDATION_ERROR', { message: '缺少用户 id' })

  const user = await getUserById(id)
  if (!user || user.banned)
    throw createApiError('NOT_FOUND', { message: '用户不存在' })

  const roles = await getUserRoleNames(user.id).catch(() => [])

  return ok({
    id: user.id,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt,
    roles
  })
})
