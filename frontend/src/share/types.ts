/**
 * 分享模块的跨端类型定义（小程序 / H5 / App 共用）。
 */

/** 运行平台（与后端 SHARE_PLATFORMS 枚举对齐）。 */
export type SharePlatform
  = | 'mp-weixin'
    | 'wx-h5'
    | 'mobile-h5'
    | 'pc-h5'
    | 'app'
    | 'unknown'

/** 分享渠道（与后端 SHARE_CHANNELS 枚举对齐）。 */
export type ShareChannel = 'friend' | 'timeline' | 'copy' | 'webshare'

/** 分享行为事件（与后端 SHARE_EVENTS 枚举对齐）。 */
export type ShareEventName
  = | 'panel_open'
    | 'channel_select'
    | 'guide_show'
    | 'copy_success'
    | 'copy_fail'
    | 'wx_config_ok'
    | 'wx_config_fail'
    | 'mp_share_trigger'
    | 'mp_share_fail'
    | 'web_share_success'

/** H5 形态：微信浏览器 / 移动浏览器 / PC 浏览器。 */
export type H5Kind = 'wx-h5' | 'mobile-h5' | 'pc-h5'

/**
 * 页面声明的分享内容。
 * - page/query 是平台无关的内部路由（如 /pages/activity/detail + {id}），
 *   小程序转 path、H5 转 hash 链接；
 * - imageUrl 为业务封面（可空，空时回退应用图标）；
 * - targetType/targetId 仅用于埋点归因。
 */
export interface SharePayload {
  title: string
  desc?: string
  page: string
  query?: Record<string, string>
  imageUrl?: string | null
  targetType?: string
  targetId?: string
}

/** trackShare 的入参（platform/page/panelId 由 tracker 自动补齐）。 */
export interface ShareTrackParams {
  event: ShareEventName
  channel?: ShareChannel
  targetType?: string
  targetId?: string
  shareUrl?: string
  panelId?: string
  extra?: Record<string, unknown>
}

/** POST /api/share/events 请求体。 */
export interface ShareEventBody {
  platform: SharePlatform
  page: string
  event: ShareEventName
  channel?: ShareChannel
  targetType?: string
  targetId?: string
  shareUrl?: string
  panelId?: string
  extra?: Record<string, unknown>
}

/** GET /api/share/wx-config 响应。 */
export interface WxJsConfig {
  enabled: boolean
  appId?: string
  timestamp?: string
  nonceStr?: string
  signature?: string
}
