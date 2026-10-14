/**
 * 运行环境识别：小程序 / App 在编译期确定；H5 按 UA 与触摸特征细分。
 */
import type { H5Kind, SharePlatform } from './types'

/**
 * 纯函数：依据 UA / 触摸点 / 屏宽判定 H5 形态，便于单测。
 * - UA 含 MicroMessenger（含微信内打开的 H5）→ wx-h5
 * - 移动端 UA，或「触屏 + 窄屏」的二合一设备 → mobile-h5
 * - 其余视为 pc-h5
 */
export function detectH5Kind(
  userAgent: string,
  maxTouchPoints = 0,
  screenWidth = 1280,
): H5Kind {
  const ua = userAgent || ''
  if (/micromessenger/i.test(ua)) {
    return 'wx-h5'
  }
  const mobileUa = /android|iphone|ipad|ipod|harmonyos|mobile/i.test(ua)
  const touchNarrow = maxTouchPoints > 0 && screenWidth > 0 && screenWidth <= 820
  return mobileUa || touchNarrow ? 'mobile-h5' : 'pc-h5'
}

let cached: SharePlatform | null = null

/**
 * 当前运行平台（进程内缓存）。
 * 小程序/App 走条件编译；H5 与未命中端走运行时探测。
 */
export function getPlatform(force = false): SharePlatform {
  if (cached && !force) {
    return cached
  }

  let platform: SharePlatform | undefined

  // #ifdef MP-WEIXIN
  platform = 'mp-weixin'
  // #endif

  // #ifdef APP-PLUS
  platform = 'app'
  // #endif

  // #ifdef H5
  if (typeof navigator !== 'undefined') {
    platform = detectH5Kind(
      navigator.userAgent,
      navigator.maxTouchPoints ?? 0,
      typeof screen !== 'undefined' ? screen.width : 1280,
    )
  }
  // #endif

  cached = platform ?? 'unknown'
  return cached
}

/** 是否微信内置浏览器（仅 H5 有意义）。 */
export function isWechatBrowser(): boolean {
  // #ifdef H5
  if (typeof navigator !== 'undefined') {
    return /micromessenger/i.test(navigator.userAgent)
  }
  // #endif
  return false
}

/** 当前环境是否支持 Web Share API（navigator.share，移动端系统分享面板）。 */
export function supportsWebShare(): boolean {
  let supported = false
  // #ifdef H5
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    supported = true
  }
  // #endif
  return supported
}
