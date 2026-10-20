<script lang="ts" setup>
import { consumePendingCrop, parseCropQuery, settleCrop } from '@/utils/img-crop'
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

/** 防止 confirm/cancel/imgloaderror/onUnload 重复回传。 */
let settled = false

function closeWithMissingPayload() {
  uni.showToast({ title: '裁剪参数缺失', icon: 'none' })
  setTimeout(() => uni.navigateBack(), 300)
}

// #ifdef H5
/**
 * blob: → data: URL。
 * uni-h5 的 <image> 用 CSS background-image 渲染，部分手机内核（如微信 X5）
 * 对 blob: 背景图支持不稳定，会导致裁剪页整屏发黑；统一转成 data: 规避差异。
 */
function blobToDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fetch(src)
      .then((resp) => {
        if (!resp.ok)
          throw new Error(`HTTP ${resp.status}`)
        return resp.blob()
      })
      .then((blob) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('readAsDataURL 失败'))
        reader.readAsDataURL(blob)
      })
      .catch(reject)
  })
}
// #endif

/** 就绪后交给裁剪组件的图片源：H5 下把 blob: 转为 data:，失败保留原值。 */
async function normalizeDisplaySrc(rawSrc: string): Promise<string> {
  // #ifdef H5
  if (rawSrc.startsWith('blob:')) {
    try {
      return await blobToDataUrl(rawSrc)
    }
    catch {
      // 转换失败保留原值，由 imgloaderror 兜底提示
    }
  }
  // #endif
  return rawSrc
}

onLoad((options) => {
  // 优先模块级变量，未命中时从 URL query 兜底还原
  const payload = consumePendingCrop() ?? parseCropQuery(options as Record<string, unknown> | undefined)
  if (!payload?.src) {
    closeWithMissingPayload()
    return
  }
  aspectRatio.value = payload.aspectRatio || '1:1'
  void (async () => {
    imgSrc.value = await normalizeDisplaySrc(payload.src)
    await nextTick()
    visible.value = true
  })()
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

function handleImgLoadError() {
  // 图片加载失败时不能停留在死黑屏，提示后按取消结算返回
  if (settled)
    return
  settled = true
  uni.showToast({ title: '图片加载失败', icon: 'none' })
  settleCrop(null)
  setTimeout(() => uni.navigateBack(), 300)
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
      @imgloaderror="handleImgLoadError"
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
