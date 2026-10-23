import { http } from '@/http/alova'
import type { ActivityLocation, ActivityStatus } from './activity'
import type { PaginationMeta } from './points'

/** 我关注的活动卡片（后端 inner join 后裁剪的字段）。 */
export interface FollowedActivityCard {
  activityId: string
  title: string
  coverUrl: string | null
  startTime: string
  location: ActivityLocation
  status: ActivityStatus
}

/** 我关注的用户卡片。 */
export interface FollowedUserCard {
  userId: string
  name: string
  image: string | null
}

export interface Paged<T> {
  data: T[]
  pagination: PaginationMeta
}

/** 关注/取关统一返回当前状态（幂等，重复操作不报 409）。 */
export interface FollowToggleResult {
  followed: boolean
}

export function followActivity(id: string): Promise<FollowToggleResult> {
  return http.Post(`/activities/${id}/follow`) as unknown as Promise<FollowToggleResult>
}

export function unfollowActivity(id: string): Promise<FollowToggleResult> {
  return http.Delete(`/activities/${id}/follow`) as unknown as Promise<FollowToggleResult>
}

export function followUser(id: string): Promise<FollowToggleResult> {
  return http.Post(`/users/${id}/follow`) as unknown as Promise<FollowToggleResult>
}

export function unfollowUser(id: string): Promise<FollowToggleResult> {
  return http.Delete(`/users/${id}/follow`) as unknown as Promise<FollowToggleResult>
}

/** 我关注的活动（分页）。 */
export function getFollowedActivities(
  page: number,
  pageSize = 10,
): Promise<Paged<FollowedActivityCard>> {
  return http.Get('/follows', {
    params: { type: 'activity', page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<FollowedActivityCard>>
}

/** 我关注的用户（分页）。 */
export function getFollowedUsers(
  page: number,
  pageSize = 10,
): Promise<Paged<FollowedUserCard>> {
  return http.Get('/follows', {
    params: { type: 'user', page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<FollowedUserCard>>
}
