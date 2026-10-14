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
import { onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app'
import { computed, ref, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { createPanelId, trackShare } from './tracker'
import type { SharePayload } from './types'
import { buildMpSharePath, resolveShareImage, stringifyShareQuery } from './url'

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

  return {
    show,
    payload,
    panelId,
    openShare,
    closeShare,
  }
}
