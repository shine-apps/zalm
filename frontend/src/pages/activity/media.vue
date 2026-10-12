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

const albumUploader = ref<{ trigger: () => void, reset: () => void } | null>(null)

/** 已尝试绑定的媒体 id（change 事件随进度深监听高频触发，防止重复提交）。 */
const processedIds = new Set<string>()

async function load() {
  if (!activityId.value)
    return
  loading.value = true
  try {
    const a = await getActivity(activityId.value)
    media.value = a.media
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
  // 空数组守卫：reset() 会把 items 换成新空数组并再次触发 change，
  // 若不拦截会对 [] 重复 reset 形成失控循环，卡死 flush 令 load() 无法完成。
  if (!items.length || items.some(i => i.status === 'uploading'))
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
    albumUploader.value?.reset()
    processedIds.clear()
  }
  if (attempted)
    await load()
}

// —— 描述弹窗编辑 ——
const descEditVisible = ref(false)
const editingItem = ref<ActivityMediaItem | null>(null)
const descDraft = ref('')
const savingDesc = ref(false)

function openDescEditor(item: ActivityMediaItem) {
  editingItem.value = item
  descDraft.value = item.description
  descEditVisible.value = true
}

function closeDescEditor() {
  if (savingDesc.value)
    return
  descEditVisible.value = false
}

async function saveDesc() {
  const item = editingItem.value
  if (!item || savingDesc.value)
    return
  const next = descDraft.value.trim()
  if (next === item.description) {
    descEditVisible.value = false
    return
  }
  savingDesc.value = true
  try {
    await updateActivityMedia(activityId.value, item.id, next)
    item.description = next
    descEditVisible.value = false
    uni.showToast({ title: '描述已保存', icon: 'none' })
  }
  catch {
    // 拦截器已提示，弹窗保留供重试
  }
  finally {
    savingDesc.value = false
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

    <!-- 混合上传（图片 / 视频，单批最多 9 个） -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <text class="text-4 text-ink font-medium">上传照片或视频</text>
      <view class="mt-2">
        <media-uploader
          ref="albumUploader"
          type="mixed"
          multiple
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

      <view
        v-for="item in media"
        :key="item.id"
        class="mt-3 overflow-hidden border border-line rounded-2"
      >
        <!-- 媒体（图片 / 视频占位） -->
        <view
          class="relative aspect-[4/3] w-full overflow-hidden"
          :class="item.type === 'video' ? 'bg-black' : 'bg-hover'"
        >
          <image
            v-if="item.type === 'image'"
            :src="resolveMediaUrl(item.url)"
            mode="aspectFill"
            class="h-full w-full"
          />
          <view v-else class="absolute inset-0 flex items-center justify-center">
            <view class="i-carbon-video text-32px text-white/80" />
          </view>
          <text
            class="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-2.5 text-white"
          >
            {{ item.type === 'video' ? '视频' : '图片' }}
          </text>
          <view
            class="absolute right-2 top-2 h-7 w-7 flex items-center justify-center rounded-full bg-black/50"
            @click="confirmRemove(item)"
          >
            <view class="i-carbon-trash-can text-16px text-white" />
          </view>
        </view>
        <!-- 描述：修改按钮在最前，描述文本在后 -->
        <view class="flex items-start gap-2 px-2.5 py-2">  
          <text
            class="min-w-0 flex-1 whitespace-pre-wrap break-words text-3.5 text-sub leading-5"
            :class="!item.description && 'text-muted'"
          >
            {{ item.description || '未添加描述' }}
          </text>
          <view
            class="text-primary-soft-text flex shrink-0 items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-3"
            @click="openDescEditor(item)"
          >
            <view class="i-carbon-edit mr-0.5 text-13px" /> 修改
          </view>
        </view>
      </view>
    </view>

    <!-- 修改描述弹窗 -->
    <wd-popup
      v-model="descEditVisible"
      position="bottom"
      round
      safe-area-inset-bottom
    >
      <view class="px-4 pb-2 pt-4">
        <text class="text-4 text-ink font-medium">修改描述</text>
        <wd-textarea
          v-model="descDraft"
          :maxlength="200"
          show-word-limit
          auto-height
          placeholder="添加描述（选填，最多 200 字）"
          class="mt-3"
        />
        <view class="mt-3 flex pb-2">
          <button
            class="h-40px flex-1 border border-line-strong rounded-2 text-3.5"
            @click="closeDescEditor"
          >
            取消
          </button>
          <button
            :disabled="savingDesc"
            class="ml-3 h-40px flex-1 rounded-2 bg-primary text-3.5 text-white"
            @click="saveDesc"
          >
            保存
          </button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>
