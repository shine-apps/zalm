/**
 * 分享 composable：页面一行接入，统一各端分享参数与小程序生命周期。
 *
 * @example
 * const { openShare, shareShow, sharePayload } = useShare(() => ({
 *   title: detail.value?.title ?? '',
 *   page: '/pages/activity/detail',
 *   query: { id: activityId.value },
 *   imageUrl: detail.value?.coverUrl,
 *   targetType: 'activity',
 *   targetId: activityId.value,
 * }))
 * // 模板：<share-sheet v-model="shareShow" :payload="sharePayload" />
 */
import { onHide, onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app'
import { computed, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { getPlatform } from './platform'
import { createPanelId, trackShare } from './tracker'
import type { SharePayload } from './types'
import { buildMpSharePath, buildShareUrl, resolveShareImage, stringifyShareQuery } from './url'
import { configWxShare } from './wx-js-sdk'

export function useShare(source: MaybeRefOrGetter<SharePayload>) {
  const show = ref(false)
  const panelId = ref(createPanelId())

  const payload = computed<SharePayload>(() => toValue(source))

  // 打开面板（小程序端由 share-sheet 自行降级为引导弹窗，这里只负责状态与埋点）
  function openShare(): string {
    panelId.value = createPanelId()
    trackShare({
      event: 'panel_open',
      panelId: panelId.value,
      targetType: payload.value.targetType,
      targetId: payload.value.targetId,
    })
    show.value = true
    return panelId.value
  }

  function closeShare() {
    show.value = false
  }

  // #ifdef MP-WEIXIN
  // 页面常驻显示「转发」「分享到朋友圈」菜单（微信默认开启，显式声明确保自定义内容生效）
  onShow(() => {
    uni.showShareMenu({
      menus: ['shareAppMessage', 'shareTimeline'],
    })
  })

  // 发送给朋友：path 必须是 / 开头的小程序页面路径
  onShareAppMessage(() => {
    const p = payload.value
    trackShare({
      event: 'mp_share_trigger',
      channel: 'friend',
      panelId: panelId.value,
      targetType: p.targetType,
      targetId: p.targetId,
    })
    return {
      title: p.title,
      path: buildMpSharePath(p.page, p.query),
      imageUrl: resolveShareImage(p.imageUrl),
    }
  })

  // 分享到朋友圈：无 path，只接受 query（用户点开后进入当前页面）
  onShareTimeline(() => {
    const p = payload.value
    trackShare({
      event: 'mp_share_trigger',
      channel: 'timeline',
      panelId: panelId.value,
      targetType: p.targetType,
      targetId: p.targetId,
    })
    return {
      title: p.title,
      query: stringifyShareQuery(p.query),
      imageUrl: resolveShareImage(p.imageUrl),
    }
  })
  // #endif

  // #ifdef H5
  // 微信内置浏览器：页面显示 / 分享参数变化时预设右上角转发卡片。
  // 微信网页无 JS 直接拉起分享面板的 API，预设完成后用户点右上角「···」→
  // 「发送给朋友 / 分享到朋友圈」即见自定义内容；其他浏览器与 PC 端跳过。
  if (getPlatform() === 'wx-h5') {
    let presetQueue: Promise<void> = Promise.resolve()
    let visible = true
    /** 上次预设内容指纹：payload 因计时器等非语义变化重算时避免重复请求与埋点。 */
    let lastPresetKey = ''

    // 微信分享卡片是全局状态：从详情页返回时本页 setup 不会重跑，
    // 必须在 onShow 重新预设，否则仍会发出上一页（如活动详情）的卡片。
    function presetWxCard(force = false) {
      const p = payload.value
      const link = p.title ? buildShareUrl(p.page, p.query) : ''
      if (!link) {
        return
      }
      const desc = p.desc || ''
      const imgUrl = resolveShareImage(p.imageUrl)
      const key = `${p.title}\u0001${desc}\u0001${link}\u0001${imgUrl}`
      if (!force && key === lastPresetKey) {
        return
      }
      lastPresetKey = key
      // 串行执行，避免 payload 连续变化（异步数据到达）时 wx.config 并发竞态
      presetQueue = presetQueue
        .then(async () => {
          // 页面已隐藏：上一页的异步数据晚到时不得覆盖当前可见页的卡片
          if (!visible) {
            return
          }
          const ok = await configWxShare({
            title: p.title,
            desc: desc.length > 60 ? `${desc.slice(0, 60)}…` : desc,
            link,
            imgUrl,
          })
          trackShare({
            event: ok ? 'wx_config_ok' : 'wx_config_fail',
            targetType: p.targetType,
            targetId: p.targetId,
            shareUrl: link,
          })
        })
        .catch(() => {})
    }

    watch(payload, () => presetWxCard(), { immediate: true })
    onShow(() => {
      visible = true
      // 返回本页时全局卡片可能已被其他页改写，强制重新覆盖
      presetWxCard(true)
    })
    onHide(() => {
      visible = false
    })
  }
  // #endif

  return {
    show,
    payload,
    panelId,
    openShare,
    closeShare,
  }
}
