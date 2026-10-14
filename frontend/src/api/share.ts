import { http } from '@/http/alova'
import type { ShareEventBody, WxJsConfig } from '@/share/types'

/** 旁路接口统一下发 meta：不弹错误 toast、不触发 401 登录跳转。 */
const SILENT_META = { toast: false, skipAuthRedirect: true } as const

/**
 * 获取微信 JS-SDK wx.config 签名（公开）。
 * 未配置公众号时后端返回 { enabled:false }，前端降级为引导分享。
 */
export function getWxConfig(url: string): Promise<WxJsConfig> {
  return http.Get('/share/wx-config', {
    params: { url },
    meta: SILENT_META,
  }) as unknown as Promise<WxJsConfig>
}

/** 上报一个分享行为事件（游客可报，HTTP 202，调用方 fire-and-forget）。 */
export function reportShareEvent(body: ShareEventBody): Promise<{ accepted: boolean }> {
  return http.Post('/share/events', body, {
    meta: SILENT_META,
  }) as unknown as Promise<{ accepted: boolean }>
}
