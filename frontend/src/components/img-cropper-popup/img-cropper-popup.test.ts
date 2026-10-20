import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ImgCropperPopup from './img-cropper-popup.vue'
import type { CropResult } from '@/utils/img-crop'

/**
 * wd-img-cropper 桩：显式命名（VTU 按定义对象查找会命中被替换前的旧实例），
 * 支持 props 断言与手动触发 confirm/cancel/imgloaderror。
 */
const WdImgCropperStub = defineComponent({
  name: 'WdImgCropperStub',
  props: {
    modelValue: { type: Boolean, default: false },
    imgSrc: { type: String, default: '' },
    aspectRatio: { type: String, default: '1:1' },
  },
  emits: ['update:modelValue', 'confirm', 'cancel', 'imgloaderror'],
  template: '<div class="wd-img-cropper-stub" />',
})

function mountPopup() {
  return mount(ImgCropperPopup, {
    // 用 global.components 注册桩而不是 VTU stubs：后者在重渲染时会发生
    // 桩实例替换/旧实例残留，findComponent 命中旧实例导致 props 读到旧值
    global: { components: { WdImgCropper: WdImgCropperStub } },
  })
}

function findCropper(wrapper: VueWrapper) {
  const cropper = wrapper.findComponent({ name: 'WdImgCropperStub' })
  if (!cropper.exists())
    throw new Error('未找到 wd-img-cropper 桩')
  return cropper
}

/** 打开弹窗并等待图源就绪，返回仍待结算的裁剪 Promise。 */
async function open(wrapper: VueWrapper, src = 'https://example.com/a.jpg', ratio = '1:1') {
  const promise = (wrapper.vm as unknown as { open: (s: string, r: string) => Promise<CropResult | null> })
    .open(src, ratio)
  // open 内部链路含多个 await（图源就绪 → nextTick → visible 置真），
  // 连刷两轮 flushPromises 确保全部落地后再断言
  await flushPromises()
  await flushPromises()
  return { promise }
}

describe('img-cropper-popup', () => {
  it('open 后展示裁剪弹窗并传入图片源与比例', async () => {
    const wrapper = mountPopup()
    const { promise } = await open(wrapper, 'https://example.com/a.jpg', '16:9')

    const cropper = findCropper(wrapper)
    expect(cropper.props('modelValue')).toBe(true)
    expect(cropper.props('imgSrc')).toBe('https://example.com/a.jpg')
    expect(cropper.props('aspectRatio')).toBe('16:9')

    cropper.vm.$emit('confirm', { tempFilePath: 'blob:out', width: 200, height: 200 })
    await expect(promise).resolves.toEqual({ tempFilePath: 'blob:out', width: 200, height: 200 })
    expect(cropper.props('modelValue')).toBe(false)
  })

  it('取消时 resolve null 并关闭弹窗', async () => {
    const wrapper = mountPopup()
    const { promise } = await open(wrapper)

    const cropper = findCropper(wrapper)
    cropper.vm.$emit('cancel')
    await expect(promise).resolves.toBeNull()
    expect(cropper.props('modelValue')).toBe(false)
  })

  it('confirm 只允许结算一次', async () => {
    const wrapper = mountPopup()
    const { promise } = await open(wrapper)

    const cropper = findCropper(wrapper)
    cropper.vm.$emit('confirm', { tempFilePath: 'blob:1', width: 1, height: 1 })
    cropper.vm.$emit('cancel')
    await expect(promise).resolves.toEqual({ tempFilePath: 'blob:1', width: 1, height: 1 })
  })

  it('图片加载失败：toast 提示并按取消结算', async () => {
    const wrapper = mountPopup()
    const { promise } = await open(wrapper)

    findCropper(wrapper).vm.$emit('imgloaderror')
    await expect(promise).resolves.toBeNull()
    expect(uni.showToast).toHaveBeenCalledWith({ title: '图片加载失败', icon: 'none' })
  })

  it('防重入：上一次未结算时，新 open 会以 null 结算旧 Promise', async () => {
    const wrapper = mountPopup()
    const first = await open(wrapper, 'https://example.com/1.jpg')
    const second = await open(wrapper, 'https://example.com/2.jpg')

    await expect(first.promise).resolves.toBeNull()

    const cropper = findCropper(wrapper)
    expect(cropper.props('imgSrc')).toBe('https://example.com/2.jpg')
    cropper.vm.$emit('confirm', { tempFilePath: 'blob:2', width: 2, height: 2 })
    await expect(second.promise).resolves.toEqual({ tempFilePath: 'blob:2', width: 2, height: 2 })
  })

  it('h5 下 blob: 图源先转 data: 再交给裁剪组件', async () => {
    const blob = new Blob(['img'], { type: 'image/jpeg' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountPopup()
    await open(wrapper, 'blob:http://localhost/abc')

    // jsdom 的 FileReader load 事件需要额外的宏任务轮次，轮询等待转换完成
    for (let i = 0; i < 30; i++) {
      if (String(findCropper(wrapper).props('imgSrc')).startsWith('data:'))
        break
      await flushPromises()
    }

    expect(findCropper(wrapper).props('imgSrc')).toMatch(/^data:/)
  })

  it('非 blob: 图源不做转换直接透传', async () => {
    const wrapper = mountPopup()
    await open(wrapper, 'https://example.com/a.jpg')

    expect(findCropper(wrapper).props('imgSrc')).toBe('https://example.com/a.jpg')
  })
})
