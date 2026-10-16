<script lang="ts" setup>
import { getMyPoints } from '@/api/points'
import type { PointsOverview } from '@/api/points'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { useNotificationStore } from '@/store/notification'
import {
  THEME_BRAND_OPTIONS,
  THEME_MODE_OPTIONS,
  useThemeStore,
} from '@/store/theme'
import { maskPhoneNumber } from '@/utils/phone'
import { toLoginPage } from '@/utils/toLoginPage'

// 菜单图标经数据动态绑定，需在此注释占位，确保 UnoCSS 扫描生成对应样式：
// i-carbon-calendar i-carbon-star i-carbon-notification i-carbon-trophy i-carbon-receipt
// i-carbon-security i-carbon-locked i-carbon-chat i-carbon-information
// i-carbon-contrast i-carbon-color-palette

definePage({
  style: {
    navigationBarTitleText: '我的',
  },
})

interface MeMenuItem {
  key: string
  label: string
  icon: string
  /** 已上线页面地址；缺省表示功能开发中，点击仅提示 */
  url?: string
  /** tabbar 页必须用 switchTab 跳转 */
  tabbar?: boolean
  /** 未读红点（消息通知按真实未读数开启） */
  dot?: boolean
  /** 自定义点击行为（如主题切换弹层），优先于 url 跳转与登录校验 */
  action?: () => void
}

const auth = useAuthStore()
const notifStore = useNotificationStore()
const themeStore = useThemeStore()
const loggingOut = ref(false)

const pointsOverview = ref<PointsOverview | null>(null)

async function loadPoints() {
  if (!auth.isLoggedIn)
    return
  try {
    pointsOverview.value = await getMyPoints()
  }
  catch {
    pointsOverview.value = null
  }
}

onShow(() => {
  void loadPoints()
  // 从消息中心返回等场景刷新红点（页面级 onShow，App 切前台另有 App.vue 刷新）
  if (auth.isLoggedIn)
    void notifStore.fetchUnreadCount()
})

function goPointsLedger() {
  uni.navigateTo({ url: '/pages/points/ledger' })
}

// —— 主题切换：外观模式（浅色/深色/跟随系统）与品牌主题色 ——
const modeLabel = computed(
  () => THEME_MODE_OPTIONS.find(item => item.value === themeStore.mode)?.label ?? '',
)
const brandLabel = computed(
  () => THEME_BRAND_OPTIONS.find(item => item.value === themeStore.brand)?.label ?? '',
)

function pickThemeMode() {
  uni.showActionSheet({
    itemList: THEME_MODE_OPTIONS.map(item => item.label),
    success: (res) => {
      const option = THEME_MODE_OPTIONS[res.tapIndex]
      if (option)
        themeStore.setMode(option.value)
    },
  })
}

function pickThemeBrand() {
  uni.showActionSheet({
    itemList: THEME_BRAND_OPTIONS.map(item => item.label),
    success: (res) => {
      const option = THEME_BRAND_OPTIONS[res.tapIndex]
      if (option)
        themeStore.setBrand(option.value)
    },
  })
}

// 菜单分组（仅「关于众爱联盟」已落地，其余为标准模板预留入口）
const menuGroups = computed<MeMenuItem[][]>(() => [
  [
    { key: 'activities', label: '活动报名', icon: 'i-carbon-calendar', url: '/pages/activity/mine' },
    { key: 'points-rank', label: '积分排行', icon: 'i-carbon-trophy', url: '/pages/points/index' },
    { key: 'points-ledger', label: '我的积分明细', icon: 'i-carbon-receipt', url: '/pages/points/ledger' },
    { key: 'favorites', label: '我的收藏', icon: 'i-carbon-star' },
    { key: 'notifications', label: '消息通知', icon: 'i-carbon-notification', url: '/pages/notification/index', dot: notifStore.hasUnread },
  ],
  [
    { key: 'security', label: '账号与安全', icon: 'i-carbon-security' },
    { key: 'privacy', label: '隐私设置', icon: 'i-carbon-locked' },
  ],
  [
    { key: 'feedback', label: '意见反馈', icon: 'i-carbon-chat' },
    { key: 'about', label: '关于众爱联盟', icon: 'i-carbon-information', url: '/pages/about/about' },
  ],
  [
    { key: 'theme-mode', label: `外观模式（${modeLabel.value}）`, icon: 'i-carbon-contrast', action: pickThemeMode },
    { key: 'theme-brand', label: `主题色（${brandLabel.value}）`, icon: 'i-carbon-color-palette', action: pickThemeBrand },
  ],
])

// 副标题优先展示脱敏手机号，其次邮箱
const subtitle = computed(() =>
  maskPhoneNumber(auth.user?.phoneNumber) || auth.user?.email || '',
)
const avatarUrl = computed(() =>
  resolveMediaUrl(auth.user?.image) || '/static/images/default-avatar.png',
)

// 本页允许游客浏览，不做登录守卫；仅在点击需要登录的入口时引导

function handleMenuTap(item: MeMenuItem) {
  // 主题切换等自定义行为：游客也可使用，无需登录
  if (item.action) {
    item.action()
    return
  }
  if (!auth.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (!item.url) {
    uni.showToast({ title: '功能开发中', icon: 'none' })
    return
  }
  if (item.tabbar)
    uni.switchTab({ url: item.url })
  else
    uni.navigateTo({ url: item.url })
}

// 资料卡：已登录进入个人信息编辑页，游客点击主动去登录
function handleCardTap() {
  if (!auth.isLoggedIn) {
    toLoginPage()
    return
  }
  uni.navigateTo({ url: '/pages/me/profile' })
}

async function handleLogout() {
  if (loggingOut.value)
    return
  loggingOut.value = true
  await auth.logout()
  loggingOut.value = false
  uni.reLaunch({ url: '/pages/login/index' })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-page px-3 pt-3">
    <!-- 资料卡：已登录进入个人信息编辑页，游客点击主动去登录 -->
    <view class="flex items-center rounded-3 bg-card p-4 shadow-sm" hover-class="bg-hover" @click="handleCardTap">
      <image :src="avatarUrl" class="h-14 w-14 rounded-full bg-hover" />
      <view class="ml-4">
        <template v-if="auth.user">
          <view class="flex items-center">
            <text class="text-5 text-ink font-semibold">
              {{ auth.user.name }}
            </text>
            <text v-if="auth.isAdmin" class="text-primary-soft-text ml-2 rounded bg-primary-soft px-2 py-0.5 text-3">
              管理员
            </text>
          </view>
          <view v-if="subtitle" class="mt-1 text-3.5 text-muted">
            {{ subtitle }}
          </view>
        </template>
        <view v-else>
          <view class="text-5 text-ink font-semibold">
            点击登录
          </view>
          <view class="mt-1 text-3.5 text-muted">
            登录后体验更多功能
          </view>
        </view>
      </view>
      <view class="i-carbon-chevron-right ml-auto text-5 text-muted" />
    </view>

    <!-- 积分摘要卡：仅登录可见，点击进入我的积分明细 -->
    <view
      v-if="auth.isLoggedIn"
      class="mt-3 flex items-center rounded-3 bg-card p-4 shadow-sm"
      hover-class="bg-hover"
      @click="goPointsLedger"
    >
      <view class="flex-1">
        <text class="text-3.5 text-muted">我的积分</text>
        <view class="text-primary-soft-text mt-1 text-6 font-semibold">
          {{ pointsOverview?.total ?? 0 }}
        </view>
      </view>
      <view class="text-right text-3.5 text-muted">
        <view>活动 {{ pointsOverview?.activityPoints ?? 0 }}</view>
        <view class="mt-1">
          捐献 {{ pointsOverview?.donationPoints ?? 0 }}
        </view>
      </view>
      <view class="i-carbon-chevron-right ml-3 text-5 text-muted" />
    </view>

    <!-- 菜单分组 -->
    <view v-for="(group, gi) in menuGroups" :key="gi" class="mt-3 overflow-hidden rounded-3 bg-card shadow-sm">
      <view
        v-for="(item, ii) in group" :key="item.key" class="flex items-center px-4 py-3"
        :class="ii > 0 ? 'border-t border-line' : ''" hover-class="bg-hover" @click="handleMenuTap(item)"
      >
        <view class="h-8 w-8 center rounded-lg bg-hover text-sub">
          <view class="text-4" :class="item.icon" />
        </view>
        <text class="ml-3 text-4 text-sub">{{ item.label }}</text>
        <view class="ml-auto flex items-center">
          <view v-if="item.dot" class="mr-2 h-2 w-2 rounded-full bg-danger" />
          <view class="i-carbon-chevron-right text-4 text-muted" />
        </view>
      </view>
    </view>

    <view class="m-8">
      <button
        v-if="auth.isLoggedIn" :loading="loggingOut"
        class="h-11 border border-danger rounded-2 bg-card text-4 text-danger" @click="handleLogout"
      >
        退出登录
      </button>
    </view>
  </view>
</template>
