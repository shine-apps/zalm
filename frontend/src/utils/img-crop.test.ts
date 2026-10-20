import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readCroppedImage } from './img-crop'
import type { CropResult } from './img-crop'

const result: CropResult = { tempFilePath: 'blob:cropped', width: 660.4, height: 660.4 }

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('readCroppedImage（H5 分支）', () => {
  it('canvas 临时 URI 经 fetch → Blob → File 转换，尺寸取整', async () => {
    const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) })
    vi.stubGlobal('fetch', fetchMock)

    const data = await readCroppedImage(result)

    expect(fetchMock).toHaveBeenCalledWith('blob:cropped')
    expect(data.file).toBeInstanceOf(File)
    expect(data.name).toMatch(/^cropped-\d+\.jpg$/)
    expect(data.contentType).toBe('image/jpeg')
    expect(data.size).toBe(blob.size)
    expect(data.width).toBe(660)
    expect(data.height).toBe(660)
  })

  it('blob 无 type 时回退 image/jpeg', async () => {
    const blob = new Blob(['x'])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }))

    const data = await readCroppedImage(result)

    expect(data.contentType).toBe('image/jpeg')
  })

  it('fetch 失败抛「裁剪图片读取失败」', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    await expect(readCroppedImage(result)).rejects.toThrow('裁剪图片读取失败')
  })
})
