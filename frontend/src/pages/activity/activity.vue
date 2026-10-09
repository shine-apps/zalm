<script lang="ts" setup>
import type { ActivityStateFilter, ActivityView } from '@/api/activity'
import { listActivities } from '@/api/activity'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { formatTimeRange } from '@/utils/datetime'
import { parseCheckinUrl } from '@/utils/checkin-link'
import { usePagedList } from '@/utils/use-paged-list'

definePage({
  style: {
    navigationBarTitleText: '活动',
  },
})

const TABS: { value: ActivityStateFilter, label: string }[] = [
  { value: 'active', label: '招募中' },
  { value: 'past', label: '已结束' },
  { value: 'cancelled', label: '已取消' },
]

const PAGE_SIZE = 10
const auth = useAuthStore()
const activeTab = ref<ActivityStateFilter>('active')
const keyword = ref('')

const { items, loading, finished, empty, reload, loadMore } = usePagedList<ActivityView>(
  async (page) => {
    const kw = keyword.value.trim()
    const res = await listActivities({
      state: activeTab.value,
      page,
      pageSize: PAGE_SIZE,
      ...(kw ? { keyword: kw } : {}),
    })
    return { data: res.data, total: res.pagination.total }
  },
  PAGE_SIZE,
)

const stateBadge: Record<string, { text: string, cls: string }> = {
  upcoming: { text: '未开始', cls: 'bg-hover text-sub' },
  ongoing: { text: '进行中', cls: 'bg-primary-soft text-primary-soft-text' },
  ended: { text: '已结束', cls: 'bg-hover text-muted' },
  cancelled: { text: '已取消', cls: 'bg-danger-soft text-danger' },
}

function capacityText(a: ActivityView): string {
  const cap = a.capacity === null ? '不限' : String(a.capacity)
  return `已报 ${a.registeredCount}/${cap}`
}

function switchTab(value: ActivityStateFilter) {
  if (activeTab.value === value)
    return
  activeTab.value = value
  void reload()
}

function onSearch() {
  void reload()
}

function clearKeyword() {
  if (!keyword.value)
    return
  keyword.value = ''
  void reload()
}

function openDetail(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

function publish() {
  uni.navigateTo({ url: '/pages/activity/edit' })
}

// #ifndef H5
function scanCheckIn() {
  uni.scanCode({
    success: (res) => {
      const parsed = parseCheckinUrl(res.result || '')
      if (!parsed) {
        uni.showToast({ title: '未识别到有效的签到码', icon: 'none' })
        return
      }
      uni.navigateTo({
        url: `/pages/activity/checkin?a=${parsed.activityId}&c=${parsed.code}`,
      })
    },
  })
}
// #endif

onShow(() => {
  // 从详情页报名/取消后返回、登录态变化后都刷新第一页
  void reload()
})

onReachBottom(() => {
  void loadMore()
})
</script>

<template>
  <view class="min-h-screen bg-page" style="padding-bottom: 96px">
    <!-- 顶部：标题 + 扫码（仅小程序/App）+ 发布（组织者） -->
    <view class="flex items-center px-3 pt-3">
      <text class="text-5 text-ink font-semibold">
        活动
      </text>
      <view class="ml-auto flex items-center">
        <!-- #ifndef H5 -->
        <view
          class="mr-2 h-32px w-32px center rounded-full bg-card shadow-sm"
          @click="scanCheckIn"
        >
          <view class="i-carbon-scan text-18px text-sub" />
        </view>
        <!-- #endif -->
        <view
          v-if="auth.canManageActivity"
          class="flex items-center rounded-full bg-primary px-3 py-1.5"
          @click="publish"
        >
          <view class="i-carbon-add mr-1 text-16px text-white" />
          <text class="text-3.5 text-white">
            发布活动
          </text>
        </view>
      </view>
    </view>

    <!-- 搜索 -->
    <view class="px-3 pt-3">
      <view class="h-36px flex items-center rounded-full bg-card px-3 shadow-sm">
        <view class="i-carbon-search mr-2 text-16px text-muted" />
        <input
          v-model="keyword"
          confirm-type="search"
          placeholder="搜索活动标题或地点"
          class="flex-1 text-3.5 text-ink"
          @confirm="onSearch"
        >
        <view
          v-if="keyword"
          class="i-carbon-close-filled ml-2 text-16px text-muted"
          @click="clearKeyword"
        />
      </view>
    </view>

    <!-- 分段 tabs -->
    <view class="flex px-3 pt-3">
      <view
        v-for="tab in TABS"
        :key="tab.value"
        class="mr-2 rounded-full px-4 py-1.5 text-3.5"
        :class="activeTab === tab.value ? 'bg-primary text-white' : 'bg-card text-sub'"
        @click="switchTab(tab.value)"
      >
        {{ tab.label }}
      </view>
    </view>

    <!-- 列表 -->
    <view class="px-3 pt-3">
      <view
        v-for="a in items"
        :key="a.id"
        class="mb-3 overflow-hidden rounded-3 bg-card shadow-sm"
        @click="openDetail(a.id)"
      >
        <view class="flex">
          <image
            v-if="a.coverUrl"
            :src="resolveMediaUrl(a.coverUrl)"
            mode="aspectFill"
            class="h-100px w-120px shrink-0 bg-hover"
          />
          <view class="flex-1 p-3">
            <view class="flex items-center">
              <text class="text-4 text-ink font-medium" style="max-width: 320rpx">
                {{ a.title }}
              </text>
              <text
                class="ml-2 shrink-0 rounded-full px-2 py-0.5 text-3"
                :class="stateBadge[a.state]?.cls"
              >
                {{ stateBadge[a.state]?.text }}
              </text>
            </view>
            <view class="i-carbon-time mt-2 flex items-center text-3 text-sub">
              <text class="ml-1">{{ formatTimeRange(a.startTime, a.endTime) }}</text>
            </view>
            <view class="i-carbon-location mt-1 flex items-center text-3 text-sub">
              <text class="ml-1 max-w-300px truncate">{{ a.location.name }}</text>
            </view>
            <view class="mt-2 flex items-center">
              <text class="text-3 text-muted">{{ capacityText(a) }}</text>
              <text
                v-if="a.state === 'upcoming' && a.remaining === 0"
                class="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-3 text-danger"
              >
                名额已满
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- 空态 / 底部状态 -->
      <view v-if="empty" class="flex flex-col items-center py-20">
        <view class="i-carbon-event-schedule text-48px text-muted" />
        <text class="mt-3 text-3.5 text-muted">
          暂无活动
        </text>
      </view>
      <view v-else-if="loading" class="py-4 text-center text-3 text-muted">
        加载中…
      </view>
      <view v-else-if="finished" class="py-4 text-center text-3 text-muted">
        没有更多了
      </view>
    </view>
  </view>
</template>
