<script lang="ts" setup>
import { getMyLedger } from '@/api/points'
import type { LedgerItem, PointsCategory } from '@/api/points'

definePage({
  style: { navigationBarTitleText: '我的积分' },
})

const tabs: { label: string, value: PointsCategory | '' }[] = [
  { label: '全部', value: '' },
  { label: '活动', value: 'activity' },
  { label: '捐献', value: 'donation' },
]
const category = ref<PointsCategory | ''>('')
const rows = ref<LedgerItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const pageSize = 20

const sourceLabel: Record<string, string> = {
  checkin: '签到奖励',
  manual_activity: '活动补录',
  manual_donation: '捐献录入',
  reversal: '冲正',
}

function titleOf(item: LedgerItem) {
  if (item.activityTitle)
    return item.activityTitle
  if (item.donationKind === 'money')
    return '爱心捐款'
  if (item.donationKind === 'goods')
    return '物资捐献'
  return sourceLabel[item.source] ?? '积分变动'
}

// 请求世代号：切分类时使在途旧请求失效，避免旧分类数据覆盖新 Tab
let seq = 0
async function load(reset = false) {
  if (!reset && loading.value)
    return
  if (reset) {
    page.value = 1
    rows.value = []
  }
  const requestSeq = ++seq
  const reqPage = page.value
  const reqCategory = category.value || undefined
  loading.value = true
  try {
    const res = await getMyLedger(reqPage, reqCategory, pageSize)
    if (requestSeq !== seq)
      return
    rows.value = reset ? res.data : [...rows.value, ...res.data]
    total.value = res.pagination.total
  }
  finally {
    if (requestSeq === seq)
      loading.value = false
  }
}

function switchTab(c: PointsCategory | '') {
  if (category.value === c)
    return
  category.value = c
  load(true)
}

function more() {
  if (loading.value || rows.value.length >= total.value)
    return
  page.value += 1
  load()
}

onMounted(() => load(true))
</script>

<template>
  <view class="min-h-screen bg-page px-3 pb-6 pt-3">
    <view class="flex rounded-3 bg-card p-1 shadow-sm">
      <view
        v-for="t in tabs" :key="t.value"
        class="flex-1 rounded-2 py-2 text-center text-4"
        :class="category === t.value ? 'bg-primary text-white font-medium' : 'text-sub'"
        @click="switchTab(t.value)"
      >
        {{ t.label }}
      </view>
    </view>

    <view class="mt-3 overflow-hidden rounded-3 bg-card shadow-sm">
      <view
        v-for="(item, i) in rows" :key="item.id"
        class="px-4 py-3" :class="i > 0 ? 'border-t border-line' : ''"
      >
        <view class="flex items-center">
          <text class="flex-1 text-4 text-ink">{{ titleOf(item) }}</text>
          <text class="text-4 font-semibold" :class="item.points < 0 ? 'text-danger' : 'text-primary-soft-text'">
            {{ item.points > 0 ? '+' : '' }}{{ item.points }}
          </text>
        </view>
        <view class="mt-1 flex items-center text-3 text-muted">
          <text>{{ sourceLabel[item.source] }}</text>
          <text class="ml-2">{{ new Date(item.createdAt).toLocaleString() }}</text>
        </view>
        <text v-if="item.note" class="mt-1 block text-3.5 text-sub">
          {{ item.note }}
        </text>
      </view>
      <view v-if="rows.length < total" class="py-3 text-center text-3.5 text-muted" @click="more">
        {{ loading ? '加载中…' : '加载更多' }}
      </view>
      <view v-else-if="!rows.length" class="py-8 text-center text-4 text-muted">
        暂无积分记录
      </view>
    </view>
  </view>
</template>
