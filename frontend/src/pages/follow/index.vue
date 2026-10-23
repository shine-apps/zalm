<script lang="ts" setup>
import type { FollowedActivityCard, FollowedUserCard } from '@/api/follow'
import {
  getFollowedActivities,
  getFollowedUsers,
  unfollowActivity,
  unfollowUser,
} from '@/api/follow'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { formatDateTime } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'
import { usePagedList } from '@/utils/use-paged-list'

definePage({
  style: {
    navigationBarTitleText: '我的关注',
  },
})

type FollowTab = 'activity' | 'user'

const TABS: { value: FollowTab, label: string }[] = [
  { value: 'activity', label: '活动' },
  { value: 'user', label: '用户' },
]
const PAGE_SIZE = 10

const auth = useAuthStore()
const activeTab = ref<FollowTab>('activity')
const removingId = ref('')

const {
  items: activityItems,
  loading: activityLoading,
  finished: activityFinished,
  empty: activityEmpty,
  reload: reloadActivities,
  loadMore: loadMoreActivities,
} = usePagedList<FollowedActivityCard>(
  async (page) => {
    const res = await getFollowedActivities(page, PAGE_SIZE)
    return { data: res.data, total: res.pagination.total }
  },
  PAGE_SIZE,
)

const {
  items: userItems,
  loading: userLoading,
  finished: userFinished,
  empty: userEmpty,
  reload: reloadUsers,
  loadMore: loadMoreUsers,
} = usePagedList<FollowedUserCard>(
  async (page) => {
    const res = await getFollowedUsers(page, PAGE_SIZE)
    return { data: res.data, total: res.pagination.total }
  },
  PAGE_SIZE,
)

onShow(() => {
  if (!auth.isLoggedIn) {
    toLoginPage()
    return
  }
  void reloadActivities()
  void reloadUsers()
})

onReachBottom(() => {
  if (activeTab.value === 'activity')
    void loadMoreActivities()
  else
    void loadMoreUsers()
})

function switchTab(value: FollowTab) {
  activeTab.value = value
}

function openActivity(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

function openUser(id: string) {
  uni.navigateTo({ url: `/pages/user-home/index?userId=${id}` })
}

async function removeActivity(id: string) {
  if (removingId.value)
    return
  removingId.value = id
  try {
    await unfollowActivity(id)
    uni.showToast({ title: '已取消关注', icon: 'none' })
    await reloadActivities()
  }
  catch {
    // 错误提示已由请求拦截器统一 toast
  }
  finally {
    removingId.value = ''
  }
}

async function removeUser(id: string) {
  if (removingId.value)
    return
  removingId.value = id
  try {
    await unfollowUser(id)
    uni.showToast({ title: '已取消关注', icon: 'none' })
    await reloadUsers()
  }
  catch {
    // 错误提示已由请求拦截器统一 toast
  }
  finally {
    removingId.value = ''
  }
}
</script>

<template>
  <view class="min-h-screen bg-page px-3 pb-6 pt-3">
    <!-- 双 tab -->
    <view class="flex rounded-3 bg-card p-1 shadow-sm">
      <view
        v-for="t in TABS"
        :key="t.value"
        class="flex-1 rounded-2 py-2 text-center text-4"
        :class="activeTab === t.value ? 'bg-primary text-white font-medium' : 'text-sub'"
        @click="switchTab(t.value)"
      >
        {{ t.label }}
      </view>
    </view>

    <!-- 活动 tab -->
    <view v-if="activeTab === 'activity'" class="pt-3">
      <view
        v-for="a in activityItems"
        :key="a.activityId"
        class="mb-3 overflow-hidden rounded-3 bg-card shadow-sm"
        @click="openActivity(a.activityId)"
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
                v-if="a.status === 'cancelled'"
                class="ml-2 shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-3 text-danger"
              >
                已取消
              </text>
            </view>
            <view class="mt-2 flex items-center text-3 text-sub">
              <view class="i-carbon-time mr-1 text-16px text-muted" />
              <text class="ml-1">{{ formatDateTime(a.startTime) }}</text>
            </view>
            <view class="mt-1 flex items-center text-3 text-sub">
              <view class="i-carbon-location mr-1 text-16px text-muted" />
              <text class="ml-1 max-w-300px truncate">{{ a.location.name }}</text>
            </view>
          </view>
          <view
            class="mr-3 mt-3 h-30px w-30px flex shrink-0 items-center justify-center rounded-full bg-hover"
            @click.stop="removeActivity(a.activityId)"
          >
            <view class="i-carbon-star-filled text-4 text-primary" />
          </view>
        </view>
      </view>

      <view
        v-if="activityLoading && !activityItems.length"
        class="py-10 text-center text-3.5 text-muted"
      >
        加载中…
      </view>
      <view v-else-if="activityEmpty" class="flex flex-col items-center py-20">
        <view class="i-carbon-calendar text-48px text-muted" />
        <text class="mt-3 text-3.5 text-muted">暂无关注的活动</text>
      </view>
      <view v-else-if="activityFinished" class="py-6 text-center text-3 text-muted">
        没有更多了
      </view>
    </view>

    <!-- 用户 tab -->
    <view v-else class="pt-3">
      <view
        v-for="u in userItems"
        :key="u.userId"
        class="mb-3 flex items-center rounded-3 bg-card px-4 py-3 shadow-sm"
        @click="openUser(u.userId)"
      >
        <image
          :src="resolveMediaUrl(u.image) || '/static/images/default-avatar.png'"
          class="h-12 w-12 rounded-full bg-hover"
        />
        <text class="ml-3 flex-1 truncate text-4 text-ink">{{ u.name || '-' }}</text>
        <view
          class="h-30px w-30px flex shrink-0 items-center justify-center rounded-full bg-hover"
          @click.stop="removeUser(u.userId)"
        >
          <view class="i-carbon-star-filled text-4 text-primary" />
        </view>
      </view>

      <view
        v-if="userLoading && !userItems.length"
        class="py-10 text-center text-3.5 text-muted"
      >
        加载中…
      </view>
      <view v-else-if="userEmpty" class="flex flex-col items-center py-20">
        <view class="i-carbon-user-avatar text-48px text-muted" />
        <text class="mt-3 text-3.5 text-muted">暂无关注的用户</text>
      </view>
      <view v-else-if="userFinished" class="py-6 text-center text-3 text-muted">
        没有更多了
      </view>
    </view>
  </view>
</template>
