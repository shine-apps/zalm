<script lang="ts" setup>
import { useAuthStore } from '@/store/auth'
import { toLoginPage } from '@/utils/toLoginPage'

// 后台管理 webview 容器：加载 PC 后台 Nuxt 页面（如 /admin/points）
// 通过 URL query 传递目标路径：uni.navigateTo({ url: '/pages/admin/webview?path=/admin/points&title=积分管理' })

definePage({
  style: {
    // web-view 组件全屏展示，使用系统导航栏承载标题
    navigationStyle: 'default',
    navigationBarTitleText: '后台管理',
  },
})

const auth = useAuthStore()

// 解析 query 参数
const path = ref('')
const pageTitle = ref('后台管理')

onLoad((options) => {
  if (!auth.isLoggedIn) {
    toLoginPage()
    return
  }
  if (!auth.isAdmin) {
    uni.showToast({ title: '无权限访问', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 800)
    return
  }
  path.value = options?.path || ''
  pageTitle.value = decodeURIComponent(options?.title || '后台管理')
  // 动态设置导航栏标题
  uni.setNavigationBarTitle({ title: pageTitle.value })
})

// 拼接完整 URL
const targetUrl = computed(() => {
  if (!path.value)
    return ''
  const base = String(import.meta.env.VITE_SERVER_BASEURL || '').replace(/\/+$/, '')
  return `${base}${path.value}`
})
</script>

<template>
  <view class="h-screen w-screen">
    <web-view v-if="targetUrl" :src="targetUrl" />
  </view>
</template>
