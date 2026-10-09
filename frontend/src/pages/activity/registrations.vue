<script lang="ts" setup>
import type { ActivityView, RegistrationWithUser } from '@/api/activity'
import { getActivity, listRegistrations, manualCheckIn } from '@/api/activity'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { formatDateTime } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '报名名单',
  },
})

const PAGE_SIZE = 20
const auth = useAuthStore()
const activityId = ref('')
const activity = ref<ActivityView | null>(null)
const rows = ref<RegistrationWithUser[]>([])
const page = ref(0)
const total = ref(0)
const loading = ref(false)
const finished = computed(() => rows.value.length >= total.value && total.value > 0)

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
  const res = await listRegistrations(activityId.value, target, PAGE_SIZE)
  if (target === 1)
    rows.value = res.data
  else
    rows.value = rows.value.concat(res.data)
  total.value = res.pagination.total
  page.value = target
}

async function reload() {
  if (!activityId.value)
    return
  loading.value = true
  try {
    const [a] = await Promise.all([
      getActivity(activityId.value),
      fetchPage(1),
    ])
    activity.value = a
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

function doManualCheckIn(row: RegistrationWithUser) {
  uni.showModal({
    title: '手动补签',
    content: `确认为 ${row.userName || '该用户'} 补签吗？`,
    confirmText: '确认补签',
    success: (res) => {
      if (!res.confirm)
        return
      void submitManual(row.userId)
    },
  })
}

async function submitManual(userId: string) {
  try {
    await manualCheckIn(activityId.value, userId)
    uni.showToast({ title: '补签成功', icon: 'success' })
    await fetchPage(1)
  }
  catch {
    // 拦截器已提示
  }
}

onLoad((options) => {
  activityId.value = options?.id ?? ''
})

onShow(() => {
  if (!auth.canManageActivity) {
    uni.showToast({ title: '仅活动组织者可查看名单', icon: 'none' })
    toLoginPage({ mode: 'reLaunch', redirect: null })
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
    <!-- 统计头 -->
    <view v-if="activity" class="flex rounded-3 bg-card p-4 shadow-sm">
      <view class="flex-1 text-center">
        <text class="block text-5 text-ink font-semibold">{{ activity.registeredCount }}</text>
        <text class="mt-1 block text-3 text-muted">有效报名</text>
      </view>
      <view class="flex-1 text-center">
        <text class="block text-5 text-ink font-semibold">{{ activity.checkedInCount }}</text>
        <text class="mt-1 block text-3 text-muted">已签到</text>
      </view>
      <view class="flex-1 text-center">
        <text class="block text-5 text-ink font-semibold">
          {{ activity.capacity === null ? '不限' : activity.capacity }}
        </text>
        <text class="mt-1 block text-3 text-muted">人数上限</text>
      </view>
      <view class="flex-1 text-center">
        <text class="block text-5 text-ink font-semibold">
          {{ activity.remaining === null ? '—' : activity.remaining }}
        </text>
        <text class="mt-1 block text-3 text-muted">剩余名额</text>
      </view>
    </view>

    <!-- 名单 -->
    <view class="mt-3 overflow-hidden rounded-3 bg-card shadow-sm">
      <view
        v-for="(row, idx) in rows"
        :key="row.id"
        class="flex items-center px-4 py-3"
        :class="idx > 0 ? 'border-t border-line' : ''"
      >
        <image
          :src="resolveMediaUrl(row.userImage) || '/static/images/default-avatar.png'"
          class="h-38px w-38px rounded-full bg-hover"
        />
        <view class="ml-3 flex-1">
          <view class="flex items-center">
            <text class="text-4 text-ink">{{ row.userName || '未命名用户' }}</text>
            <text class="ml-2 rounded-full px-2 py-0.5 text-3" :class="statusCls[row.status]">
              {{ statusText[row.status] }}
            </text>
          </view>
          <text class="mt-0.5 block text-3 text-muted">
            {{ row.userPhone || '未绑定手机号' }}
          </text>
          <text v-if="row.checkInAt" class="mt-0.5 block text-3 text-muted">
            签到：{{ formatDateTime(row.checkInAt) }}{{ row.checkInMethod === 'manual' ? '（补签）' : '' }}
          </text>
        </view>
        <view
          v-if="row.status === 'registered'"
          class="text-primary-soft-text ml-2 shrink-0 rounded-full bg-primary-soft px-3 py-1.5 text-3.5"
          @click="doManualCheckIn(row)"
        >
          补签
        </view>
      </view>

      <view v-if="!loading && rows.length === 0" class="py-16 text-center text-4 text-muted">
        暂无报名记录
      </view>
      <view v-else-if="loading" class="py-4 text-center text-3 text-muted">
        加载中…
      </view>
      <view v-else-if="finished" class="py-4 text-center text-3 text-muted">
        共 {{ total }} 条，没有更多了
      </view>
    </view>
  </view>
</template>
