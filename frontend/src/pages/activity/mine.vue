<script lang="ts" setup>
import type { MyRegistrationItem } from '@/api/activity'
import { listMyRegistrations } from '@/api/activity'
import { useAuthStore } from '@/store/auth'
import { formatTimeRange } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '我的活动报名',
  },
})

const PAGE_SIZE = 10
const auth = useAuthStore()
const items = ref<MyRegistrationItem[]>([])
const page = ref(0)
const total = ref(0)
const loading = ref(false)
const finished = computed(() => items.value.length >= total.value && total.value > 0)

const statusText: Record<string, string> = {
  registered: '已报名',
  checked_in: '已签到',
  cancelled: '已取消',
}
const statusCls: Record<string, string> = {
  registered: 'bg-primary-soft text-primary-soft-text',
  checked_in: 'bg-hover text-sub',
  cancelled: 'bg-danger-soft text-danger',
}

async function fetchPage(target: number) {
  const res = await listMyRegistrations(target, PAGE_SIZE)
  items.value = target === 1 ? res.data : items.value.concat(res.data)
  total.value = res.pagination.total
  page.value = target
}

async function reload() {
  loading.value = true
  try {
    await fetchPage(1)
  }
  finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loading.value || finished.value)
    return
  loading.value = true
  try {
    await fetchPage(page.value + 1)
  }
  finally {
    loading.value = false
  }
}

function openDetail(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

onShow(() => {
  if (!auth.isLoggedIn) {
    toLoginPage({ mode: 'reLaunch' })
    return
  }
  void reload()
})

onReachBottom(() => {
  void loadMore()
})
</script>

<template>
  <view class="min-h-screen bg-page px-3 pt-3" style="padding-bottom: 24px">
    <view
      v-for="item in items"
      :key="item.registration.id"
      class="mb-3 rounded-3 bg-card p-4 shadow-sm"
      @click="openDetail(item.activity.id)"
    >
      <view class="flex items-center">
        <text class="text-4 text-ink font-medium">{{ item.activity.title }}</text>
        <text class="ml-2 rounded-full px-2 py-0.5 text-3" :class="statusCls[item.registration.status]">
          {{ statusText[item.registration.status] }}
        </text>
        <view v-if="item.activity.state === 'cancelled'" class="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-3 text-danger">
          活动已取消
        </view>
      </view>
      <text class="mt-2 block text-3.5 text-sub">
        {{ formatTimeRange(item.activity.startTime, item.activity.endTime) }}
      </text>
      <text class="mt-1 block text-3 text-muted">
        {{ item.activity.location.name }}
      </text>
    </view>

    <view v-if="!loading && items.length === 0" class="flex flex-col items-center py-20">
      <view class="i-carbon-calendar text-48px text-muted" />
      <text class="mt-3 text-3.5 text-muted">还没有报名记录</text>
    </view>
    <view v-else-if="loading" class="py-4 text-center text-3 text-muted">
      加载中…
    </view>
    <view v-else-if="finished" class="py-4 text-center text-3 text-muted">
      没有更多了
    </view>
  </view>
</template>
