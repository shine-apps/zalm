/**
 * 分享埋点：统一入口，自动补 platform / 当前页面 / panelId。
 * 埋点是旁路能力——上报失败一律静默，绝不影响分享主流程。
 */
import { reportShareEvent } from '@/api/share'
import { getPlatform } from './platform'
import type { ShareEventBody, ShareTrackParams } from './types'

/** 生成面板会话 id（randomUUID 不可用时降级随机串）。 */
export function createPanelId(): string {
  const ctor = globalThis.crypto as Crypto | undefined
  if (ctor?.randomUUID) {
    return `p-${ctor.randomUUID().slice(0, 8)}`
  }
  return `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** 当前页面路由（如 /pages/activity/detail），取不到时返回空串。 */
export function currentPagePath(): string {
  try {
    const pages = getCurrentPages?.() ?? []
    const last = pages[pages.length - 1] as { route?: string, $page?: { fullPath?: string } } | undefined
    const route = last?.route
      ?? (last?.$page?.fullPath ? String(last.$page.fullPath).split('?')[0] : '')
    if (route) {
      return route.startsWith('/') ? route : `/${route}`
    }
  }
  catch {
    // 页面栈不可用时走下方 H5 兜底
  }

  // #ifdef H5
  if (typeof location !== 'undefined' && location.hash.includes('/')) {
    const seg = location.hash.replace(/^#/, '').split('?')[0]
    return seg.startsWith('/') ? seg : `/${seg}`
  }
  // #endif

  return ''
}

/**
 * 上报分享事件（fire-and-forget）。
 * 同一面板会话可显式传 panelId 串联；省略时仅带事件本身。
 */
export function trackShare(params: ShareTrackParams): void {
  const body: ShareEventBody = {
    platform: getPlatform(),
    page: currentPagePath(),
    event: params.event,
    channel: params.channel,
    targetType: params.targetType,
    targetId: params.targetId,
    shareUrl: params.shareUrl,
    panelId: params.panelId,
    extra: params.extra,
  }
  void reportShareEvent(body).catch(() => {
    // 埋点失败静默：网络异常/限流都不应打扰用户或阻断分享
  })
}
