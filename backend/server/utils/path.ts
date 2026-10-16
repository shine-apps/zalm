/**
 * 公开 API 路径匹配。
 * 规则：精确命中前缀，或命中“前缀 + /”下的子路径。
 * 不能用裸 startsWith，否则 /api/health 会误伤 /api/healthcheck 这类同级路径。
 */
const PUBLIC_PREFIXES = [
  '/api/health',
  '/api/auth',
  '/api/uploads',
  '/api/settings',
  '/api/share'
]

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * 方法 + 路径 级别的公开放行。
 * 活动列表/详情对游客可读，但写方法与深层路径（mine、registrations 等）仍须登录。
 * 详情规则只匹配单段 id，避免裸前缀误伤深层路径。
 */
const PUBLIC_GET_PATTERNS = [
  /^\/api\/activities$/,
  /^\/api\/activities\/[^/]+$/,
  /^\/api\/home$/,
  /^\/api\/points\/feed$/,
  /^\/api\/users\/[^/]+$/,
  /^\/api\/users\/[^/]+\/points$/,
  /^\/api\/users\/[^/]+\/registrations$/
]

export function isPublicRequest(pathname: string, method: string): boolean {
  if (isPublicPath(pathname)) return true
  if (method.toUpperCase() === 'GET') {
    return PUBLIC_GET_PATTERNS.some(re => re.test(pathname))
  }
  return false
}
