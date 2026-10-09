<script lang="ts" setup>
import { getCheckInCode } from '@/api/activity'
import { useAuthStore } from '@/store/auth'
import { buildCheckinUrl, getH5BaseUrl } from '@/utils/checkin-link'
import { secondsUntilNextMinute } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '现场签到码',
  },
})

const auth = useAuthStore()
const activityId = ref('')
const code = ref('')
const expiresAt = ref(0)
const remainSeconds = ref(60)
const refreshing = ref(false)
const refreshFailed = ref(false)
const qrText = ref('')

let tickTimer: ReturnType<typeof setInterval> | null = null
/** 下次允许发起取码请求的时刻：成功后对齐码过期点，失败后推到退避时间。 */
let nextRefreshAt = 0
/** 失败退避间隔（毫秒），成功后复位。 */
let retryDelayMs = 3000

async function refresh(): Promise<void> {
  // 到期触发与首屏可能重叠，进行中的请求直接跳过，避免并发打码
  if (refreshing.value)
    return
  refreshing.value = true
  try {
    const res = await getCheckInCode(activityId.value)
    code.value = res.code
    expiresAt.value = new Date(res.expiresAt).getTime()
    refreshFailed.value = false
    retryDelayMs = 3000
    nextRefreshAt = expiresAt.value
    const base = getH5BaseUrl()
    qrText.value = base ? buildCheckinUrl(base, activityId.value, res.code) : ''
    remainSeconds.value = Math.max(1, Math.ceil((expiresAt.value - Date.now()) / 1000))
  }
  catch {
    // 旧码仍在服务端上一窗口容忍期内，保留旧码不黑屏；
    // 取码是 10 次/分钟的敏感端点，失败按 3s→6s→12s→24s→30s 退避，
    // 由 tick 到 nextRefreshAt 再触发，避免每秒重试打满限流导致码长时间停更。
    refreshFailed.value = true
    retryDelayMs = Math.min(retryDelayMs * 2, 30_000)
    nextRefreshAt = Date.now() + retryDelayMs
    remainSeconds.value = Math.ceil(retryDelayMs / 1000)
  }
  finally {
    refreshing.value = false
  }
}

function tick() {
  if (!expiresAt.value) {
    remainSeconds.value = secondsUntilNextMinute()
    return
  }
  remainSeconds.value = Math.max(0, Math.ceil((expiresAt.value - Date.now()) / 1000))
  // 成功态到码过期点刷新；失败态等退避时间到再重试，两者取较晚者
  const nextAt = Math.max(expiresAt.value, nextRefreshAt)
  if (Date.now() >= nextAt)
    void refresh()
}

onLoad((options) => {
  activityId.value = options?.id ?? ''
})

onShow(() => {
  if (!auth.canManageActivity) {
    uni.showToast({ title: '仅活动组织者可出示签到码', icon: 'none' })
    toLoginPage({ mode: 'reLaunch', redirect: null })
    return
  }
  void refresh()
  tickTimer = setInterval(tick, 1000)
})

onHide(() => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
})

onUnload(() => {
  if (tickTimer)
    clearInterval(tickTimer)
})
</script>

<template>
  <view class="min-h-screen bg-page px-4 pt-4">
    <view class="flex flex-col items-center rounded-3 bg-card p-5 shadow-sm">
      <text class="text-4 text-sub">参与者微信扫一扫，或在签到页输入数字码</text>

      <!-- 二维码：wd-qr-code watch(text) 自动重绘，换窗口无需手动刷新 canvas -->
      <view class="mt-5 h-260px w-260px center rounded-3 bg-white p-3">
        <wd-qr-code v-if="qrText" :text="qrText" :size="236" :margin="8" />
        <view v-else class="i-carbon-qr-code text-120px text-muted" />
      </view>

      <!-- 6 位数字码 -->
      <view class="mt-5 flex items-center justify-center">
        <text
          v-for="(ch, i) in code.padEnd(6, ' ')"
          :key="i"
          class="mx-1 h-56px w-40px rounded-2 bg-hover text-center text-6 text-ink font-bold leading-56px"
          :class="ch === ' ' ? 'text-muted' : ''"
        >
          {{ ch.trim() === '' ? '–' : ch }}
        </text>
      </view>

      <!-- 倒计时 -->
      <view class="mt-4 flex items-center text-3.5">
        <view v-if="refreshFailed" class="text-danger">
          刷新失败，正在重试…
        </view>
        <template v-else>
          <view class="i-carbon-time mr-1 text-14px text-muted" />
          <text class="text-muted">{{ remainSeconds }} 秒后自动更新</text>
        </template>
      </view>
      <view class="mt-2 h-4px w-260px overflow-hidden rounded-full bg-hover">
        <view
          class="h-full bg-primary transition-all duration-1000 ease-linear"
          :style="{ width: `${(remainSeconds / 60) * 100}%` }"
        />
      </view>

      <text class="mt-5 text-3 text-muted">
        二维码每分钟滚动；签到仅在活动开始前 15 分钟至结束内有效
      </text>
      <text v-if="!qrText" class="mt-2 text-3 text-danger">
        未配置 VITE_H5_BASE_URL，当前仅能在小程序/App 内使用数字码
      </text>
    </view>
  </view>
</template>
