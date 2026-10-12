<script lang="ts" setup>
import type { ActivityMediaItem } from '@/api/activity'
import type { MediaItem } from '@/api/media'
import { bindActivityMedia, getActivity, removeActivityMedia, updateActivityMedia } from '@/api/activity'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '活动相册',
  },
})

const auth = useAuthStore()
const activityId = ref('')
const media = ref<ActivityMediaItem[]>([])
const loading = ref(false)

const imageUploader = ref<{ trigger: () => void, reset: () => void } | null>(null)
const videoUploader = ref<{ trigger: () => void, reset: () => void } | null>(null)

/** 已尝试绑定的媒体 id（change 事件随进度深监听高频触发，防止重复提交）。 */
const processedIds = new Set<string>()
/** 服务端已保存的描述快照（失焦时无变化则跳过 PATCH）。 */
const savedDescriptions = new Map<string, string>()

async function load() {
  if (!activityId.value)
    return
  loading.value = true
  try {
    const a = await getActivity(activityId.value)
    media.value = a.media
    savedDescriptions.clear()
    for (const item of a.media)
      savedDescriptions.set(item.id, item.description)
  }
  catch {
    // 拦截器已提示
  }
  finally {
    loading.value = false
  }
}

/**
 * 上传完成即绑定：等本轮全部上传结束（无 uploading）后批量 POST，
 * 成功后重置 uploader 暂存区并刷新列表（列表才是带描述的正式视图）。
 * 存在失败项时保留暂存区供重试（与列表暂时重复显示，重试成功后自愈）。
 */
async function onUploadChange(items: MediaItem[]) {
  if (items.some(i => i.status === 'uploading'))
    return
  let attempted = false
  for (const item of items) {
    if (item.status !== 'done' || item.id.startsWith('local-') || processedIds.has(item.id))
      continue
    processedIds.add(item.id)
    attempted = true
    try {
      await bindActivityMedia(activityId.value, { mediaId: item.id, description: '' })
    }
    catch {
      // 409（已挂载）静默；其余错误拦截器已 toast
    }
  }
  if (!items.some(i => i.status === 'error')) {
    imageUploader.value?.reset()
    videoUploader.value?.reset()
    processedIds.clear()
  }
  if (attempted)
    await load()
}

function onBlurDescription(item: ActivityMediaItem) {
  if (savedDescriptions.get(item.id) === item.description)
    return
  void saveDescription(item)
}

async function saveDescription(item: ActivityMediaItem) {
  try {
    await updateActivityMedia(activityId.value, item.id, item.description)
    savedDescriptions.set(item.id, item.description)
    uni.showToast({ title: '描述已保存', icon: 'none' })
  }
  catch {
    await load() // 失败回滚到服务端值
  }
}

function confirmRemove(item: ActivityMediaItem) {
  uni.showModal({
    title: '移除媒体',
    content: item.description
      ? `将从相册移除「${item.description}」，媒体文件保留。`
      : '确定从相册中移除该媒体吗？',
    confirmText: '移除',
    confirmColor: '#ef4444',
    success: (res) => {
      if (res.confirm)
        void doRemove(item)
    },
  })
}

async function doRemove(item: ActivityMediaItem) {
  try {
    await removeActivityMedia(activityId.value, item.id)
    uni.showToast({ title: '已移除', icon: 'none' })
    await load()
  }
  catch {
    // 拦截器已提示
  }
}

onLoad((options) => {
  if (!auth.canManageActivity) {
    uni.showToast({ title: '没有管理活动的权限', icon: 'none' })
    toLoginPage({ mode: 'reLaunch', redirect: null })
    return
  }
  activityId.value = options?.id ?? ''
  void load()
})
</script>

<template>
  <view class="min-h-screen bg-page px-3 py-3">
    <!-- 说明 -->
    <view class="rounded-3 bg-card p-4 shadow-sm">
      <text class="text-4 text-ink font-medium">上传活动照片或视频</text>
      <text class="mt-1 block text-3 text-muted">
        上传完成即自动加入相册，可为每条媒体添加描述；图片与视频将展示在活动详情页「活动相册」。
      </text>
    </view>

    <!-- 图片上传 -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <text class="text-4 text-ink font-medium">照片</text>
      <view class="mt-2">
        <media-uploader
          ref="imageUploader"
          type="image"
          multiple
          @change="onUploadChange"
        />
      </view>
    </view>

    <!-- 视频上传 -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <text class="text-4 text-ink font-medium">视频</text>
      <view class="mt-2">
        <media-uploader
          ref="videoUploader"
          type="video"
          :max-count="9"
          @change="onUploadChange"
        />
      </view>
    </view>

    <!-- 媒体列表（时间倒序） -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <view class="flex items-center">
        <text class="text-4 text-ink font-medium">相册内容</text>
        <text class="ml-auto text-3 text-muted">{{ media.length }} 项</text>
      </view>

      <view v-if="loading && !media.length" class="py-8 text-center text-3.5 text-muted">
        加载中…
      </view>
      <view v-else-if="!media.length" class="py-8 text-center text-3.5 text-muted">
        还没有相册内容，用上方上传区添加
      </view>

      <view v-for="item in media" :key="item.id" class="mt-3 flex items-start gap-3">
        <view
          class="h-80px w-100px shrink-0 overflow-hidden rounded-2"
          :class="item.type === 'video' ? 'bg-black' : 'bg-hover'"
        >
          <image
            v-if="item.type === 'image'"
            :src="resolveMediaUrl(item.url)"
            mode="aspectFill"
            class="h-full w-full"
          />
          <view v-else class="h-full w-full center">
            <view class="i-carbon-video text-20px text-white/80" />
          </view>
        </view>
        <view class="min-w-0 flex-1">
          <view class="flex items-center">
            <text class="text-3 text-muted">{{ item.type === 'video' ? '视频' : '图片' }}</text>
            <text
              class="i-carbon-trash-can ml-auto text-16px text-muted"
              @click="confirmRemove(item)"
            />
          </view>
          <input
            v-model="item.description"
            :maxlength="200"
            placeholder="添加描述（选填，最多 200 字）"
            class="mt-1 h-36px rounded-2 bg-hover px-2 text-3.5 text-ink"
            @blur="onBlurDescription(item)"
          >
        </view>
      </view>
    </view>
  </view>
</template>
