<script lang="ts" setup>
import { consumePendingCrop, settleCrop } from '@/utils/img-crop'
import type { CropResult } from '@/utils/img-crop'

definePage({
  // 裁剪页需要纯黑全屏，不用默认布局的自定义导航栏
  layout: 'blank',
  style: {
    navigationBarTitleText: '裁剪图片',
  },
})

const visible = ref(false)
const imgSrc = ref('')
const aspectRatio = ref('1:1')

/** 防止 confirm/cancel 与 onUnload 重复回传。 */
let settled = false

function closeWithMissingPayload() {
  uni.showToast({ title: '裁剪参数缺失', icon: 'none' })
  setTimeout(() => uni.navigateBack(), 300)
}

onLoad(() => {
  const payload = consumePendingCrop()
  if (!payload?.src) {
    closeWithMissingPayload()
    return
  }
  imgSrc.value = payload.src
  aspectRatio.value = payload.aspectRatio || '1:1'
  nextTick(() => {
    visible.value = true
  })
})

function handleConfirm(result: CropResult) {
  if (settled)
    return
  settled = true
  settleCrop(result)
  uni.navigateBack()
}

function handleCancel() {
  if (settled)
    return
  settled = true
  settleCrop(null)
  uni.navigateBack()
}

onUnload(() => {
  // 系统返回手势/小程序胶囊/硬件返回关页时按取消结算，避免调用方 Promise 悬挂
  if (settled)
    return
  settled = true
  settleCrop(null)
})
</script>

<template>
  <view class="min-h-screen bg-black">
    <wd-img-cropper
      v-model="visible"
      :img-src="imgSrc"
      :aspect-ratio="aspectRatio"
      file-type="jpg"
      :quality="0.9"
      :export-scale="2"
      cancel-button-text="取消"
      confirm-button-text="完成"
      custom-class="tools-img-cropper"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
  </view>
</template>

<style lang="scss">
/* 非 scoped：需作用到 wd-img-cropper 内部节点；类名仅本页使用，不影响其他页面 */
.tools-img-cropper .wd-img-cropper__footer {
  padding-bottom: calc(30px + constant(safe-area-inset-bottom));
  padding-bottom: calc(30px + env(safe-area-inset-bottom));
}
</style>
