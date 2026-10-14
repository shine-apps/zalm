import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CROP_EVENT_CANCEL,
  CROP_EVENT_CONFIRM,
  CROP_EVENT_START,
  CROP_PAGE_URL,
  cropImage,
} from './img-crop'
import type { CropResult } from './img-crop'

/** 安装 navigateTo mock，并在 cropImage 实际调用后取回入参。 */
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

/** 模拟 navigateTo 成功，返回一个可观察 emit 的假 eventChannel。 */
function fakeSuccess(options: UniApp.NavigateToOptions) {
  const emit = vi.fn()
  options.success?.({
    errMsg: 'navigateTo:ok',
    eventChannel: { emit },
  } as unknown as UniApp.NavigateToSuccessOptions)
  return emit
}

function emitEvent(options: UniApp.NavigateToOptions, event: string, data?: unknown) {
  const events = options.events as Record<string, (data?: unknown) => void>
  events[event](data)
}

describe('cropImage', () => {
  beforeEach(() => {
    vi.mocked(uni.navigateTo).mockReset()
  })

  it('跳转到裁剪页，成功时通过 eventChannel 发送图片源与宽高比', async () => {
    const nav = captureNavigateTo()
    const promise = cropImage('blob:mock-image', '16:9')

    const options = nav.getOptions()
    expect(options.url).toBe(CROP_PAGE_URL)
    const emit = fakeSuccess(options)
    expect(emit).toHaveBeenCalledWith(CROP_EVENT_START, {
      src: 'blob:mock-image',
      aspectRatio: '16:9',
    })

    const result: CropResult = { tempFilePath: 'blob:cropped', width: 660, height: 372 }
    emitEvent(options, CROP_EVENT_CONFIRM, result)
    await expect(promise).resolves.toEqual(result)
  })

  it('裁剪页回传取消时 resolve null', async () => {
    const nav = captureNavigateTo()
    const promise = cropImage('blob:mock-image', '1:1')
    const options = nav.getOptions()
    fakeSuccess(options)

    emitEvent(options, CROP_EVENT_CANCEL)
    await expect(promise).resolves.toBeNull()
  })

  it('navigateTo 失败时 resolve null（不抛错）', async () => {
    const nav = captureNavigateTo()
    const promise = cropImage('blob:mock-image', '1:1')
    const options = nav.getOptions()

    options.fail?.({ errMsg: 'navigateTo:fail' })
    await expect(promise).resolves.toBeNull()
  })
})
