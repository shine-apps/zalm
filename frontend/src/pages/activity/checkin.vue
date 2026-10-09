<script lang="ts" setup>
import type { ActivityView } from '@/api/activity'
import { checkInActivity, getActivity } from '@/api/activity'
import { useAuthStore } from '@/store/auth'
import { formatDateTime, formatTimeRange } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '活动签到',
  },
})

const auth = useAuthStore()
const activityId = ref('')
const activity = ref<ActivityView | null>(null)
const code = ref('')
const submitting = ref(false)
const successAt = ref('')

function normalizeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6)
}

function onCodeInput(e: { detail: { value: string } }) {
  code.value = normalizeCode(e.detail.value)
}

async function loadActivity() {
  if (!activityId.value)
    return
  try {
    activity.value = await getActivity(activityId.value)
  }
  catch {
    activity.value = null
  }
}

async function submit() {
  if (!auth.isLoggedIn) {
    toLoginPage()
    return
  }
  if (code.value.length !== 6 || submitting.value)
    return
  submitting.value = true
  try {
    const reg = await checkInActivity(activityId.value, code.value)
    // 展示服务端签到时间，避免本地时钟偏差
    successAt.value = formatDateTime(new Date(reg.checkInAt ?? Date.now()))
    uni.showToast({ title: '签到成功', icon: 'success' })
  }
  catch {
    // 422/409 message 已由拦截器 toast，保留在当前页可改码重试
  }
  finally {
    submitting.value = false
  }
}

onLoad((options) => {
  activityId.value = options?.a ?? ''
  code.value = normalizeCode(options?.c ?? '')
  void loadActivity()
})

onShow(() => {
  // 登录回跳后继续可用
  if (!auth.isLoggedIn)
    toLoginPage({ mode: 'navigateTo' })
})
</script>

<template>
  <view class="min-h-screen bg-page px-4 pt-4">
    <!-- 链接无效 -->
    <view v-if="!activityId" class="pt-24 text-center">
      <view class="i-carbon-warning-alt text-48px text-muted" />
      <text class="mt-3 block text-4 text-muted">签到链接无效</text>
    </view>

    <template v-else>
      <!-- 活动摘要 -->
      <view v-if="activity" class="rounded-3 bg-card p-4 shadow-sm">
        <text class="text-5 text-ink font-semibold">{{ activity.title }}</text>
        <text class="mt-2 block text-3.5 text-sub">
          {{ formatTimeRange(activity.startTime, activity.endTime) }}
        </text>
        <text class="mt-1 block text-3.5 text-sub">{{ activity.location.name }}</text>
      </view>

      <!-- 成功态 -->
      <view v-if="successAt" class="mt-4 flex flex-col items-center rounded-3 bg-card p-6 shadow-sm">
        <view class="h-100px w-100px center rounded-full bg-primary-soft">
          <view class="text-primary-soft-text i-carbon-checkmark-outline text-56px" />
        </view>
        <text class="mt-4 text-5 text-ink font-semibold">签到成功</text>
        <text class="mt-2 text-3.5 text-muted">签到时间：{{ successAt }}</text>
      </view>

      <!-- 输入态 -->
      <view v-else class="mt-4 rounded-3 bg-card p-5 shadow-sm">
        <text class="text-4 text-ink font-medium">请输入 6 位签到码</text>
        <input
          :value="code"
          type="number"
          :maxlength="6"
          placeholder="6 位数字"
          class="mt-4 h-56px rounded-2 bg-hover text-center text-6 font-bold tracking-8px"
          @input="onCodeInput"
        >
        <text class="mt-3 block text-3 text-muted">
          签到码由现场组织者出示，每分钟自动更新
        </text>
        <button
          :disabled="code.length !== 6 || submitting"
          class="mt-5 h-46px w-full rounded-2 text-4 text-white"
          :class="code.length === 6 && !submitting ? 'bg-primary' : 'bg-hover text-muted'"
          @click="submit"
        >
          {{ submitting ? '签到中…' : '确认签到' }}
        </button>
        <view v-if="!auth.isLoggedIn" class="text-primary-soft-text mt-3 text-center text-3.5" @click="toLoginPage()">
          登录后完成签到
        </view>
      </view>
    </template>
  </view>
</template>
