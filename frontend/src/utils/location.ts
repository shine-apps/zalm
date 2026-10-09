export type { ActivityLocation } from '@/api/activity'
// eslint-disable-next-line import/first -- 首行保留 re-export，兼容测试从 './location' 导入类型
import type { ActivityLocation } from '@/api/activity'

/** 经纬度成对存在且为有限数。 */
export function hasCoordinates(
  loc: ActivityLocation,
): loc is ActivityLocation & { latitude: number, longitude: number } {
  return (
    typeof loc.latitude === 'number'
    && typeof loc.longitude === 'number'
    && Number.isFinite(loc.latitude)
    && Number.isFinite(loc.longitude)
  )
}

/** GCJ-02 坐标保留 6 位小数（约 0.1m）。 */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

export type ChooseLocationResult
  = | { ok: true, location: ActivityLocation }
    | { ok: false, cancelled: boolean, message: string }

/**
 * 调起系统选点页（uni.chooseLocation）的唯一封装：
 * - 成功返回标准化位置（名称/地址兜底互补，坐标保留 6 位）；
 * - 用户取消：{ ok:false, cancelled:true }，调用方静默；
 * - 授权/key/接口失败：{ ok:false, cancelled:false,message }，页面提示并引导手动填写。
 * 页面不要直接调 uni.chooseLocation。
 */
export function chooseActivityLocation(): Promise<ChooseLocationResult> {
  return new Promise((resolve) => {
    uni.chooseLocation({
      success: (res) => {
        const name = (res.name || '').trim() || (res.address || '').trim() || '已选位置'
        const address = (res.address || '').trim() || name
        resolve({
          ok: true,
          location: {
            name: name.slice(0, 100),
            address: address.slice(0, 200),
            latitude: round6(res.latitude),
            longitude: round6(res.longitude),
          },
        })
      },
      fail: (err) => {
        const msg = String(err?.errMsg ?? '')
        if (msg.includes('cancel')) {
          resolve({ ok: false, cancelled: true, message: '' })
          return
        }
        resolve({
          ok: false,
          cancelled: false,
          message: '无法打开地图选点，请检查定位授权，或直接手动填写地点名称与地址',
        })
      },
    })
  })
}

/** H5 导航用的腾讯地图 marker URI；无坐标返回 ''。 */
export function buildMarkerUri(loc: ActivityLocation): string {
  if (!hasCoordinates(loc))
    return ''
  const coord = `coord:${loc.latitude},${loc.longitude}`
  const query = [
    `marker=${coord};title=${encodeURIComponent(loc.name)};addr=${encodeURIComponent(loc.address)}`,
    'referer=%E4%BC%97%E7%88%B1%E8%81%94%E7%9B%9F',
  ].join('&')
  return `https://apis.map.qq.com/uri/v1/marker?${query}`
}

/**
 * 详情页「导航」：
 * - 小程序/App：uni.openLocation 打开内置地图（坐标为 GCJ-02，与微信/高德体系一致）；
 * - H5：新窗口打开腾讯地图 marker URI；
 * - 无坐标：toast 提示。
 */
export function openActivityNavigation(loc: ActivityLocation): void {
  if (!hasCoordinates(loc)) {
    uni.showToast({ title: '该活动未提供坐标，无法导航', icon: 'none' })
    return
  }
  // #ifdef H5
  const uri = buildMarkerUri(loc)
  if (typeof window !== 'undefined')
    window.open(uri, '_blank')
  // #endif
  // #ifndef H5
  uni.openLocation({
    latitude: loc.latitude,
    longitude: loc.longitude,
    name: loc.name,
    address: loc.address,
  })
  // #endif
}
