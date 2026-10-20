/**
 * 图片裁剪页（/pages/tools/img-cropper）的跨页通信与裁剪产物读取。
 *
 * 调用方选图拿到本地 URI（H5 为 blob: URL，小程序为临时文件路径）后调用 cropImage，
 * 用户在裁剪页确认后 resolve 裁剪结果，取消或跳转失败 resolve null。
 *
 * 使用模块级变量 pendingCrop / pendingResolver 在调用方和裁剪页之间传递数据，
 * 避免 uni.navigateTo eventChannel 在 H5 环境下因路由时序问题导致事件丢失
 * （emit 写入旧 meta.eventChannel 实例的缓存，on 监听新实例，两端完全断开）。
 */

/** 裁剪页路由（vite-plugin-uni-pages 按文件路径自动注册）。 */
export const CROP_PAGE_URL = '/pages/tools/img-cropper'

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

/** 裁剪页 resolve 回调类型。 */
export type CropResolver = (result: CropResult | null) => void

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

// —— 模块级跨页通信容器 ——

/** 调用方写入 → 裁剪页 onLoad 读取。 */
let pendingCrop: CropStartPayload | null = null

/** 裁剪完成 → 调用方 Promise resolve。 */
let pendingResolver: CropResolver | null = null

/**
 * 裁剪页读取待处理的裁剪参数。
 * 返回后模块内缓存清空，防止二次消费。
 */
export function consumePendingCrop(): CropStartPayload | null {
  const payload = pendingCrop
  pendingCrop = null
  return payload
}

/**
 * 裁剪页回传结果并清理 resolver。
 * confirm 时传裁剪产物，cancel/onUnload 时传 null。
 */
export function settleCrop(result: CropResult | null): void {
  const resolver = pendingResolver
  pendingResolver = null
  if (resolver)
    resolver(result)
}

/**
 * 打开裁剪页并等待裁剪结果。
 * @returns 裁剪确认返回 CropResult；用户取消或跳转失败返回 null
 */
export function cropImage(src: string, aspectRatio: string): Promise<CropResult | null> {
  return new Promise((resolve) => {
    // 防重入：如果上一次 cropImage 还没结算（如用户快速双击上传），
    // 先以 null 结算旧 Promise，避免悬挂
    if (pendingResolver) {
      pendingResolver(null)
      pendingResolver = null
    }
    // 写入模块级变量，裁剪页 onLoad 后读取
    pendingCrop = { src, aspectRatio }
    pendingResolver = resolve

    uni.navigateTo({
      url: CROP_PAGE_URL,
      fail: () => {
        // 跳转失败，清理缓存并 resolve null
        pendingCrop = null
        pendingResolver = null
        resolve(null)
      },
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
