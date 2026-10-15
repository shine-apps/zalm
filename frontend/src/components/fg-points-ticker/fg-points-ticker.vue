<script lang="ts" setup>
import type { PointsFeedItem } from '@/api/points'
import { formatFeedText } from '@/utils/points-feed'

defineOptions({ name: 'FgPointsTicker' })

const props = defineProps<{
  items: PointsFeedItem[]
  fallbackTexts?: string[]
}>()

const emit = defineEmits<{
  (e: 'more'): void
}>()

const FALLBACK_TEXTS = ['让每一份善意，一对一精准抵达需要的人']

const lines = computed<string[]>(() => {
  if (props.items.length)
    return props.items.map(formatFeedText)
  return props.fallbackTexts?.length ? props.fallbackTexts : FALLBACK_TEXTS
})

const index = ref(0)
const smooth = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

function tick() {
  if (index.value < lines.value.length - 1) {
    index.value += 1
    return
  }
  // 滚到末尾后无动画归零，形成无缝循环
  smooth.value = false
  index.value = 0
  setTimeout(() => {
    smooth.value = true
  }, 50)
}

onMounted(() => {
  timer = setInterval(tick, 3000)
})
onUnmounted(() => {
  if (timer)
    clearInterval(timer)
  timer = null
})
</script>

<template>
  <view
    class="mt-3 flex items-center rounded-2 bg-primary-soft px-3 py-2"
    @click="emit('more')"
  >
    <view class="text-primary-soft-text i-carbon-trophy mr-2 shrink-0 text-18px" />
    <view class="relative h-20px flex-1 overflow-hidden">
      <view
        class="absolute left-0 right-0 top-0"
        :style="{
          transform: `translateY(-${index * 100}%)`,
          transition: smooth ? 'transform 0.4s ease' : 'none',
        }"
      >
        <view
          v-for="(line, i) in lines"
          :key="i"
          class="text-primary-soft-text h-20px flex items-center text-3"
        >
          <text class="truncate">{{ line }}</text>
        </view>
      </view>
    </view>
    <text class="text-primary-soft-text ml-2 shrink-0 text-3 font-medium">积分榜 ›</text>
  </view>
</template>
