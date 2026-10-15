import type { ActivityCategory, ActivityView } from './activity'
import { http } from '@/http/alova'

/** 首页近期风采项（轮播纯图片：相册首图或封面）。 */
export interface HomeHighlight {
  id: string
  title: string
  endTime: string
  categories: ActivityCategory[]
  imageUrl: string
  imageSource: 'album' | 'cover'
}

/** GET /home 响应。recruiting 元素与活动列表项同构（游客视角 myRegistration=null）。 */
export interface HomeData {
  highlights: HomeHighlight[]
  recruiting: ActivityView[]
}

/** 首页聚合（游客可读）。 */
export function getHome(): Promise<HomeData> {
  return http.Get('/home') as unknown as Promise<HomeData>
}
