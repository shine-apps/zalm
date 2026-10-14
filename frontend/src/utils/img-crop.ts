/**
 * 图片裁剪页（/pages/tools/img-cropper）的跨页通信与裁剪产物读取。
 *
 * 调用方选图拿到本地 URI（H5 为 blob: URL，小程序为临时文件路径）后调用 cropImage，
 * 用户在裁剪页确认后 resolve 裁剪结果，取消或跳转失败 resolve null。
 * 图片源通过 uni.navigateTo 的 eventChannel 传递（内存对象），
 * 避免 blob:/wxfile: 等本地 URI 走 URL query 的编码与长度问题。
 */

/** 裁剪页路由（vite-plugin-uni-pages 按文件路径自动注册）。 */
export const CROP_PAGE_URL = '/pages/tools/img-cropper'

/** 打开页 → 裁剪页：携带图片源与宽高比。 */
export const CROP_EVENT_START = 'crop:start'
/** 裁剪页 → 打开页：裁剪确认。 */
export const CROP_EVENT_CONFIRM = 'crop:confirm'
/** 裁剪页 → 打开页：用户取消或页面被关闭。 */
export const CROP_EVENT_CANCEL = 'crop:cancel'

/** wd-img-cropper confirm 事件载荷（width/height 为导出像素尺寸）。 */
export interface CropResult {
  tempFilePath: string
  width: number
  height: number
}

/** 发给裁剪页的初始载荷。 */
export interface CropStartPayload {
  src: string
  aspectRatio: string
}

/** 裁剪产物读取后的可上传数据：H5 为 File，小程序为临时路径 + 体积。 */
export interface CroppedImageData {
  /** H5：供 uni.uploadFile(files) 使用 */
  file?: File
  /** 小程序：供 uni.uploadFile(filePath) 使用 */
  path?: string
  /** 文件名（用于申请凭证与登记 metadata.name） */
  name: string
  /** 文件大小（字节） */
  size: number
  /** MIME 类型（裁剪页固定输出 jpg） */
  contentType: string
  /** 图片宽（px） */
  width: number
  /** 图片高（px） */
  height: number
}

/** 与裁剪页 wd-img-cropper 的 file-type 保持一致。 */
const CROP_CONTENT_TYPE = 'image/jpeg'

/**
 * 打开裁剪页并等待裁剪结果。
 * @returns 裁剪确认返回 CropResult；用户取消或跳转失败返回 null
 */
export function cropImage(src: string, aspectRatio: string): Promise<CropResult | null> {
  return new Promise((resolve) => {
    uni.navigateTo({
      url: CROP_PAGE_URL,
      events: {
        [CROP_EVENT_CONFIRM]: (data: CropResult) => resolve(data),
        [CROP_EVENT_CANCEL]: () => resolve(null),
      },
      success: (res) => {
        const payload: CropStartPayload = { src, aspectRatio }
        res.eventChannel.emit(CROP_EVENT_START, payload)
      },
      fail: () => resolve(null),
    })
  })
}

/**
 * 将裁剪页产物读取为可上传数据源：
 * - H5：canvas 临时 URI（blob:/data: 均可能）→ fetch → Blob → File；
 * - 微信小程序：保留临时路径，通过 getFileInfo 获取体积。
 * 读取失败抛错，由调用方提示并中止上传。
 */
export async function readCroppedImage(result: CropResult): Promise<CroppedImageData> {
  const name = `cropped-${Date.now()}.jpg`
  const width = Math.round(result.width)
  const height = Math.round(result.height)

  let data: CroppedImageData | undefined
  // #ifdef H5
  data = await readCroppedImageH5(result.tempFilePath, name, width, height)
  // #endif
  // #ifdef MP-WEIXIN
  data = await readCroppedImageMp(result.tempFilePath, name, width, height)
  // #endif
  if (!data)
    throw new Error('当前平台暂不支持图片裁剪上传')
  return data
}

// #ifdef H5
async function readCroppedImageH5(
  tempFilePath: string,
  name: string,
  width: number,
  height: number,
): Promise<CroppedImageData> {
  let blob: Blob
  try {
    // fetch 同时兼容 blob: 与 data: URI
    const resp = await fetch(tempFilePath)
    if (!resp.ok)
      throw new Error(`HTTP ${resp.status}`)
    blob = await resp.blob()
  }
  catch {
    throw new Error('裁剪图片读取失败')
  }
  const type = blob.type || CROP_CONTENT_TYPE
  const file = new File([blob], name, { type })
  return { file, name, size: file.size, contentType: type, width, height }
}
// #endif

// #ifdef MP-WEIXIN
function readCroppedImageMp(
  tempFilePath: string,
  name: string,
  width: number,
  height: number,
): Promise<CroppedImageData> {
  return new Promise((resolve, reject) => {
    uni.getFileInfo({
      filePath: tempFilePath,
      success: (res) => {
        resolve({
          path: tempFilePath,
          name,
          size: res.size,
          contentType: CROP_CONTENT_TYPE,
          width,
          height,
        })
      },
      fail: () => reject(new Error('裁剪图片读取失败')),
    })
  })
}
// #endif
