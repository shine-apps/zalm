import type { MyRegistrationItem } from './activity'
import type { PaginationMeta, PointsOverview } from './points'
import { http } from '@/http/alova'

/** 公开用户资料（隐私安全字段：id, name, image, createdAt, roles）。 */
export interface PublicUserProfile {
  id: string
  name: string
  image: string | null
  createdAt: string
  roles: string[]
}

export interface Paged<T> {
  data: T[]
  pagination: PaginationMeta
}

/** GET /api/users/:id — 公开用户主页基础信息。 */
export function getUserProfile(userId: string): Promise<PublicUserProfile> {
  return http.Get(`/users/${userId}`) as unknown as Promise<PublicUserProfile>
}

/** GET /api/users/:id/points — 公开积分数据。 */
export function getUserPoints(userId: string): Promise<PointsOverview> {
  return http.Get(`/users/${userId}/points`) as unknown as Promise<PointsOverview>
}

/** GET /api/users/:id/registrations — 某用户活动参与记录（分页）。 */
export function getUserRegistrations(
  userId: string,
  page: number,
  pageSize = 10,
): Promise<Paged<MyRegistrationItem>> {
  return http.Get(`/users/${userId}/registrations`, {
    params: { page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<MyRegistrationItem>>
}
