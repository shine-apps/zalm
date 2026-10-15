<script lang="ts" setup>
import type { ActivityView } from '@/api/activity'
import { resolveMediaUrl } from '@/api/profile'
import { formatTimeRange } from '@/utils/datetime'
import {
  CATEGORY_FALLBACK,
  DEFAULT_FALLBACK_ICON,
  enrolledText,
  isFull,
  progressPercent,
  seatBadge,
} from '@/utils/home'

defineOptions({ name: 'FgRecruitCard' })

const props = defineProps<{ activity: ActivityView }>()
const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const full = computed(() => isFull(props.activity))
const percent = computed(() => progressPercent(props.activity))
const coverUrl = computed(() => resolveMediaUrl(props.activity.coverUrl))
const fallbackIcon = computed(
  () => CATEGORY_FALLBACK[props.activity.categories[0] ?? ''] ?? DEFAULT_FALLBACK_ICON,
)
const imgFailed = ref(false)

function open() {
  if (full.value)
    return
  emit('select', props.activity.id)
}
</script>

<template>
  <view
    class="overflow-hidden rounded-3 bg-card shadow-sm"
    :class="full ? 'opacity-60' : ''"
    @click="open"
  >
    <view class="relative h-92px w-full bg-hover">
      <image
        v-if="coverUrl && !imgFailed"
        :src="coverUrl"
        mode="aspectFill"
        class="h-full w-full"
        @error="imgFailed = true"
      />
      <view v-else class="h-full w-full center bg-primary-soft">
        <view :class="fallbackIcon" class="text-primary-soft-text text-32px opacity-80" />
      </view>
      <text
        class="absolute left-2 top-2 rounded-full px-2 py-0.5 text-2.5"
        :class="full ? 'bg-hover text-sub' : 'bg-primary text-white'"
      >
        {{ seatBadge(activity) }}
      </text>
    </view>

    <view class="p-3">
      <text class="text-4 text-ink font-medium">{{ activity.title }}</text>
      <view class="mt-1 flex items-center text-3 text-sub">
        <view class="i-carbon-time mr-1 text-16px text-muted" />
        <text class="ml-1">{{ formatTimeRange(activity.startTime, activity.endTime) }}</text>
      </view>
      <view class="mt-1 flex items-center text-3 text-sub">
        <view class="i-carbon-location mr-1 text-16px text-muted" />
        <text class="ml-1 max-w-300px truncate">{{ activity.location.name }}</text>
      </view>

      <view class="mt-2.5 flex items-center">
        <text class="shrink-0 text-3 text-muted">{{ enrolledText(activity) }}</text>
        <view v-if="percent !== null" class="mx-2.5 h-5px flex-1 overflow-hidden rounded-3 bg-hover">
          <view class="h-full rounded-3 bg-primary" :style="{ width: `${percent}%` }" />
        </view>
        <view v-else class="flex-1" />
        <text
          class="shrink-0 rounded-full px-3.5 py-1 text-3 font-medium"
          :class="full ? 'bg-hover text-muted' : 'bg-primary text-white'"
        >
          {{ full ? '名额已满' : '立即报名 ›' }}
        </text>
      </view>
    </view>
  </view>
</template>
