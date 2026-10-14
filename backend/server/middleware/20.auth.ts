import type { H3Event } from 'h3'
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
/**
 * 公开但希望感知登录态的路径：
 * - /api/activities/**：公开 GET 附带 myRegistration；
 * - POST /api/share/events：游客可上报埋点，登录时记录 actorUserId。
 * 不查角色、不做封禁/登录拦截，会话无效时静默跳过。
 */
function isSoftSessionPath(pathname: string, method: string): boolean {
  if (pathname === '/api/activities' || pathname.startsWith('/api/activities/')) {
    return true
  }
  return method.toUpperCase() === 'POST' && pathname === '/api/share/events'
}

/** 从当前请求头解析会话并软挂载到 event.context（失败返回 null，不抛错）。 */
async function softMountSession(event: H3Event) {
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

export default defineEventHandler(async (event) => {
  const pathname = (event.path ?? '').split('?')[0] ?? ''
  if (!pathname.startsWith('/api/') || event.method === 'OPTIONS') return
  if (isPublicRequest(pathname, event.method)) {
    if (isSoftSessionPath(pathname, event.method)) {
      await softMountSession(event)
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
