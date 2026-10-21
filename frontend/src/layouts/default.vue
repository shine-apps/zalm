<script setup lang="ts">
import HeaderMenu from '@/components/header-menu/header-menu.vue'
import type { HeaderMenuItem } from '@/components/header-menu/header-menu.vue'
import { useAuthStore } from '@/store/auth'
import { isPageTabbar } from '@/tabbar/store'
import { HOME_PAGE } from '@/utils'
import { toLoginPage } from '@/utils/toLoginPage'
import { systemInfo } from '@/utils/systemInfo'

defineOptions({
  name: 'LayoutDefault',
})

/** 导航栏内容区高度（不含状态栏），小程序/H5 通用标准 44px */
const NAV_BAR_HEIGHT = 44
const statusBarHeight = systemInfo.statusBarHeight ?? 0
/** fixed 头部总高度，用于内容区顶部占位与弹层定位 */
const headerTotalHeight = statusBarHeight + NAV_BAR_HEIGHT

const auth = useAuthStore()

/**
 * 页面路径 → 标题。
 * 需与各页 definePage 的 style.navigationBarTitleText 保持同步。
 */
const PAGE_TITLES: Record<string, string> = {
  '/pages/index/index': '首页',
  '/pages/activity/activity': '活动',
  '/pages/about/about': '关于',
  '/pages/login/index': '登录',
  '/pages/me/me': '我的',
  '/pages/me/profile': '个人信息',
  '/pages/notification/index': '消息中心',
}

// 当前页标题与是否为 tab 页：布局组件随页面创建而挂载，onMounted 中读取页面栈即可
const title = ref('')
const isTab = ref(false)

function syncCurrentPage() {
  const pages = getCurrentPages()
  const last = pages[pages.length - 1]
  if (!last)
    return
  const path = `/${last.route}`
  title.value = PAGE_TITLES[path] || ''
  isTab.value = isPageTabbar(path)
}

onMounted(() => {
  syncCurrentPage()
})

// —— 三条线弹出菜单 ——
const menuOpen = ref(false)

function openMenu() {
  syncCurrentPage()
  menuOpen.value = true
}

/** tab 页最左侧图标：回首页 */
function goHome() {
  uni.switchTab({ url: HOME_PAGE })
}

/** 用户图标：进「我的」tab */
function goMe() {
  uni.switchTab({ url: '/pages/me/me' })
}

/** 非 tab 页最左侧图标：优先返回上一页，页面栈仅有当前页时（如分享直达）兜底回首页 */
function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1)
    uni.navigateBack({ delta: 1 })
  else
    uni.switchTab({ url: HOME_PAGE })
}

/** 导航栏铃铛图标：进消息中心 */
function goNotifications() {
  uni.navigateTo({ url: '/pages/notification/index' })
}

/** 暂未开放功能的占位提示 */
function showComingSoon() {
  uni.showToast({ title: '功能开发中', icon: 'none' })
}

/** 菜单项：与 simpleNav 布局保持一致，游客不显示「退出登录」 */
const menuItems = computed<HeaderMenuItem[]>(() => {
  const items: HeaderMenuItem[] = [
    { key: 'home', label: '首 页 ', icon: 'i-carbon-home' },
    { key: 'activities', label: '活动报名', icon: 'i-carbon-calendar' },
    { key: 'me', label: '我的主页', icon: 'i-carbon-star' },
    { key: 'notifications', label: '消息通知', icon: 'i-carbon-notification' },
    { key: 'about', label: '众爱联盟', icon: 'i-carbon-information' },
  ]
  if (auth.isLoggedIn)
    items.push({ key: 'logout', label: '退出登录', icon: 'i-carbon-logout', danger: true })
  return items
})

async function onMenuSelect(key: string) {
  switch (key) {
    case 'home':
      uni.switchTab({ url: '/pages/index/index' })
      break
    case 'activities':
      uni.switchTab({ url: '/pages/activity/activity' })
      break
    case 'me':
      uni.switchTab({ url: '/pages/me/me' })
      break
    case 'notifications':
      uni.navigateTo({ url: '/pages/notification/index' })
      break
    case 'about':
      uni.navigateTo({ url: '/pages/about/about' })
      break
    case 'logout':
      await auth.logout()
      uni.reLaunch({ url: '/pages/login/index' })
      break
  }
}
</script>

<template>
  <view class="min-h-screen flex flex-col">
    <!-- 自定义头部导航栏 -->
    <view class="layout-navbar fixed left-0 right-0 top-0 z-[999] border-b border-line bg-card">
      <!-- 状态栏占位 -->
      <view :style="{ height: `${statusBarHeight}px` }" />
      <!-- 导航栏：左侧操作区 + 右侧标题 -->
      <view class="h-44px flex items-center justify-between px-3">
        <view class="flex items-center gap-2">
          <!-- tab 页：主页图标；非 tab 页：返回图标 -->
          <view v-if="isTab" class="h-8 w-8 center rounded-full bg-hover text-sub" @click="goHome">
            <view class="i-carbon-home text-4" />
          </view>
          <view v-else class="h-8 w-8 center rounded-full bg-hover text-sub" @click="goBack">
            <view class="i-carbon-arrow-left text-4" />
          </view>

          <!-- 游客：登录按钮；已登录：用户图标 + 三条线 -->
          <view
            v-if="!auth.isLoggedIn"
            class="text-primary-soft-text rounded-full bg-primary-soft px-3 py-1 text-3.5 font-medium"
            @click="toLoginPage()"
          >
            登录
          </view>
          <template v-else>
            <view class="h-8 w-8 center rounded-full bg-hover text-sub" @click="openMenu">
              <view class="i-carbon-menu text-4" />
            </view>
            <view class="h-8 w-8 center rounded-full bg-hover text-sub" @click="goMe">
              <view class="i-carbon-user text-4" />
            </view>
            <view class="h-8 w-8 center rounded-full bg-hover text-sub" @click="goNotifications">
              <view class="i-carbon-notification text-4" />
            </view>
          </template>
        </view>

        <!-- 右部分：标题 -->
        <text class="ml-10 flex-1 text-4 text-ink font-medium">{{ title }}</text>
      </view>
    </view>

    <!-- 页面内容：为 fixed 头部留出高度 -->
    <view :style="{ paddingTop: `${headerTotalHeight}px` }">
      <slot />
    </view>

    <!-- 三条线弹出菜单组件 -->
    <HeaderMenu
      v-model:show="menuOpen"
      :top-offset="headerTotalHeight"
      :menu-items="menuItems"
      @select="onMenuSelect"
    />
  </view>
</template>

<style scoped lang="scss">
/* #ifdef H5 */
// 桌面宽屏下跟随 uni-app 容器一起收窄居中，避免 fixed 导航栏跳出容器横跨视口
.layout-navbar {
  @media (min-width: 1024px) {
    width: 100%;
    max-width: 768px;
    left: 50%;
    right: auto;
    transform: translateX(-50%);
  }
}
/* #endif */
</style>
