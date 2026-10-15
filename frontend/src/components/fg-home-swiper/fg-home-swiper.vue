<script lang="ts" setup>
import type { HomeHighlight } from '@/api/home'
import { resolveMediaUrl } from '@/api/profile'
import { shortChineseDate } from '@/utils/home'

defineOptions({ name: 'FgHomeSwiper' })

const props = defineProps<{ items: HomeHighlight[] }>()
const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const failedIds = ref<Set<string>>(new Set())

function imageUrl(item: HomeHighlight): string {
  return resolveMediaUrl(item.imageUrl)
}

function onImageError(id: string) {
  if (failedIds.value.has(id))
    return
  const next = new Set(failedIds.value)
  next.add(id)
  failedIds.value = next
}

function onTap(id: string) {
  emit('select', id)
}
</script>

<template>
  <swiper
    v-if="props.items.length"
    class="h-190px w-full overflow-hidden rounded-3"
    circular
    autoplay
    :interval="4000"
    :duration="400"
    indicator-dots
    indicator-color="rgba(255,255,255,0.5)"
    indicator-active-color="#ffffff"
  >
    <swiper-item
      v-for="item in props.items"
      :key="item.id"
      @click="onTap(item.id)"
    >
      <view class="relative h-full w-full bg-hover">
        <image
          v-if="!failedIds.has(item.id)"
          :src="imageUrl(item)"
          mode="aspectFill"
          class="h-full w-full"
          @error="onImageError(item.id)"
        />
        <view v-else class="h-full w-full center bg-primary-soft">
          <view class="text-primary-soft-text i-carbon-image text-40px opacity-70" />
        </view>
        <view
          class="absolute left-2 top-2 rounded-1 bg-black/40 px-2 py-0.5 text-2.5 text-white"
        >
          近期风采 · {{ shortChineseDate(item.endTime) }} 已结束
        </view>
        <view class="absolute bottom-6 left-0 right-0 px-3">
          <text
            class="text-4 text-white font-medium"
            style="text-shadow: 0 1px 6px rgba(0,0,0,0.6)"
          >
            {{ item.title }}
          </text>
        </view>
      </view>
    </swiper-item>
  </swiper>
</template>
