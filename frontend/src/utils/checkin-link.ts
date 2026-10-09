/** 签到二维码链接（H5 hash 路由）与扫码结果解析，均为纯函数。 */

const CHECKIN_ROUTE = 'pages/activity/checkin'
const CODE_RE = /^\d{6}$/
const ID_RE = /^[\w-]{1,64}$/

/** 构造二维码内容：{base}/#/pages/activity/checkin?a={activityId}&c={code}。 */
export function buildCheckinUrl(base: string, activityId: string, code: string): string {
  const root = base.trim().replace(/\/+$/, '')
  return `${root}/#/${CHECKIN_ROUTE}?a=${encodeURIComponent(activityId)}&c=${encodeURIComponent(code)}`
}

function pickParam(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`[?&]${key}=([^&#]+)`))
  if (!m)
    return null
  try {
    return decodeURIComponent(m[1])
  }
  catch {
    return null
  }
}

/**
 * 解析微信扫一扫得到的签到链接：
 * 命中签到路由且 a 合法、c 为 6 位数字时返回 {activityId,code}，否则 null。
 */
export function parseCheckinUrl(raw: string): { activityId: string, code: string } | null {
  if (!raw || !raw.trim())
    return null
  const text = raw.trim()
  if (!text.includes(CHECKIN_ROUTE))
    return null
  const activityId = pickParam(text, 'a')
  const code = pickParam(text, 'c')
  if (!activityId || !ID_RE.test(activityId))
    return null
  if (!code || !CODE_RE.test(code))
    return null
  return { activityId, code }
}

/** 签到二维码 H5 基址：优先 VITE_H5_BASE_URL；H5 开发态回退当前 origin；其余端缺省返回 ''。 */
export function getH5BaseUrl(): string {
  const configured = (import.meta.env.VITE_H5_BASE_URL || '').trim()
  if (configured)
    return configured.replace(/\/+$/, '')
  // #ifdef H5
  if (typeof location !== 'undefined' && location.origin)
    return location.origin
  // #endif
  return ''
}
