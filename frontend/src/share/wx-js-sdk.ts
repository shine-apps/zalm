/**
 * H5 微信 JS-SDK：动态加载 jweixin、wx.config 签名、预设好友/朋友圈分享卡片。
 * 仅 H5 编译；其他端导出同名空实现（恒返回 false）。
 *
 * 注意：微信网页没有用 JS 直接拉起分享面板的 API，本模块只负责“自定义卡片内容”，
 * 实际发送仍由用户点击右上角「•••」完成，UI 侧配合引导遮罩提示。
 */
import { getWxConfig } from '@/api/share'
import type { WxJsConfig } from './types'

export interface WxShareCard {
  title: string
  desc?: string
  link: string
  imgUrl?: string
}

interface WxGlobal {
  config: (opts: Record<string, unknown>) => void
  ready: (cb: () => void) => void
  error: (cb: (err: unknown) => void) => void
  updateAppMessageShareData: (opts: Record<string, unknown>) => void
  updateTimelineShareData: (opts: Record<string, unknown>) => void
}

const JSSDK_SRC = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js'
let scriptPromise: Promise<WxGlobal> | null = null

/** 动态注入 jweixin（单例，避免重复注入）。 */
function loadWxJssdk(): Promise<WxGlobal> {
  if (scriptPromise) {
    return scriptPromise
  }
  scriptPromise = new Promise((resolve, reject) => {
    // #ifdef H5
    const existing = (window as unknown as { wx?: WxGlobal }).wx
    if (existing?.config) {
      resolve(existing)
      return
    }
    const script = document.createElement('script')
    script.src = JSSDK_SRC
    script.async = true
    script.onload = () => {
      const wx = (window as unknown as { wx?: WxGlobal }).wx
      if (wx?.config) {
        resolve(wx)
      }
      else {
        scriptPromise = null
        reject(new Error('微信 JS-SDK 加载后未发现 wx 全局对象'))
      }
    }
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('微信 JS-SDK 脚本加载失败'))
    }
    document.head.appendChild(script)
    // #endif

    // #ifndef H5
    scriptPromise = null
    reject(new Error('JS-SDK 仅在 H5 可用'))
    // #endif
  })
  return scriptPromise
}

/** 调用 wx.config 并等待 ready；error 回调转为 reject。 */
function configAndReady(wx: WxGlobal, config: WxJsConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    wx.ready(() => {
      if (!settled) {
        settled = true
        resolve()
      }
    })
    wx.error((err) => {
      if (!settled) {
        settled = true
        reject(new Error(`wx.config 校验失败：${JSON.stringify(err)}`))
      }
    })
    wx.config({
      debug: false,
      appId: config.appId,
      timestamp: config.timestamp,
      nonceStr: config.nonceStr,
      signature: config.signature,
      jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
    })
  })
}

/**
 * 预设微信分享卡片。成功返回 true；未配置公众号/签名失败返回 false（调用方降级引导）。
 */
export async function configWxShare(card: WxShareCard): Promise<boolean> {
  let enabled = false

  // #ifdef H5
  try {
    // iOS 微信 SPA 签名 URL 取首次进入 URL；hash 模式下 # 前部分整站不变，直接取当前页即可
    const signUrl = location.href.split('#')[0]
    const config = await getWxConfig(signUrl)
    if (!config.enabled) {
      return false
    }
    const wx = await loadWxJssdk()
    await configAndReady(wx, config)
    wx.updateAppMessageShareData({
      title: card.title,
      desc: card.desc || '',
      link: card.link,
      imgUrl: card.imgUrl || '',
    })
    wx.updateTimelineShareData({
      title: card.title,
      link: card.link,
      imgUrl: card.imgUrl || '',
    })
    enabled = true
  }
  catch {
    enabled = false
  }
  // #endif

  return enabled
}
