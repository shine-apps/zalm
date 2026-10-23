import type { MyRegistrationItem } from './activity'
import type { PaginationMeta, PointsOverview } from './points'
import { http } from '@/http/alova'

/** 公开用户资料（隐私安全字段：id, name, image, createdAt, roles, isFollowed）。 */
export interface PublicUserProfile {
  id: string
  name: string
  image: string | null
  createdAt: string
  roles: string[]
  /** 当前查看者是否已关注该用户（游客恒为 false）。 */
  isFollowed: boolean
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

/** 管理端用户搜索候选项（积分录入表单用）。 */
export interface AdminUserOption {
  id: string
  name: string
  phoneNumber: string | null
  email: string
}

/** GET /api/admin/users — 按姓名/手机号搜索用户（仅 admin，取前 8 条）。 */
export function searchAdminUsers(keyword: string): Promise<Paged<AdminUserOption>> {
  return http.Get('/admin/users', {
    params: { keyword, page: 1, pageSize: 8 },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<AdminUserOption>>
}
