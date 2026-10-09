import type { SessionUser } from '../utils/auth-context'
import { ADMIN_ROLE, auth } from '../utils/auth'
import { getCachedUserRoleNames } from '../utils/roles-cache'
import { isPublicRequest } from '../utils/path'

/**
 * 服务端认证/授权中间件（Cookie 单通道）。
 * - 仅拦截 /api/**；公开：/api/health、/api/auth/**（Better Auth 自身处理）
 * - 其余 /api/** 必须携带有效会话，否则 401
 * - 被封禁用户一律 403
 * - /api/admin/** 额外要求 admin 角色，否则 403
 */
export default defineEventHandler(async (event) => {
  const pathname = (event.path ?? '').split('?')[0] ?? ''
  if (!pathname.startsWith('/api/') || event.method === 'OPTIONS') return
  if (isPublicRequest(pathname, event.method)) {
    // 公开的活动 GET（列表/详情）不强制登录，但若携带有效会话则软挂载到上下文，
    // 供详情附带 myRegistration；不查角色、不做封禁/登录拦截。
    if (pathname === '/api/activities' || pathname.startsWith('/api/activities/')) {
      const headers = new Headers()
      for (const [key, value] of Object.entries(getRequestHeaders(event))) {
        if (typeof value === 'string') headers.set(key, value)
      }
      const result = await auth.api.getSession({ headers }).catch(() => null)
      if (result?.user) {
        event.context.user = result.user as SessionUser
        event.context.session = result.session
      }
    }
    return
  }

  // 仅转发已定义的请求头（getRequestHeaders 可能含 undefined，不能直接作为 HeadersInit）
  const headers = new Headers()
  for (const [key, value] of Object.entries(getRequestHeaders(event))) {
    if (typeof value === 'string') headers.set(key, value)
  }
  const result = await auth.api.getSession({ headers })
  if (!result?.user) throw createApiError('UNAUTHORIZED')

  const sessionUser = result.user as SessionUser
  if (sessionUser.banned) throw createApiError('FORBIDDEN', { message: '账号已被停用' })

  const roles = await getCachedUserRoleNames(sessionUser.id)
  event.context.user = sessionUser
  event.context.session = result.session
  event.context.roles = roles

  if (pathname.startsWith('/api/admin/') && !roles.includes(ADMIN_ROLE)) {
    throw createApiError('FORBIDDEN')
  }
})
