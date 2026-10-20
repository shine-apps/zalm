import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumePendingCrop,
  CROP_PAGE_URL,
  cropImage,
  settleCrop,
} from './img-crop'
import type { CropResult } from './img-crop'

/** 安装 navigateTo mock，并返回最近一次调用的入参。 */
function captureNavigateTo() {
  let captured: UniApp.NavigateToOptions | undefined
  vi.mocked(uni.navigateTo).mockImplementation((options) => {
    captured = options
    return undefined as never
  })
  return {
    getOptions: (): UniApp.NavigateToOptions => {
      if (!captured)
        throw new Error('uni.navigateTo 未被调用')
      return captured
    },
  }
}

describe('cropImage', () => {
  beforeEach(() => {
    vi.mocked(uni.navigateTo).mockReset()
  })

  it('写入模块级待裁剪数据并跳转到裁剪页', () => {
    const nav = captureNavigateTo()
    cropImage('blob:mock-image', '16:9')

    const options = nav.getOptions()
    expect(options.url).toBe(CROP_PAGE_URL)
    // 新实现不再依赖 events 参数
    expect(options.events).toBeUndefined()

    // 裁剪页能读取到参数
    expect(consumePendingCrop()).toEqual({ src: 'blob:mock-image', aspectRatio: '16:9' })
    // 消费后清空
    expect(consumePendingCrop()).toBeNull()
  })

  it('navigateTo 失败时清理缓存并 resolve null', async () => {
    const nav = captureNavigateTo()
    const promise = cropImage('blob:mock-image', '1:1')
    const options = nav.getOptions()

    // 此时 pendingCrop 有值
    expect(consumePendingCrop()).toEqual({ src: 'blob:mock-image', aspectRatio: '1:1' })
    // 但 pendingResolver 已注册，需要重置
    cropImage('blob:mock-image', '1:1')
    const nav2 = captureNavigateTo()
    const promise2 = cropImage('blob:mock-image-2', '1:1')
    const opts2 = nav2.getOptions()

    opts2.fail?.({ errMsg: 'navigateTo:fail' })
    await expect(promise2).resolves.toBeNull()
    // 失败后 resolver 被清理，后续 settleCrop 不应再 resolve
  })

  it('完整流程：cropImage → 裁剪页消费 → confirm 回传裁剪产物', async () => {
    const nav = captureNavigateTo()
    const promise = cropImage('blob:mock', '1:1')
    nav.getOptions() // 确认跳转发生

    // 模拟裁剪页 onLoad 消费数据
    const payload = consumePendingCrop()
    expect(payload).toEqual({ src: 'blob:mock', aspectRatio: '1:1' })

    // 模拟裁剪页 confirm 回传结果
    const result: CropResult = { tempFilePath: 'blob:cropped', width: 660, height: 660 }
    settleCrop(result)
    await expect(promise).resolves.toEqual(result)
  })

  it('完整流程：cropImage → 裁剪页消费 → cancel 回传 null', async () => {
    const nav = captureNavigateTo()
    const promise = cropImage('blob:mock', '1:1')
    nav.getOptions()

    consumePendingCrop()
    settleCrop(null)
    await expect(promise).resolves.toBeNull()
  })

  it('consumePendingCrop 消费后立即清空，防止二次消费', () => {
    const nav = captureNavigateTo()
    cropImage('blob:foo', '3:2')
    nav.getOptions()

    expect(consumePendingCrop()).not.toBeNull()
    expect(consumePendingCrop()).toBeNull()
  })
})
