<script setup lang="ts">
import HeaderMenu from '@/components/header-menu/header-menu.vue'
import type { HeaderMenuItem } from '@/components/header-menu/header-menu.vue'
import { useAuthStore } from '@/store/auth'
import { isPageTabbar } from '@/tabbar/store'
import { HOME_PAGE } from '@/utils'
import { systemInfo } from '@/utils/systemInfo'

defineOptions({
  name: 'LayoutSimpleNav',
})

/** 图标行高度（不含状态栏），与 default 布局保持一致 */
const NAV_BAR_HEIGHT = 44
const statusBarHeight = systemInfo.statusBarHeight ?? 0
/** 浮动图标栏总高度，用于弹出菜单的 top 定位 */
const barTotalHeight = statusBarHeight + NAV_BAR_HEIGHT

const auth = useAuthStore()

// 当前页是否为 tab 页：tab 页不显示返回图标
const isTab = ref(false)

function syncCurrentPage() {
  const pages = getCurrentPages()
  const last = pages[pages.length - 1]
  if (!last)
    return
  isTab.value = isPageTabbar(`/${last.route}`)
}

onMounted(() => {
  syncCurrentPage()
})

/** 返回图标：优先返回上一页，页面栈仅有当前页时（如分享直达）兜底回首页 */
function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1)
    uni.navigateBack({ delta: 1 })
  else
    uni.switchTab({ url: HOME_PAGE })
}

// —— 三条线弹出菜单 ——
const menuOpen = ref(false)

function openMenu() {
  syncCurrentPage()
  menuOpen.value = true
}

function closeMenu() {
  menuOpen.value = false
}

/** 菜单项：与 default 布局保持一致，游客不显示「退出登录」 */
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
  closeMenu()
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
  <view class="min-h-screen">
    <!-- 页面内容：图标悬浮于内容之上，不额外占用顶部高度 -->
    <slot />

    <!-- 浮动图标栏：容器本身不拦截点击，仅图标响应 -->
    <view class="simple-nav pointer-events-none fixed left-0 right-0 top-0 z-[999]">
      <!-- 状态栏占位 -->
      <view :style="{ height: `${statusBarHeight}px` }" />
      <view class="h-44px flex items-center justify-between px-3">
        <!-- 左侧：非 tab 页显示返回图标；tab 页用占位撑住右侧图标位置 -->
        <view
          v-if="!isTab"
          class="nav-btn pointer-events-auto h-8 w-8 center rounded-full bg-white/70 text-black"
          @click="goBack"
        >
          <view class="i-carbon-arrow-left text-4" />
        </view>
        <view v-else class="h-8 w-8" />

        <!-- 右侧：三条线菜单图标 -->
        <view
          class="nav-btn pointer-events-auto h-8 w-8 center rounded-full bg-white/70 text-black"
          @click="openMenu"
        >
          <view class="i-carbon-menu text-4" />
        </view>
      </view>
    </view>

    <!-- 弹出菜单：复用通用下拉菜单组件，右贴靠 -->
    <HeaderMenu
      v-model:show="menuOpen"
      :top-offset="barTotalHeight"
      :menu-items="menuItems"
      side="right"
      @select="onMenuSelect"
    />
  </view>
</template>

<style scoped lang="scss">
/* #ifdef H5 */
// 桌面宽屏下跟随 uni-app 容器一起收窄居中，避免浮动图标与菜单跳出容器
.simple-nav {
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
