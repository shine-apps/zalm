<script lang="ts" setup>
import type { NotificationType, NotificationView } from '@/api/notification'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/api/notification'
import { useAuthStore } from '@/store/auth'
import { useNotificationStore } from '@/store/notification'
import { formatRelativeTime } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '消息通知',
  },
})

const PAGE_SIZE = 20
const auth = useAuthStore()
const notifStore = useNotificationStore()

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
] as const
type TabKey = (typeof tabs)[number]['key']
const activeTab = ref<TabKey>('all')

const items = ref<NotificationView[]>([])
const page = ref(0)
const total = ref(0)
const loading = ref(false)
const markingAll = ref(false)
const finished = computed(() => items.value.length >= total.value && total.value > 0)
const canReadAll = computed(() => notifStore.hasUnread && !markingAll.value)

interface IconStyle {
  icon: string
  cls: string
}

/** 类型 -> 图标/配色（未知类型兜底通知铃）。 */
const ICON_MAP: Record<string, IconStyle> = {
  'activity.registered': { icon: 'i-carbon-event-schedule', cls: 'bg-primary-soft text-primary-soft-text' },
  'activity.checked_in': { icon: 'i-carbon-checkmark-outline', cls: 'bg-primary-soft text-primary-soft-text' },
  'activity.cancelled': { icon: 'i-carbon-close-outline', cls: 'bg-danger-soft text-danger' },
  'activity.updated': { icon: 'i-carbon-renew', cls: 'bg-hover text-sub' },
}
function iconOf(item: NotificationView): IconStyle {
  return ICON_MAP[item.type as NotificationType] ?? { icon: 'i-carbon-notification', cls: 'bg-hover text-sub' }
}

async function fetchPage(target: number) {
  const res = await listNotifications({
    page: target,
    pageSize: PAGE_SIZE,
    unread: activeTab.value === 'unread' ? true : undefined,
  })
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

function switchTab(key: TabKey) {
  if (activeTab.value === key)
    return
  activeTab.value = key
  void reload()
}

async function handleTap(item: NotificationView) {
  const wasUnread = !item.isRead
  if (wasUnread) {
    // 乐观标记已读（红点先减），失败回滚并以服务端未读数为准
    item.isRead = true
    item.readAt = new Date().toISOString()
    notifStore.decrement()
    try {
      await markNotificationRead(item.id)
      // 未读 tab 下列表项应即时消失
      if (activeTab.value === 'unread') {
        items.value = items.value.filter(i => i.id !== item.id)
        total.value = Math.max(0, total.value - 1)
      }
    }
    catch {
      item.isRead = false
      item.readAt = null
      void notifStore.fetchUnreadCount()
    }
  }
  if (item.targetType === 'activity' && item.targetId) {
    uni.navigateTo({ url: `/pages/activity/detail?id=${item.targetId}` })
  }
}

async function handleReadAll() {
  if (!canReadAll.value)
    return
  markingAll.value = true
  try {
    await markAllNotificationsRead()
    for (const item of items.value)
      item.isRead = true
    notifStore.clear()
    if (activeTab.value === 'unread') {
      items.value = []
      total.value = 0
    }
    uni.showToast({ title: '已全部标记为已读', icon: 'none' })
  }
  finally {
    markingAll.value = false
  }
}

onShow(() => {
  if (!auth.isLoggedIn) {
    toLoginPage({ mode: 'reLaunch' })
    return
  }
  void reload()
  void notifStore.fetchUnreadCount()
})

onReachBottom(() => {
  void loadMore()
})
</script>

<template>
  <view class="min-h-screen bg-page px-3 pt-3" style="padding-bottom: 24px">
    <!-- 顶部分段 tab + 全部已读 -->
    <view class="flex items-center justify-between">
      <view class="flex rounded-full bg-card p-1 shadow-sm">
        <view
          v-for="tab in tabs"
          :key="tab.key"
          class="rounded-full px-5 py-1 text-3.5 transition-colors"
          :class="activeTab === tab.key ? 'bg-primary text-white' : 'text-muted'"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </view>
      </view>
      <text
        class="pr-1 text-3.5"
        :class="canReadAll ? 'text-primary-soft-text' : 'text-muted'"
        @click="handleReadAll"
      >
        全部已读
      </text>
    </view>

    <!-- 通知卡片 -->
    <view
      v-for="item in items"
      :key="item.id"
      class="mt-3 flex items-start rounded-3 bg-card p-4 shadow-sm"
      hover-class="bg-hover"
      @click="handleTap(item)"
    >
      <view class="mt-0.5 h-9 w-9 center shrink-0 rounded-full" :class="iconOf(item).cls">
        <view class="text-4.5" :class="iconOf(item).icon" />
      </view>
      <view class="ml-3 min-w-0 flex-1">
        <view class="flex items-center">
          <text class="text-4" :class="item.isRead ? 'text-muted' : 'text-ink font-medium'">
            {{ item.title }}
          </text>
          <view v-if="!item.isRead" class="ml-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
          <text class="ml-auto shrink-0 pl-2 text-3 text-muted">
            {{ formatRelativeTime(item.createdAt) }}
          </text>
        </view>
        <text
          class="mt-1 block text-3.5 leading-5"
          :class="item.isRead ? 'text-muted' : 'text-sub'"
        >
          {{ item.body }}
        </text>
      </view>
    </view>

    <view v-if="!loading && items.length === 0" class="flex flex-col items-center py-20">
      <view class="i-carbon-notification text-48px text-muted" />
      <text class="mt-3 text-3.5 text-muted">
        {{ activeTab === 'unread' ? '没有未读消息' : '暂无消息' }}
      </text>
    </view>
    <view v-else-if="loading" class="py-4 text-center text-3 text-muted">
      加载中…
    </view>
    <view v-else-if="finished" class="py-4 text-center text-3 text-muted">
      没有更多了
    </view>
  </view>
</template>
