/**
 * 限流分层判定（纯函数，便于单测；实际计数在 middleware/10.rate-limit.ts）。
 * - sensitive：登录/注册/发 OTP/管理员建用户、活动报名签到等敏感端点（默认 10/min）
 * - follow：关注/取关写端点（默认 30/min），介于敏感档与全局档之间
 * - analytics：公开埋点上报（默认 30/min）。游客可报且每请求一行写入，
 *   配额必须明显严于全局，防止匿名刷库污染 share_event。
 * - global：其余 /api/**（默认 300/min）
 */
export type RateLimitTier = 'global' | 'sensitive' | 'follow' | 'analytics'

export function isSensitiveEndpoint(pathname: string, method: string): boolean {
  return (
    /^\/api\/auth\/sign-in(\/|$)/.test(pathname)
    || /^\/api\/auth\/sign-up(\/|$)/.test(pathname)
    || pathname === '/api/auth/phone-number/send-otp'
    || pathname === '/api/auth/phone-number/verify'
    || pathname === '/api/auth/wechat/phone-sign-in'
    || (pathname === '/api/admin/users' && method === 'POST')
    || (method === 'POST' && pathname === '/api/admin/points')
    || (method === 'POST' && /^\/api\/admin\/points\/[^/]+\/reverse$/.test(pathname))
    || (method === 'POST'
      && /^\/api\/activities\/[^/]+\/(register|check-in|manual-check-in)$/.test(pathname))
    || (method === 'POST'
      && /^\/api\/admin\/activities\/[^/]+\/manual-check-in$/.test(pathname))
    || (method === 'GET' && /^\/api\/activities\/[^/]+\/check-in-code$/.test(pathname))
  )
}

/** 公开埋点端点：仅 POST 精确命中，GET /api/share/wx-config 等其余 /api/share/** 不享受此档。 */
export function isAnalyticsEndpoint(pathname: string, method: string): boolean {
  return method === 'POST' && pathname === '/api/share/events'
}

/**
 * 关注/取关写端点（活动、用户两类资源）。
 * 独立档位（默认 30/min）：介于报名等敏感档 10/min 与全局 300/min 之间，
 * 既要挡住脚本刷库，又不能影响正常浏览时的连续关注操作。
 */
export function isFollowEndpoint(pathname: string, method: string): boolean {
  const m = method.toUpperCase()
  if (m !== 'POST' && m !== 'DELETE') return false
  return /^\/api\/(activities|users)\/[^/]+\/follow$/.test(pathname)
}

export function getRateLimitTier(pathname: string, method: string): RateLimitTier {
  if (isSensitiveEndpoint(pathname, method))
    return 'sensitive'
  if (isFollowEndpoint(pathname, method))
    return 'follow'
  if (isAnalyticsEndpoint(pathname, method))
    return 'analytics'
  return 'global'
}
