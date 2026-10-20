/**
 * 图片裁剪的产物读取工具（配合 img-cropper-popup 组件使用）。
 *
 * 裁剪交互由 <img-cropper-popup> 组件在页内完成（confirm 时返回 CropResult），
 * 本模块只负责把裁剪产物（canvas 导出的临时 URI）读取为可上传的数据源。
 */

/** img-cropper-popup confirm 事件载荷（width/height 为导出像素尺寸）。 */
export interface CropResult {
  tempFilePath: string
  width: number
  height: number
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
  /** MIME 类型（裁剪组件固定输出 jpg） */
  contentType: string
  /** 图片宽（px） */
  width: number
  /** 图片高（px） */
  height: number
}

/** 与 img-cropper-popup 的 file-type 保持一致。 */
const CROP_CONTENT_TYPE = 'image/jpeg'

/**
 * 将裁剪产物读取为可上传数据源：
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
  // !data 守卫：真实构建中两个平台块互斥，恒为 true；仅测试环境（无条件编译）需要
  if (!data)
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
