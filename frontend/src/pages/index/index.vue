<script lang="ts" setup>
import type { ActivityView } from '@/api/activity'
import { getHome } from '@/api/home'
import type { HomeHighlight } from '@/api/home'
import { getPointsFeed } from '@/api/points'
import type { PointsFeedItem } from '@/api/points'
import { useShare } from '@/share/useShare'

defineOptions({
  name: 'Home',
})
definePage({
  type: 'home',
  layout: 'blank',
  style: {
    navigationBarTitleText: '首页',
  },
})

const highlights = ref<HomeHighlight[]>([])
const recruiting = ref<ActivityView[]>([])
const feedItems = ref<PointsFeedItem[]>([])

async function loadHome() {
  try {
    const data = await getHome()
    highlights.value = data.highlights
    recruiting.value = data.recruiting
  }
  catch {
    // 请求层已统一 toast；失败时保留各板块空态
    highlights.value = []
    recruiting.value = []
  }
}

async function loadFeed() {
  try {
    const res = await getPointsFeed(1, undefined, 20)
    feedItems.value = res.data
  }
  catch {
    feedItems.value = []
  }
}

function goAbout() {
  uni.navigateTo({ url: '/pages/about/about' })
}

function openDetail(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

function goActivityList() {
  uni.switchTab({ url: '/pages/activity/activity' })
}

function goPoints() {
  uni.navigateTo({ url: '/pages/points/index' })
}

// —— 首页分享（小程序右上角转发/朋友圈；H5 分享面板参数预留）——
useShare(() => ({
  title: '众爱联盟 · 一对一助力困境学生安心学业',
  desc: '仁心济世 · 善行天下，一起参与公益活动吧',
  page: '/pages/index/index',
  targetType: 'home',
}))

// 首屏与从详情页报名后返回都刷新（与活动列表页一致，仅用 onShow 避免首屏双发）
onShow(() => {
  void Promise.allSettled([loadHome(), loadFeed()])
})
</script>

<template>
  <view class="min-h-screen bg-page px-3 py-3">
    <!-- 压缩品牌头 -->
    <view class="mission-banner relative overflow-hidden rounded-4 px-4 py-3.5">
      <view
        class="pointer-events-none absolute text-white font-bold -bottom-6 -right-1"
        style="font-size: 96rpx; opacity: 0.08"
      >
        众
      </view>
      <view class="text-3 text-white tracking-widest" style="opacity: 0.9">
        众爱联盟 · ZHONG AI LIAN MENG
      </view>
      <view class="mt-1.5 text-5 text-white font-bold leading-7">
        一对一助力困境学生安心学业
      </view>
      <view
        class="mt-2 inline-block rounded-full bg-white px-3.5 py-1 text-3 text-primary font-semibold"
        @click="goAbout"
      >
        了解我们 ›
      </view>
    </view>

    <!-- 近期风采轮播：无素材时整块隐藏 -->
    <fg-home-swiper
      v-if="highlights.length"
      class="mt-3 block"
      :items="highlights"
      @select="openDetail"
    />

    <!-- 爱心动态滚动条（冷启动自动轮播信念文案） -->
    <fg-points-ticker :items="feedItems" @more="goPoints" />

    <!-- 招募中 -->
    <view class="mt-4 flex items-center px-1">
      <text class="text-5 text-ink font-semibold">🔥 招募中</text>
      <text v-if="recruiting.length" class="ml-2 text-3 text-muted">
        {{ recruiting.length }} 场活动等你参与
      </text>
      <text class="ml-auto text-3 text-muted" @click="goActivityList">
        查看全部 ›
      </text>
    </view>

    <view class="mt-2.5">
      <fg-recruit-card
        v-for="a in recruiting"
        :key="a.id"
        class="mb-3 block"
        :activity="a"
        @select="openDetail"
      />

      <view
        v-if="!recruiting.length"
        class="flex flex-col items-center border border-hover rounded-3 border-dashed bg-card px-4 py-8"
        @click="goActivityList"
      >
        <view class="i-carbon-event-schedule text-40px text-muted" />
        <text class="mt-2 text-3.5 text-muted">
          近期暂无招募活动，看看往期风采 ›
        </text>
      </view>
    </view>

    <view class="mt-6 pb-4 text-center text-3 text-muted tracking-widest">
      仁心济世 · 善行天下
    </view>
  </view>
</template>

<style scoped lang="scss">
.mission-banner {
  background: var(--c-primary-gradient);
}
</style>
