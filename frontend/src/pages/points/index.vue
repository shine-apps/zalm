<script lang="ts" setup>
import {
  getLeaderboard,
  getPointsFeed,

} from '@/api/points'
import type { LeaderboardRow, PointsDimension, PointsFeedItem } from '@/api/points'
import { resolveMediaUrl } from '@/api/profile'
import { useShare } from '@/share/useShare'

definePage({
  style: { navigationBarTitleText: '积分排行' },
})

const tabs: { label: string, value: PointsDimension }[] = [
  { label: '总榜', value: 'total' },
  { label: '活动榜', value: 'activity' },
  { label: '捐献榜', value: 'donation' },
]
const dimension = ref<PointsDimension>('total')

const ranks = ref<LeaderboardRow[]>([])
const rankTotal = ref(0)
const rankPage = ref(1)
const rankLoading = ref(false)

const feed = ref<PointsFeedItem[]>([])
const feedTotal = ref(0)
const feedPage = ref(1)
const feedLoading = ref(false)
const pageSize = 20

function avatar(url: string | null) {
  return resolveMediaUrl(url) || '/static/images/default-avatar.png'
}

function scoreText(row: LeaderboardRow) {
  if (dimension.value === 'activity')
    return `${row.activityPoints}`
  if (dimension.value === 'donation')
    return `${row.donationPoints}`
  return `${row.total}`
}

function goLedger() {
  uni.navigateTo({ url: '/pages/points/ledger' })
}

function goUserHome(userId: string) {
  uni.navigateTo({ url: `/pages/user-home/index?userId=${userId}` })
}

function goActivity(item: PointsFeedItem) {
  if (item.category === 'activity' && item.activityId)
    uni.navigateTo({ url: `/pages/activity/detail?id=${item.activityId}` })
}

// 请求世代号：切维度时使在途旧请求失效，避免旧维度数据覆盖新 Tab
let rankSeq = 0
async function loadRanks(reset = false) {
  if (!reset && rankLoading.value)
    return
  if (reset) {
    rankPage.value = 1
    ranks.value = []
  }
  const seq = ++rankSeq
  const reqPage = rankPage.value
  const reqDimension = dimension.value
  rankLoading.value = true
  try {
    const res = await getLeaderboard(reqDimension, reqPage, pageSize)
    if (seq !== rankSeq)
      return
    ranks.value = reset ? res.data : [...ranks.value, ...res.data]
    rankTotal.value = res.pagination.total
  }
  finally {
    if (seq === rankSeq)
      rankLoading.value = false
  }
}

function switchTab(d: PointsDimension) {
  if (dimension.value === d)
    return
  dimension.value = d
  loadRanks(true)
}

function feedText(item: PointsFeedItem) {
  if (item.category === 'activity') {
    return item.source === 'manual_activity'
      ? `活动奖励「${item.activityTitle ?? ''}」`
      : `参加活动「${item.activityTitle ?? ''}」`
  }
  return item.donationKind === 'money' ? '爱心捐款' : '物资捐献'
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1)
    return '刚刚'
  if (min < 60)
    return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24)
    return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30)
    return `${d} 天前`
  return new Date(iso).toLocaleDateString()
}

let feedSeq = 0
async function loadFeed(reset = false) {
  if (!reset && feedLoading.value)
    return
  if (reset) {
    feedPage.value = 1
    feed.value = []
  }
  const seq = ++feedSeq
  const reqPage = feedPage.value
  feedLoading.value = true
  try {
    const res = await getPointsFeed(reqPage)
    if (seq !== feedSeq)
      return
    feed.value = reset ? res.data : [...feed.value, ...res.data]
    feedTotal.value = res.pagination.total
  }
  finally {
    if (seq === feedSeq)
      feedLoading.value = false
  }
}

function moreRanks() {
  if (rankLoading.value || ranks.value.length >= rankTotal.value)
    return
  rankPage.value += 1
  loadRanks()
}
function moreFeed() {
  if (feedLoading.value || feed.value.length >= feedTotal.value)
    return
  feedPage.value += 1
  loadFeed()
}

// —— 积分页分享（小程序右上角转发/朋友圈；H5 分享面板参数预留）——
useShare(() => ({
  title: '众爱联盟公益积分榜 · 爱心看得见',
  desc: '公益积分总榜实时更新，快来看看谁的爱心值最高，一起来做公益赢积分吧',
  page: '/pages/points/index',
  targetType: 'points',
}))

onMounted(() => {
  loadRanks(true)
  loadFeed(true)
})
</script>

<template>
  <view class="min-h-screen bg-page px-3 pb-6 pt-3">
    <!-- 我的积分入口 -->
    <!-- <view class="flex items-center rounded-3 bg-card px-4 py-3 shadow-sm" @click="goLedger">
      <view class="i-carbon-receipt text-5 text-primary" />
      <text class="ml-2 flex-1 text-4 text-ink">我的积分明细</text>
      <view class="i-carbon-chevron-right text-4 text-muted" />
    </view> -->

    <!-- 排行榜说明 -->
    <view class="rounded-3 bg-card px-4 py-3 shadow-sm">
      <view class="text-4.5 text-ink font-semibold">
        积分排行榜
      </view>
      <view class="mt-1 text-3.5 text-muted leading-relaxed">
        参加活动签到、爱心捐献都能获得积分，爱心看得见！点击头像或昵称即可进入 TA 的主页，带 › 图标的动态还能跳转活动详情。
      </view>
    </view>

    <!-- 榜单维度切换 -->
    <view class="mt-3 flex rounded-3 bg-card p-1 shadow-sm">
      <view
        v-for="t in tabs" :key="t.value"
        class="flex-1 rounded-2 py-2 text-center text-4"
        :class="dimension === t.value ? 'bg-primary text-white font-medium' : 'text-sub'"
        @click="switchTab(t.value)"
      >
        {{ t.label }}
      </view>
    </view>

    <!-- 前三名（纯样式奖牌，不用 emoji） -->
    <view v-if="ranks.length" class="mt-3 flex items-end justify-around rounded-3 bg-card py-4 shadow-sm">
      <template v-for="idx in [1, 0, 2]" :key="ranks[idx]?.userId ?? idx">
        <view
          v-if="ranks[idx]"
          class="flex flex-col items-center"
          :class="idx === 0 ? 'order-2' : idx === 1 ? 'order-1' : 'order-3'"
          @click="goUserHome(ranks[idx]!.userId)"
        >
          <view class="relative">
            <image :src="avatar(ranks[idx]!.image)" class="rounded-full bg-hover" :class="idx === 0 ? 'h-16 w-16' : 'h-12 w-12'" />
            <view
              class="absolute h-5 min-w-5 center border-2 border-card rounded-full px-1 text-3 text-white font-semibold -bottom-1 -left-1"
              :class="idx === 0 ? 'bg-primary' : 'bg-muted'"
            >
              {{ idx + 1 }}
            </view>
          </view>
          <text class="mt-1 max-w-24 truncate text-3.5 text-ink">{{ ranks[idx]!.name }}</text>
          <text class="text-primary-soft-text text-4 font-semibold">{{ scoreText(ranks[idx]!) }}</text>
        </view>
      </template>
    </view>

    <!-- 榜单列表 -->
    <view class="mt-3 overflow-hidden rounded-3 bg-card shadow-sm">
      <view
        v-for="row in ranks" :key="row.userId"
        class="flex items-center px-4 py-3"
        :class="[row.rank > 1 ? 'border-t border-line' : '', row.isMe ? 'bg-primary-soft' : '']"
        @click="goUserHome(row.userId)"
      >
        <text class="w-8 text-4 text-muted">{{ row.rank }}</text>
        <image :src="avatar(row.image)" class="h-9 w-9 rounded-full bg-hover" />
        <text class="ml-3 flex-1 truncate text-4 text-ink">
          {{ row.name }}
          <text v-if="row.isMe" class="text-primary-soft-text ml-1 text-3">（我）</text>
        </text>
        <text class="text-primary-soft-text text-4 font-semibold">{{ scoreText(row) }}</text>
      </view>
      <view v-if="ranks.length < rankTotal" class="py-3 text-center text-3.5 text-muted" @click="moreRanks">
        {{ rankLoading ? '加载中…' : '加载更多' }}
      </view>
      <view v-else-if="!ranks.length" class="py-8 text-center text-4 text-muted">
        暂无积分记录
      </view>
    </view>

    <!-- 近期动态（捐献不显示金额/物资/备注） -->
    <view class="mt-4 rounded-3 bg-card shadow-sm">
      <view class="px-4 pt-3 text-4 text-ink font-medium">
        近期积分动态
      </view>
      <view
        v-for="item in feed" :key="item.id"
        class="flex items-center border-t border-line px-4 py-3"
        @click="goActivity(item)"
      >
        <image :src="avatar(item.userImage)" class="h-9 w-9 rounded-full bg-hover" @click.stop="goUserHome(item.userId)" />
        <view class="ml-3 flex-1">
          <text class="text-4 text-ink" @click.stop="goUserHome(item.userId)">{{ item.userName }}</text>
          <text class="ml-1 text-3.5 text-muted">{{ feedText(item) }}</text>
          <view class="mt-0.5 text-3 text-muted">
            {{ timeAgo(item.createdAt) }}
          </view>
        </view>
        <text class="text-primary-soft-text text-4 font-semibold">+{{ item.points }}</text>
        <view v-if="item.category === 'activity' && item.activityId" class="i-carbon-chevron-right ml-1 text-4 text-muted" />
      </view>
      <view v-if="feed.length < feedTotal" class="py-3 text-center text-3.5 text-muted" @click="moreFeed">
        {{ feedLoading ? '加载中…' : '加载更多' }}
      </view>
      <view v-else-if="!feed.length" class="py-8 text-center text-4 text-muted">
        暂无动态
      </view>
    </view>
  </view>
</template>
