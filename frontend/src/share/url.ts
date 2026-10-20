/**
 * 分享链接 / 封面地址构造，平台无关的纯函数 + 少量运行时包装。
 * H5 为 hash 路由（base /h5/），生产链接形如 https://域名/h5/#/pages/xxx?a=1
 */
import { getH5BaseUrl } from '@/utils/checkin-link'

/** 兜底分享封面：包内 1024 应用图标（小程序 imageUrl 支持代码包路径）。 */
export const DEFAULT_SHARE_IMAGE_PATH = '/static/logo.png'

/** 规范化页面路径：补前导 /、去掉 query/hash。 */
export function normalizePage(page: string): string {
  const clean = (page || '').trim().split(/[?#]/)[0]
  return clean.startsWith('/') ? clean : `/${clean}`
}

/** 拼接 query string（跳过空值，自动 encodeURIComponent）。 */
export function stringifyShareQuery(query?: Record<string, string>): string {
  if (!query) {
    return ''
  }
  return Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}

/** 小程序转发 path：/pages/activity/detail?id=xxx。 */
export function buildMpSharePath(page: string, query?: Record<string, string>): string {
  const qs = stringifyShareQuery(query)
  return qs ? `${normalizePage(page)}?${qs}` : normalizePage(page)
}

/**
 * 纯函数：由站点基址 + 内部路由构造 H5 hash 链接。
 * @param siteBase 不含结尾斜杠的 origin(+base)，如 https://x.com/h5
 */
export function buildH5HashUrl(
  siteBase: string,
  page: string,
  query?: Record<string, string>,
): string {
  const root = (siteBase || '').trim().replace(/\/+$/, '')
  const qs = stringifyShareQuery(query)
  return qs ? `${root}/#${normalizePage(page)}?${qs}` : `${root}/#${normalizePage(page)}`
}

/**
 * 当前 H5 站点基址：
 * - H5 运行时取 location.origin + pathname（天然包含 /h5/，hash 模式整站不变，
 *   同时规避 iOS 微信 SPA 首次 URL 签名问题）；
 * - 非 H5 端用 VITE_H5_BASE_URL + VITE_APP_PUBLIC_BASE 拼出，未配置时返回 ''。
 */
export function getH5SiteBase(): string {
  let base = ''

  // #ifdef H5
  if (typeof location !== 'undefined') {
    base = `${location.origin}${location.pathname.replace(/\/+$/, '')}`
  }
  // #endif

  // #ifndef H5
  const configured = getH5BaseUrl()
  if (configured) {
    const publicBase = String(import.meta.env.VITE_APP_PUBLIC_BASE || '/').replace(/\/+$/, '')
    base = `${configured}${publicBase}`
  }
  // #endif

  return base
}

/** 面向外部分享的 H5 链接；非 H5 端未配置 H5 基址时返回 ''（调用方据此隐藏复制项）。 */
export function buildShareUrl(page: string, query?: Record<string, string>): string {
  const base = getH5SiteBase()
  return base ? buildH5HashUrl(base, page, query) : ''
}

/** 纯函数：把相对 URL 补成绝对 URL；已是绝对/协议相对/data URI 时原样返回。 */
export function toAbsoluteUrl(url: string, origin: string): string {
  if (!url) {
    return ''
  }
  if (/^(?:https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  const path = url.startsWith('/') ? url : `/${url}`
  return `${origin.replace(/\/+$/, '')}${path}`
}

/**
 * 解析分享封面：
 * - 空封面回退应用图标；
 * - H5：相对路径补当前 origin（JS-SDK imgUrl 要求绝对地址），默认图标走 BASE_URL；
 * - 非 H5：COS/媒体相对路径补后端基址，默认图标保留代码包本地路径。
 */
export function resolveShareImage(cover?: string | null): string {
  const raw = (cover || '').trim()
  let resolved = ''

  // #ifdef H5
  if (raw) {
    resolved = toAbsoluteUrl(raw, typeof location !== 'undefined' ? location.origin : '')
  }
  else if (typeof location !== 'undefined') {
    const iconPath = `${import.meta.env.BASE_URL}static/logo.png`.replace(/\/+/g, '/')
    resolved = toAbsoluteUrl(iconPath, location.origin)
  }
  // #endif

  // #ifndef H5
  if (raw) {
    if (/^(?:https?:)?\/\//.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
      resolved = raw
    }
    else {
      const server = String(import.meta.env.VITE_SERVER_BASEURL || '').replace(/\/+$/, '')
      resolved = `${server}${raw.startsWith('/') ? raw : `/${raw}`}`
    }
  }
  else {
    resolved = DEFAULT_SHARE_IMAGE_PATH
  }
  // #endif

  return resolved
}
