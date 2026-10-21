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

const VISIBLE = 3
const LINE_H = 20

const lines = computed<string[]>(() => {
  if (props.items.length)
    return props.items.map(formatFeedText)
  return props.fallbackTexts?.length ? props.fallbackTexts : FALLBACK_TEXTS
})

// 超过 3 条才滚动；尾部复制首 3 条，滚到复制段后无动画归零，形成无缝循环
const looping = computed(() => lines.value.length > VISIBLE)
const displayLines = computed<string[]>(() =>
  looping.value ? [...lines.value, ...lines.value.slice(0, VISIBLE)] : lines.value,
)
const viewportH = computed(() => `${Math.min(lines.value.length, VISIBLE) * LINE_H}px`)

const index = ref(0)
const smooth = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

// 数据变化（如刷新失败回退兜底文案）时复位，避免位移越界后空白
watch(() => lines.value.length, () => {
  index.value = 0
})

function tick() {
  if (!looping.value)
    return
  if (index.value < lines.value.length) {
    index.value += 1
    return
  }
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
    <view class="relative flex-1 overflow-hidden" :style="{ height: viewportH }">
      <view
        class="absolute left-0 right-0 top-0"
        :style="{
          transform: `translateY(-${index * LINE_H}px)`,
          transition: smooth ? 'transform 0.4s ease' : 'none',
        }"
      >
        <view
          v-for="(line, i) in displayLines"
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
