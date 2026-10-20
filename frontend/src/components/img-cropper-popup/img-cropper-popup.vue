<script lang="ts" setup>
import { nextTick, ref } from 'vue'
import type { CropResult } from '@/utils/img-crop'

/**
 * 页内图片裁剪弹窗（替代原 /pages/tools/img-cropper 裁剪页）。
 *
 * 不再发生页面跳转：调用方在当前页内 open()，wd-img-cropper 以弹层形式打开，
 * 避免 H5 端「跳页后组件挂载 + 大图解码」期间整页只剩纯黑底的黑屏窗口。
 * 使用方式：调用方在模板中放置本组件，调用 expose 的 open(src, aspectRatio)
 * 等待 Promise —— confirm 返回裁剪产物，取消/图片加载失败 resolve null。
 */

const visible = ref(false)
const imgSrc = ref('')
const aspectRatio = ref('1:1')

/** 当前未结算的 open() 回调，confirm/cancel/imgloaderror 只允许结算一次。 */
let resolver: ((result: CropResult | null) => void) | null = null

// #ifdef H5
/**
 * blob: → data: URL。
 * uni-h5 的 <image> 用 CSS background-image 渲染，部分手机内核（如微信 X5）
 * 对 blob: 背景图支持不稳定；统一转成 data: 规避差异。
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

/** 交给裁剪组件的图片源：H5 下把 blob: 转为 data:，失败保留原值。 */
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

/**
 * 打开裁剪弹窗并等待结果。
 * @returns confirm 返回裁剪产物；取消、图片加载失败或被新一次 open 打断返回 null
 */
function open(src: string, ratio = '1:1'): Promise<CropResult | null> {
  // 防重入：上一次尚未结算时先以 null 结算旧 Promise
  const previous = resolver
  resolver = null
  previous?.(null)

  return new Promise((resolve) => {
    resolver = resolve
    aspectRatio.value = ratio || '1:1'
    void (async () => {
      imgSrc.value = await normalizeDisplaySrc(src)
      await nextTick()
      // 图源准备期间已被取消/打断时不再弹出，避免弹窗在 settle 后又被置回打开态
      if (!resolver)
        return
      visible.value = true
    })()
  })
}

function settle(result: CropResult | null) {
  const pending = resolver
  resolver = null
  visible.value = false
  pending?.(result)
}

function handleConfirm(result: CropResult) {
  settle(result)
}

function handleCancel() {
  settle(null)
}

function handleImgLoadError() {
  // 图片加载失败时不能停留在死黑屏，提示后按取消结算
  uni.showToast({ title: '图片加载失败', icon: 'none' })
  settle(null)
}

defineExpose({ open })
</script>

<template>
  <wd-img-cropper
    v-model="visible"
    :img-src="imgSrc"
    :aspect-ratio="aspectRatio"
    file-type="jpg"
    :quality="0.9"
    :export-scale="2"
    cancel-button-text="取消"
    confirm-button-text="完成"
    custom-class="img-cropper-popup"
    @confirm="handleConfirm"
    @cancel="handleCancel"
    @imgloaderror="handleImgLoadError"
  />
</template>

<style lang="scss">
/* 非 scoped：需作用到 wd-img-cropper 内部节点；类名仅本组件使用，不影响其他组件 */
.img-cropper-popup .wd-img-cropper__footer {
  padding-bottom: calc(30px + constant(safe-area-inset-bottom));
  padding-bottom: calc(30px + env(safe-area-inset-bottom));
}
</style>
