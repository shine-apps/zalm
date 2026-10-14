<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { copyText } from '@/share/clipboard'
import { getPlatform, supportsWebShare } from '@/share/platform'
import { trackShare } from '@/share/tracker'
import type { ShareChannel, SharePayload } from '@/share/types'
import { buildShareUrl, resolveShareImage } from '@/share/url'
import { configWxShare } from '@/share/wx-js-sdk'

const props = defineProps<{
  show: boolean
  payload: SharePayload
  panelId: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

/** 编译/启动期一次确定：mp-weixin | wx-h5 | mobile-h5 | pc-h5 | app | unknown */
const platform = getPlatform()
const isMp = platform === 'mp-weixin'

const innerShow = computed({
  get: () => props.show && !isMp,
  set: v => emit('update:show', v),
})

const shareUrl = computed(() => buildShareUrl(props.payload.page, props.payload.query))
const shareImage = computed(() => resolveShareImage(props.payload.imageUrl))
const shareDesc = computed(() => {
  const desc = props.payload.desc || ''
  return desc.length > 60 ? `${desc.slice(0, 60)}…` : desc
})

interface SheetOption {
  channel: ShareChannel
  title: string
  icon: string
}

/** 按平台渲染选项，避免出现当前端不支持的能力。 */
const options = computed<SheetOption[]>(() => {
  const copy: SheetOption = { channel: 'copy', title: '复制链接', icon: 'i-carbon-link' }
  if (platform === 'wx-h5') {
    return [
      { channel: 'friend', title: '微信好友', icon: 'i-carbon-logo-wechat' },
      { channel: 'timeline', title: '朋友圈', icon: 'i-carbon-image' },
      copy,
    ]
  }
  if (platform === 'mobile-h5' && supportsWebShare()) {
    return [
      { channel: 'webshare', title: '系统分享', icon: 'i-carbon-share' },
      copy,
    ]
  }
  // pc-h5 / app / 不支持 Web Share 的移动浏览器：复制链接最通用
  return [copy]
})

const pcHint = '复制后可粘贴到微信/QQ 发送，也可发给文件传输助手后转发朋友圈'

// —— 微信浏览器：右上角引导遮罩 ——
const guideVisible = ref(false)
const guideChannel = ref<ShareChannel>('friend')
const guideText = computed(() =>
  guideChannel.value === 'timeline'
    ? '选择「分享到朋友圈」'
    : '选择「发送给朋友」',
)

function track(event: Parameters<typeof trackShare>[0]['event'], channel?: ShareChannel, extra?: Record<string, unknown>) {
  trackShare({
    event,
    channel,
    panelId: props.panelId,
    shareUrl: shareUrl.value,
    targetType: props.payload.targetType,
    targetId: props.payload.targetId,
    extra,
  })
}

function closeGuide() {
  guideVisible.value = false
}

/** 微信内：先经 JS-SDK 预设卡片，再引导用户点右上角（微信无直接拉起面板的 JS API）。 */
async function handleWxChannel(channel: Exclude<ShareChannel, 'copy' | 'webshare'>) {
  track('channel_select', channel)
  innerShow.value = false

  if (!shareUrl.value) {
    uni.showToast({ title: '当前页面链接不可用', icon: 'none' })
    return
  }

  const ok = await configWxShare({
    title: props.payload.title,
    desc: shareDesc.value,
    link: shareUrl.value,
    imgUrl: shareImage.value,
  })
  track(ok ? 'wx_config_ok' : 'wx_config_fail', channel)

  guideChannel.value = channel
  guideVisible.value = true
  track('guide_show', channel)
}

async function handleCopy() {
  track('channel_select', 'copy')
  innerShow.value = false

  if (!shareUrl.value) {
    uni.showToast({ title: '分享链接不可用', icon: 'none' })
    track('copy_fail', 'copy', { reason: 'empty-share-url' })
    return
  }

  try {
    const result = await copyText(shareUrl.value)
    track('copy_success', 'copy', { via: result.via })
    // 小程序/App 复制时系统自带“内容已复制”提示，不重复 toast
    if (!result.nativeHint) {
      uni.showToast({ title: '链接已复制', icon: 'success' })
    }
  }
  catch (err) {
    track('copy_fail', 'copy', {
      message: err instanceof Error ? err.message : String(err),
    })
    uni.showModal({
      title: '复制失败',
      content: `请长按选择下方链接手动复制：\n${shareUrl.value}`,
      showCancel: false,
      confirmText: '知道了',
    })
  }
}

async function handleWebShare() {
  track('channel_select', 'webshare')

  let shared = false
  // #ifdef H5
  try {
    await navigator.share({
      title: props.payload.title,
      text: shareDesc.value || props.payload.title,
      url: shareUrl.value,
    })
    shared = true
    track('web_share_success', 'webshare')
    innerShow.value = false
  }
  catch (err) {
    // 用户主动取消系统面板：AbortError，不算失败，直接关面板
    if ((err as DOMException | undefined)?.name === 'AbortError') {
      innerShow.value = false
      return
    }
  }
  // #endif

  // 不支持或分享异常：降级为复制链接
  if (!shared) {
    await handleCopy()
  }
}

function onSelect(channel: ShareChannel) {
  if (channel === 'copy') {
    void handleCopy()
  }
  else if (channel === 'webshare') {
    void handleWebShare()
  }
  else {
    void handleWxChannel(channel)
  }
}

// —— 小程序：自定义面板不渲染，打开即弹系统引导（复制链接为微信外传播兜底）——
function openMpGuide() {
  emit('update:show', false)
  if (!shareUrl.value) {
    uni.showModal({
      title: '分享活动',
      content: '请点击右上角胶囊「•••」，选择转发给微信好友或分享到朋友圈',
      showCancel: false,
      confirmText: '我知道了',
    })
    return
  }
  uni.showModal({
    title: '分享活动',
    content: '点击右上角胶囊「•••」可转发给好友或分享到朋友圈；也可以复制 H5 链接分享。',
    confirmText: '复制链接',
    cancelText: '知道了',
    success: (res) => {
      if (res.confirm) {
        void handleCopy()
      }
    },
  })
}

watch(
  () => props.show,
  (visible) => {
    if (visible && isMp) {
      openMpGuide()
    }
    if (!visible) {
      guideVisible.value = false
    }
  },
)
</script>

<template>
  <wd-popup
    v-if="!isMp"
    v-model="innerShow"
    position="bottom"
    :z-index="500"
    :safe-area-inset-bottom="true"
  >
    <view class="bg-card px-4 pb-2 pt-4">
      <text class="block text-center text-3.5 text-muted">
        分享到
      </text>

      <view class="mt-5 flex justify-around">
        <view
          v-for="item in options"
          :key="item.channel"
          class="w-25% flex flex-col items-center"
          @click="onSelect(item.channel)"
        >
          <view
            class="h-48px w-48px flex items-center justify-center rounded-full bg-primary-soft"
          >
            <view class="text-primary-soft-text text-24px" :class="[item.icon]" />
          </view>
          <text class="mt-2 text-3.5 text-sub">
            {{ item.title }}
          </text>
        </view>
      </view>

      <text v-if="platform === 'pc-h5'" class="mt-4 block px-2 text-center text-3 text-muted leading-5">
        {{ pcHint }}
      </text>

      <view
        class="mt-4 border-t border-line py-3 text-center text-4 text-sub"
        @click="innerShow = false"
      >
        取消
      </view>
    </view>
  </wd-popup>

  <!-- 微信浏览器右上角引导遮罩（点任意处关闭） -->
  <view
    v-if="guideVisible"
    class="fixed inset-0 z-[600] bg-black/70"
    @click="closeGuide"
  >
    <view class="absolute right-16px top-12px flex flex-col items-center">
      <view class="share-guide-arrow i-carbon-arrow-up-right text-36px text-white" />
      <text class="mt-1 text-4 text-white tracking-2">•••</text>
    </view>
    <view class="absolute bottom-16% left-0 right-0 px-10">
      <text class="block text-center text-4.5 text-white leading-8">
        点击右上角「•••」{{ guideText }}
      </text>
    </view>
  </view>
</template>

<style scoped>
.share-guide-arrow {
  animation: share-guide-bounce 1.2s ease-in-out infinite;
}

@keyframes share-guide-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}
</style>
