<script lang="ts" setup>
import type { MediaItem } from '@/api/media'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'

const props = withDefaults(defineProps<{
  visible: boolean
  /** 弹窗标题，调用方可按场景自定义（如"完善资料"、"修改资料"）。 */
  title?: string
  /** 可选的提示文案，用于说明为什么需要修改。 */
  hint?: string
}>(), {
  title: '完善资料',
  hint: '',
})

const emit = defineEmits<{
  'update:visible': [v: boolean]
  /** 资料保存成功，父组件可继续之前被打断的动作（如报名）。 */
  'confirmed': []
  /** 用户点击取消或遮罩关闭，父组件应中止后续动作。 */
  'canceled': []
}>()

const auth = useAuthStore()

// —— 本地草稿（避免直接改写 store）——
const draftName = ref('')
const draftImageUrl = ref<string | null>(null)

// —— 状态 ——
const animating = ref(false)
const saving = ref(false)

// —— 头像（复用通用媒体上传组件，裸模式 + 1:1 裁剪）——
const avatarUploader = ref<{ trigger: () => void, reset: () => void } | null>(null)
const uploadingAvatar = ref(false)

watch(
  () => props.visible,
  (val) => {
    if (val) {
      // 打开时以当前 store 值初始化草稿
      draftName.value = auth.user?.name ?? ''
      draftImageUrl.value = auth.user?.image ?? null
      // 下一帧开启动画（先挂载 DOM 再 opacity/scale）
      nextTick(() => {
        animating.value = true
      })
    }
    else {
      animating.value = false
    }
  },
)

const avatarPreview = computed(() => {
  const url = draftImageUrl.value
    ? resolveMediaUrl(draftImageUrl.value)
    : (auth.user?.image ? resolveMediaUrl(auth.user.image) : '')
  return url || '/static/images/default-avatar.png'
})

const canSave = computed(() => {
  const trimmed = draftName.value.trim()
  if (!trimmed)
    return false
  if (trimmed.length > 20)
    return false
  // 必须有昵称且至少一项改动
  const nameChanged = trimmed !== (auth.user?.name ?? '')
  const imageChanged = draftImageUrl.value !== (auth.user?.image ?? null)
  return nameChanged || imageChanged
})

function close() {
  if (saving.value)
    return
  animating.value = false
  setTimeout(() => {
    emit('update:visible', false)
    emit('canceled')
  }, 200)
}

function chooseAvatar() {
  if (saving.value || uploadingAvatar.value)
    return
  avatarUploader.value?.trigger()
}

function onAvatarChange(items: MediaItem[]) {
  const file = items[0]
  if (!file)
    return
  if (file.status === 'uploading') {
    uploadingAvatar.value = true
    return
  }
  uploadingAvatar.value = false
  if (file.status === 'done') {
    draftImageUrl.value = file.url
  }
  avatarUploader.value?.reset()
}

async function handleSave() {
  if (!canSave.value || saving.value)
    return

  const trimmedName = draftName.value.trim()
  const nameChanged = trimmedName !== (auth.user?.name ?? '')
  const imageChanged = draftImageUrl.value !== (auth.user?.image ?? null)

  saving.value = true
  uni.showLoading({ title: '保存中', mask: true })
  try {
    if (imageChanged && draftImageUrl.value)
      await auth.setAvatar(draftImageUrl.value)
    if (nameChanged)
      await auth.updateName(trimmedName)

    uni.showToast({ title: '资料已更新', icon: 'success' })
    saving.value = false
    uni.hideLoading()

    animating.value = false
    setTimeout(() => {
      emit('update:visible', false)
      emit('confirmed')
    }, 200)
  }
  catch {
    saving.value = false
    uni.hideLoading()
    // 错误提示已由响应拦截器统一弹出
  }
}
</script>

<template>
  <view
    v-if="visible"
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 transition-opacity duration-200"
    :class="animating ? 'opacity-100' : 'opacity-0'"
    @click="close"
    @touchmove.stop.prevent
  >
    <view
      class="max-w-450px w-full rounded-t-3 bg-card p-5 shadow-lg transition-all duration-200"
      :class="animating ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'"
      @click.stop
    >
      <!-- 标题 -->
      <view class="mb-4 flex items-center">
        <text class="text-5 text-ink font-semibold">
          {{ title }}
        </text>
        <view
          class="i-carbon-close ml-auto p-1 text-5 text-muted"
          :class="saving ? 'opacity-40' : ''"
          @click="close"
        />
      </view>

      <!-- 提示 -->
      <view v-if="hint" class="mb-3 text-3.5 text-muted">
        {{ hint }}
      </view>

      <!-- 头像行 -->
      <view class="flex items-center">
        <text class="text-4 text-sub">头像</text>
        <view class="relative ml-auto" @click="chooseAvatar">
          <image
            :src="avatarPreview"
            class="h-16 w-16 rounded-full bg-hover"
          />
          <view class="absolute h-7 w-7 flex items-center justify-center border-2 border-card rounded-full bg-primary text-white -bottom-0.5 -right-0.5">
            <view class="i-carbon-camera text-14px" />
          </view>
        </view>
        <media-uploader
          ref="avatarUploader"
          type="image"
          scope="avatar"
          bare
          crop-aspect="1:1"
          @change="onAvatarChange"
        />
      </view>

      <!-- 昵称行 -->
      <view class="mt-5">
        <text class="text-4 text-sub">昵称</text>
        <view class="mt-2 h-11 flex items-center overflow-hidden border border-line-strong rounded-2 bg-card">
          <input
            v-model="draftName"
            type="text"
            :maxlength="20"
            placeholder="请输入昵称（1-20 字）"
            class="h-full flex-1 px-3 text-4 text-ink"
          >
          <text class="mr-3 text-3 text-muted">
            {{ draftName.length }}/20
          </text>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="mt-6 flex gap-3">
        <button
          :disabled="saving"
          class="h-11 flex-1 border border-line-strong rounded-2 text-4 text-sub"
          :class="saving ? 'opacity-50' : ''"
          @click="close"
        >
          取消
        </button>
        <button
          :loading="saving"
          :disabled="!canSave"
          class="h-11 flex-1 rounded-2 text-4 text-white"
          :class="canSave ? 'bg-primary' : 'bg-hover text-muted'"
          @click="handleSave"
        >
          保存
        </button>
      </view>
    </view>
  </view>
</template>
