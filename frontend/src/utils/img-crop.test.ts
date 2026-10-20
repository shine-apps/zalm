import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCropPageUrl,
  consumePendingCrop,
  CROP_PAGE_URL,
  cropImage,
  parseCropQuery,
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
    // URL query 同步携带参数作为兜底通道
    expect(options.url).toBe(buildCropPageUrl('blob:mock-image', '16:9'))
    expect(options.url.startsWith(`${CROP_PAGE_URL}?`)).toBe(true)
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

describe('parseCropQuery', () => {
  /** 从 buildCropPageUrl 的产物中提取 query 对象（模拟各平台 onLoad 传入）。 */
  function queryOf(url: string): Record<string, string> {
    return Object.fromEntries(new URLSearchParams(url.slice(url.indexOf('?') + 1)))
  }

  it('还原 buildCropPageUrl 编码的参数（已解码形态）', () => {
    const query = queryOf(buildCropPageUrl('blob:http://localhost/abc-123', '16:9'))
    expect(parseCropQuery(query)).toEqual({
      src: 'blob:http://localhost/abc-123',
      aspectRatio: '16:9',
    })
  })

  it('query 值仍处于编码态时按需解码', () => {
    expect(parseCropQuery({
      src: 'blob%3Ahttp%3A%2F%2Flocalhost%2Fabc-123',
      aspectRatio: '16%3A9',
    })).toEqual({
      src: 'blob:http://localhost/abc-123',
      aspectRatio: '16:9',
    })
  })

  it('已解码且含 % 的合法 src 不会被二次解码', () => {
    expect(parseCropQuery({
      src: 'blob:http://localhost/with%20space.png',
      aspectRatio: '1:1',
    })).toEqual({
      src: 'blob:http://localhost/with%20space.png',
      aspectRatio: '1:1',
    })
  })

  it('缺省或非法参数返回 null / 默认比例', () => {
    expect(parseCropQuery(undefined)).toBeNull()
    expect(parseCropQuery({})).toBeNull()
    expect(parseCropQuery({ src: 'blob:x' })?.aspectRatio).toBe('1:1')
    expect(parseCropQuery({ src: 123 })).toBeNull()
  })
})
