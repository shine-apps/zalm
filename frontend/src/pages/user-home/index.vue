<script lang="ts" setup>
import type { MyRegistrationItem } from '@/api/activity'
import { listMyRegistrations } from '@/api/activity'
import { followUser, unfollowUser } from '@/api/follow'
import type { PointsOverview } from '@/api/points'
import { getMyPoints } from '@/api/points'
import type { PublicUserProfile } from '@/api/users'
import { getUserPoints, getUserProfile, getUserRegistrations } from '@/api/users'
import { resolveMediaUrl } from '@/api/profile'
import { useShare } from '@/share/useShare'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatTimeRange } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '个人主页',
  },
})

const auth = useAuthStore()

// ===== 路由参数与模式判定 =====
const routeUserId = ref<string | null>(null)

onLoad((options) => {
  const id = options?.userId ?? ''
  routeUserId.value = id || null
})

/**
 * 主页模式：
 * - self：未传 userId 或 userId === 当前登录用户
 * - other：userId 指向他人（含未登录时查看公开用户主页）
 */
const isOwnProfile = computed(() => {
  if (!routeUserId.value)
    return true // 未传参数默认自己
  return auth.isLoggedIn && routeUserId.value === auth.user?.id
})
/** 最终要展示的用户 id（self 时兜底当前登录用户 id）。 */
const targetUserId = computed(() => {
  if (isOwnProfile.value)
    return auth.user?.id ?? null
  return routeUserId.value
})

// ===== 用户资料（独立 ref，永远不要直接用 auth.user） =====
const profileUser = ref<PublicUserProfile | null>(null)
const profileLoading = ref(false)
const profileError = ref(false)
const following = ref(false)
const followActing = ref(false)

async function loadProfile() {
  if (!targetUserId.value) {
    profileUser.value = null
    return
  }
  profileLoading.value = true
  profileError.value = false
  try {
    if (isOwnProfile.value && auth.user) {
      // 自己模式：直接用 store 已有数据，省一次请求
      // 自己模式不展示关注按钮，isFollowed 恒为 false
      profileUser.value = {
        id: auth.user.id,
        name: auth.user.name,
        image: auth.user.image ?? null,
        createdAt: auth.user.createdAt,
        roles: auth.user.roles,
        isFollowed: false,
      }
    }
    else {
      profileUser.value = await getUserProfile(targetUserId.value)
    }
  }
  catch {
    profileUser.value = null
    profileError.value = true
  }
  finally {
    following.value = profileUser.value?.isFollowed ?? false
    profileLoading.value = false
  }
}

/** 关注/取关他人：乐观更新，失败回滚；游客先引导登录。 */
async function toggleFollow() {
  const id = targetUserId.value
  if (isOwnProfile.value || !id || followActing.value)
    return
  if (!auth.isLoggedIn) {
    toLoginPage()
    return
  }
  const next = !following.value
  following.value = next
  followActing.value = true
  try {
    const res = next
      ? await followUser(id)
      : await unfollowUser(id)
    following.value = res.followed
    uni.showToast({ title: res.followed ? '已关注' : '已取消关注', icon: 'none' })
  }
  catch {
    // 回滚（错误 toast 由拦截器负责）
    following.value = !next
  }
  finally {
    followActing.value = false
  }
}

// ===== 积分 =====
const pointsOverview = ref<PointsOverview | null>(null)
const pointsLoading = ref(false)

async function loadPoints() {
  if (!targetUserId.value)
    return
  pointsLoading.value = true
  try {
    if (isOwnProfile.value) {
      pointsOverview.value = await getMyPoints()
    }
    else {
      pointsOverview.value = await getUserPoints(targetUserId.value)
    }
  }
  catch {
    pointsOverview.value = null
  }
  finally {
    pointsLoading.value = false
  }
}

// ===== 活动列表（分页滚动加载） =====
const PAGE_SIZE = 10
const items = ref<MyRegistrationItem[]>([])
const page = ref(0)
const total = ref(0)
const listLoading = ref(false)
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
  if (!targetUserId.value)
    return
  const res = isOwnProfile.value
    ? await listMyRegistrations(target, PAGE_SIZE)
    : await getUserRegistrations(targetUserId.value, target, PAGE_SIZE)
  items.value = target === 1 ? res.data : items.value.concat(res.data)
  total.value = res.pagination.total
  page.value = target
}

async function reload() {
  if (!targetUserId.value)
    return
  listLoading.value = true
  items.value = []
  total.value = 0
  page.value = 0
  try {
    await fetchPage(1)
  }
  finally {
    listLoading.value = false
  }
}

async function loadMore() {
  if (listLoading.value || finished.value)
    return
  listLoading.value = true
  try {
    await fetchPage(page.value + 1)
  }
  finally {
    listLoading.value = false
  }
}

function openActivityDetail(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

// ===== 生命周期 =====
onShow(() => {
  void loadProfile()
  void loadPoints()
  void reload()
})

onReachBottom(() => {
  void loadMore()
})

// ===== 派生数据 =====
const avatarUrl = computed(() =>
  resolveMediaUrl(profileUser.value?.image) || '/static/images/default-avatar.png',
)
const registerDateText = computed(() => formatDate(profileUser.value?.createdAt))
const roleBadge = computed(() => {
  const roles = profileUser.value?.roles ?? []
  if (roles.includes('admin'))
    return { text: '管理员', cls: 'bg-primary-soft text-primary-soft-text' }
  if (roles.includes('activity_admin'))
    return { text: '组织者', cls: 'bg-primary-soft text-primary-soft-text' }
  return null
})

const totalPoints = computed(() => pointsOverview.value?.total ?? 0)
const activityPoints = computed(() => pointsOverview.value?.activityPoints ?? 0)
const donationPoints = computed(() => pointsOverview.value?.donationPoints ?? 0)

const headerTitle = computed(() => (isOwnProfile.value ? '我的主页' : '个人主页'))

// ===== 分享 =====
const {
  show: shareShow,
  payload: sharePayload,
  panelId: sharePanelId,
  openShare,
} = useShare(() => ({
  title: `${profileUser.value?.name ?? '爱心伙伴'}的志愿者主页 · 众爱联盟`,
  desc: isOwnProfile.value
    ? `我已参与 ${total.value} 场公益活动，累计 ${totalPoints.value} 积分，一起来做好事吧`
    : `TA已参与 ${total.value} 场公益活动，累计 ${totalPoints.value} 积分，来看看吧`,
  page: '/pages/user-home/index',
  query: targetUserId.value ? { userId: targetUserId.value } : {},
  imageUrl: profileUser.value?.image ?? undefined,
  targetType: 'user',
  targetId: targetUserId.value ?? undefined,
}))
</script>

<template>
  <view class="min-h-screen bg-page px-3 pb-6 pt-3">
    <!-- ========== 用户不存在 / 加载失败 ========== -->
    <view v-if="profileError" class="flex flex-col items-center py-20">
      <view class="i-carbon-user-avatar text-48px text-muted" />
      <text class="mt-3 text-3.5 text-muted">用户不存在或已被封禁</text>
    </view>

    <!-- ========== 主内容 ========== -->
    <template v-else>
      <!-- 模块一：用户基本信息 -->
      <view class="rounded-3 bg-card p-4 shadow-sm">
        <view class="flex items-start justify-between">
          <view class="flex items-center">
            <image :src="avatarUrl" class="h-16 w-16 rounded-full bg-hover" />
            <view class="ml-4 flex-1">
              <view v-if="profileLoading" class="h-6 w-28 animate-pulse rounded bg-hover" />
              <view v-else class="flex items-center">
                <text class="max-w-24 truncate text-5 text-ink font-semibold">
                  {{ profileUser?.name || '-' }}
                </text>
                <text
                  v-if="roleBadge"
                  class="ml-2 rounded px-2 py-0.5 text-3"
                  :class="roleBadge.cls"
                >
                  {{ roleBadge.text }}
                </text>
              </view>
            </view>
          </view>
          <view class="flex shrink-0 items-center">
            <view
              v-if="!isOwnProfile"
              class="mr-2 h-8 flex items-center rounded-full px-3 text-3.5"
              :class="following ? 'bg-hover text-sub' : 'bg-primary text-white'"
              @click="toggleFollow"
            >
              {{ following ? '已关注' : '关注' }}
            </view>
            <view
              class="h-8 w-8 flex items-center justify-center rounded-full bg-hover text-muted"
              @click="openShare"
            >
              <view class="i-carbon-share text-4" />
            </view>
          </view>
        </view>

        <view class="mt-4 rounded-2 bg-page p-3">
          <text class="text-3 text-muted">注册时间</text>
          <view class="mt-1 text-3.5 text-ink font-medium">
            {{ registerDateText || '-' }}
          </view>
        </view>
      </view>

      <!-- 模块二：积分数据 -->
      <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
        <view class="flex items-center justify-between">
          <text class="text-4 text-ink font-medium">{{ isOwnProfile ? '我的积分' : '积分' }}</text>
        </view>

        <view class="mt-3 flex items-baseline">
          <text v-if="pointsLoading" class="text-primary-soft-text text-6 font-bold">—</text>
          <text v-else class="text-primary-soft-text text-7 font-bold">{{ totalPoints }}</text>
          <text class="ml-2 text-3.5 text-muted">可用积分</text>
        </view>

        <view class="mt-3 flex gap-6 text-3.5">
          <view>
            <text class="text-muted">活动积分 </text>
            <text class="text-ink font-medium">{{ activityPoints }}</text>
          </view>
          <view>
            <text class="text-muted">捐献积分 </text>
            <text class="text-ink font-medium">{{ donationPoints }}</text>
          </view>
        </view>

        <view v-if="isOwnProfile" class="mt-3 rounded-2 bg-page p-3">
          <text class="text-3 text-muted leading-relaxed">
            积分可通过参与活动签到、物资/现金捐献获得。
          </text>
        </view>
      </view>

      <!-- 模块三：活动参与记录 -->
      <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
        <view class="flex items-center justify-between">
          <text class="text-4 text-ink font-medium">{{ isOwnProfile ? '我的活动' : '参与活动' }}</text>
          <text class="text-3 text-muted">共 {{ total }} 场</text>
        </view>

        <view class="mt-3">
          <view
            v-for="(item, idx) in items"
            :key="item.registration.id"
            class="rounded-2 bg-page p-3"
            :class="{ 'mb-3': idx < items.length - 1 }"
            hover-class="bg-hover"
            @click="openActivityDetail(item.activity.id)"
          >
            <view class="flex items-start justify-between">
              <text class="line-clamp-2 flex-1 text-4 text-ink font-medium">
                {{ item.activity.title }}
              </text>
              <text
                class="ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-3"
                :class="statusCls[item.registration.status]"
              >
                {{ statusText[item.registration.status] }}
              </text>
            </view>

            <text class="mt-2 block text-3.5 text-sub">
              {{ formatTimeRange(item.activity.startTime, item.activity.endTime) }}
            </text>

            <view v-if="item.activity.state === 'cancelled'" class="mt-1">
              <text class="text-3 text-danger">活动已取消</text>
            </view>
          </view>

          <!-- 空状态 -->
          <view v-if="!listLoading && items.length === 0" class="flex flex-col items-center py-10">
            <view class="i-carbon-calendar text-48px text-muted" />
            <text class="mt-3 text-3.5 text-muted">
              {{ isOwnProfile ? '还没有参与活动' : '该用户还没有参与活动' }}
            </text>
          </view>

          <!-- 加载中 -->
          <view v-else-if="listLoading && items.length === 0" class="py-4 text-center text-3 text-muted">
            加载中…
          </view>

          <!-- 分页提示 -->
          <view v-else-if="items.length > 0" class="py-3 text-center text-3 text-muted">
            <text v-if="listLoading">加载中…</text>
            <text v-else-if="finished">没有更多了</text>
          </view>
        </view>
      </view>
    </template>

    <!-- 分享面板（H5 宫格/微信引导遮罩；小程序内转为系统引导弹窗） -->
    <share-sheet
      v-model:show="shareShow"
      :payload="sharePayload"
      :panel-id="sharePanelId"
    />
  </view>
</template>
