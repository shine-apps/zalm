<script setup lang="ts">
import type { MediaItem } from '@/api/media'
import { uploadMedia } from '@/utils/upload-media'

/** 支持的上传形态：纯图片、纯视频、图片视频混合。 */
type UploaderType = 'image' | 'video' | 'mixed'
/** 单个文件的实际媒体类型。 */
type FileKind = 'image' | 'video'

interface PendingSource {
  kind: 'h5' | 'mp'
  mediaType: FileKind
  file?: File // H5
  path?: string // 小程序临时路径
  name: string
  size: number
  contentType: string
  width?: number
  height?: number
  duration?: number
}

const props = withDefaults(defineProps<{
  type: UploaderType
  modelValue?: MediaItem[]
  multiple?: boolean
  maxCount?: number
  disabled?: boolean
  /** 裸模式：不渲染组件自带触发区与结果 UI，仅通过 expose 的 trigger() 与 change 事件工作。 */
  bare?: boolean
}>(), {
  modelValue: () => [],
  multiple: false,
  maxCount: undefined,
  disabled: false,
  bare: false,
})

const emit = defineEmits<{
  'update:modelValue': [items: MediaItem[]]
  'change': [items: MediaItem[]]
}>()

/** 各媒体类型的 UI 常量。 */
const TYPE_UI: Record<FileKind, {
  accept: string
  extensions: string[]
  hint: string
  maxBytes: number
  defaultMime: string
}> = {
  image: {
    accept: 'image/jpeg,image/png,image/webp,image/gif,image/bmp',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    hint: '点击上传图片，支持 jpg / png / webp / gif，单张 ≤10MB',
    maxBytes: 10 * 1024 * 1024,
    defaultMime: 'image/jpeg',
  },
  video: {
    accept: 'video/mp4,video/quicktime,video/webm',
    extensions: ['mp4', 'mov', 'webm'],
    hint: '点击上传视频，支持 mp4 / mov / webm，单个 ≤500MB',
    maxBytes: 500 * 1024 * 1024,
    defaultMime: 'video/mp4',
  },
}

const effectiveMaxCount = computed(() => props.maxCount ?? (props.multiple ? 9 : 1))

/** H5 文件选择 accept：混合模式合并图片与视频。 */
const effectiveAccept = computed(() => props.type === 'mixed'
  ? `${TYPE_UI.image.accept},${TYPE_UI.video.accept}`
  : TYPE_UI[props.type].accept)

const effectiveHint = computed(() => {
  if (props.type === 'mixed')
    return '点击上传图片或视频，图片 jpg / png / webp / gif ≤10MB，视频 mp4 / mov / webm ≤500MB'
  return TYPE_UI[props.type].hint
})

const triggerTitle = computed(() => props.type === 'mixed'
  ? '上传图片或视频'
  : props.type === 'image' ? '上传图片' : '上传视频')

// ---- v-model 同步 ----
const items = ref<MediaItem[]>([...props.modelValue])
watch(() => props.modelValue, (v) => {
  if (v !== items.value)
    items.value = [...v]
})
watch(items, (v) => {
  emit('update:modelValue', v)
  emit('change', v)
}, { deep: true })

const canAdd = computed(() => !props.disabled && items.value.length < effectiveMaxCount.value)

// 上传源（重试用，非响应式）
const pendingSources = new Map<string, PendingSource>()

function makeTempId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function localPreviewUrl(source: PendingSource): string {
  let url = ''
  // #ifdef H5
  url = URL.createObjectURL(source.file!)
  // #endif
  // #ifdef MP-WEIXIN
  url = source.path!
  // #endif
  return url
}

/** H5：按 MIME 判定媒体类型，非图片/视频返回 null。 */
function detectH5Kind(file: File): FileKind | null {
  if (file.type.startsWith('image/'))
    return 'image'
  if (file.type.startsWith('video/'))
    return 'video'
  return null
}

/** 小程序：优先 chooseMedia 返回的 fileType，缺失时按扩展名兜底。 */
function detectMpKind(tempFilePath: string, fileType?: string): FileKind {
  if (fileType === 'image' || fileType === 'video')
    return fileType
  const ext = (tempFilePath.split('.').pop() || '').toLowerCase()
  return TYPE_UI.image.extensions.includes(ext) ? 'image' : 'video'
}

// H5 隐藏 input（命令式创建：避免模板中 input[type=file] 与 uniapp input 类型冲突）
let h5Input: HTMLInputElement | null = null

// ---- 触发选择 ----
function onTrigger() {
  if (!canAdd.value)
    return
  // #ifdef H5
  if (h5Input) {
    h5Input.accept = effectiveAccept.value
    h5Input.multiple = props.multiple || props.type === 'mixed'
    h5Input.click()
  }
  // #endif
  // #ifdef MP-WEIXIN
  void chooseMp()
  // #endif
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) {
    const sources: PendingSource[] = []
    for (const file of Array.from(input.files)) {
      const mediaType = detectH5Kind(file)
      if (!mediaType) {
        uni.showToast({ title: '仅支持图片或视频', icon: 'none' })
        continue
      }
      sources.push({
        kind: 'h5',
        mediaType,
        file,
        name: file.name,
        size: file.size,
        contentType: file.type || TYPE_UI[mediaType].defaultMime,
      })
    }
    void enqueue(sources)
  }
  input.value = ''
}

// 小程序选择（统一 chooseMedia：支持图片视频混合）
function chooseMp(): Promise<void> {
  const count = effectiveMaxCount.value - items.value.length
  const mediaType: Array<'image' | 'video'> = props.type === 'mixed'
    ? ['image', 'video']
    : [props.type]
  return new Promise((resolve) => {
    uni.chooseMedia({
      count,
      mediaType,
      sourceType: ['album', 'camera'],
      ...(mediaType.includes('video') ? { maxDuration: 60 } : {}),
      success: (res) => {
        const sources: PendingSource[] = res.tempFiles.map((f) => {
          const kind = detectMpKind(f.tempFilePath, f.fileType)
          return {
            kind: 'mp',
            mediaType: kind,
            path: f.tempFilePath,
            name: f.tempFilePath.split('/').pop() || `${kind}-${Date.now()}`,
            size: f.size,
            contentType: TYPE_UI[kind].defaultMime,
            ...(f.width ? { width: f.width } : {}),
            ...(f.height ? { height: f.height } : {}),
            ...(f.duration ? { duration: Math.round(f.duration) } : {}),
          }
        })
        void enqueue(sources)
        resolve()
      },
      fail: () => resolve(),
    })
  })
}

async function enqueue(sources: PendingSource[]) {
  const room = effectiveMaxCount.value - items.value.length
  for (const source of sources.slice(0, room)) {
    if (source.size > TYPE_UI[source.mediaType].maxBytes) {
      uni.showToast({ title: `「${source.name}」大小超限`, icon: 'none' })
      continue
    }
    const tempId = makeTempId()
    pendingSources.set(tempId, source)
    items.value.push({
      id: tempId,
      url: localPreviewUrl(source),
      type: source.mediaType,
      metadata: {
        name: source.name,
        size: source.size,
        mimeType: source.contentType,
      },
      status: 'uploading',
      progress: 0,
    })
    void process(tempId)
  }
}

async function process(tempId: string) {
  const source = pendingSources.get(tempId)
  const current = items.value.find(i => i.id === tempId)
  if (!source || !current)
    return

  try {
    const row = await uploadMedia(
      { ...source, type: source.mediaType },
      {
        onProgress: (progress) => {
          const target = items.value.find(i => i.id === tempId)
          if (target)
            target.progress = progress
        },
      },
    )

    const idx = items.value.findIndex(i => i.id === tempId)
    if (idx >= 0) {
      items.value[idx] = {
        id: row.id,
        url: row.url,
        type: row.type,
        metadata: row.metadata,
        status: 'done',
        progress: 100,
      }
    }
    pendingSources.delete(tempId)
  }
  catch (err) {
    const target = items.value.find(i => i.id === tempId)
    if (target) {
      target.status = 'error'
      target.errorMessage = err instanceof Error ? err.message : '上传失败'
      uni.showToast({ title: target.errorMessage, icon: 'none' })
    }
  }
}

function retry(tempId: string) {
  const source = pendingSources.get(tempId)
  const target = items.value.find(i => i.id === tempId)
  if (!source || !target)
    return
  target.status = 'uploading'
  target.progress = 0
  target.errorMessage = undefined
  void process(tempId)
}

function removeItem(id: string) {
  const idx = items.value.findIndex(i => i.id === id)
  if (idx < 0)
    return
  // #ifdef H5
  if (id.startsWith('local-'))
    URL.revokeObjectURL(items.value[idx]!.url)
  // #endif
  pendingSources.delete(id)
  items.value.splice(idx, 1)
}

onMounted(() => {
  // #ifdef H5
  h5Input = document.createElement('input')
  h5Input.type = 'file'
  h5Input.style.display = 'none'
  h5Input.addEventListener('change', onInputChange)
  document.body.appendChild(h5Input)
  // #endif
})

onUnmounted(() => {
  // #ifdef H5
  h5Input?.remove()
  h5Input = null
  // #endif
})

// 供父组件以自定义触发器调用（如资料页点击头像行）
defineExpose({
  trigger: onTrigger,
  reset: () => {
    items.value = []
  },
})
</script>

<template>
  <view>
    <!-- 触发区 -->
    <view
      v-if="!bare && canAdd"
      class="flex flex-col items-center justify-center gap-2 border border-line-strong rounded-xl border-dashed px-6 py-8"
      @click="onTrigger"
    >
      <text class="i-carbon-cloud-upload text-28px text-muted" />
      <text class="text-sm font-medium">{{ triggerTitle }}</text>
      <text class="text-xs text-muted">{{ effectiveHint }}</text>
    </view>

    <!-- 媒体网格（图片 / 视频混合） -->
    <view v-if="!bare && items.length" class="grid grid-cols-3 mt-4 gap-3">
      <view
        v-for="item in items"
        :key="item.id"
        class="relative aspect-[4/3] overflow-hidden border rounded-lg"
        :class="item.status === 'error' ? 'border-danger' : 'border-line'"
      >
        <template v-if="item.status !== 'error'">
          <image
            v-if="item.type === 'image'"
            :src="item.url"
            mode="aspectFill"
            class="h-full w-full"
          />
          <view v-else class="h-full w-full flex flex-col items-center justify-center gap-1 bg-black">
            <text class="i-carbon-play-filled text-24px text-white/80" />
            <text v-if="item.metadata.duration" class="text-10px text-white/70">
              {{ item.metadata.duration }}s
            </text>
          </view>
        </template>
        <view v-else class="h-full w-full flex flex-col items-center justify-center gap-1 bg-danger-soft">
          <text class="i-carbon-warning-alt text-20px text-danger" />
          <text class="text-xs text-primary font-medium" @click="retry(item.id)">重试</text>
        </view>
        <view
          v-if="item.status === 'uploading'"
          class="absolute inset-0 flex items-center justify-center bg-black/40"
        >
          <text class="text-xs text-white font-medium">{{ item.progress ?? 0 }}%</text>
        </view>
        <view
          v-if="!disabled"
          class="absolute right-1 top-1 h-5 w-5 flex items-center justify-center rounded-full bg-white/90"
          @click.stop="removeItem(item.id)"
        >
          <text class="i-carbon-close text-12px text-sub" />
        </view>
      </view>
    </view>
  </view>
</template>
