import type { ApiEnvelope } from '@/http/alova'
import { http } from '@/http/alova'

/** 标准化位置（与后端 activityLocationSchema 对齐，GCJ-02 坐标，可整体为空降级）。 */
export interface ActivityLocation {
  name: string
  address: string
  latitude: number | null
  longitude: number | null
}

/** 活动派生状态（后端按 now 计算，非落库字段）。 */
export type ActivityDerivedState = 'upcoming' | 'ongoing' | 'ended' | 'cancelled'
/** 列表筛选项：active=进行中+未开始，past=已结束，cancelled=已取消。 */
export type ActivityStateFilter = 'active' | 'past' | 'cancelled'
/** 活动落库状态。 */
export type ActivityStatus = 'published' | 'cancelled'

/** 活动分类值域（与后端 ACTIVITY_CATEGORIES 对齐；直接存中文名，展示无需映射）。 */
export const ACTIVITY_CATEGORIES = [
  '爱心物资',
  '助学帮扶',
  '传统文化',
  '乡村振兴',
  '关爱群体',
] as const
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]

export type RegistrationStatus = 'registered' | 'cancelled' | 'checked_in'
export type CheckInMethod = 'scan' | 'manual'

/** 报名记录行（与后端 RegistrationRow 对齐）。 */
export interface RegistrationRow {
  id: string
  activityId: string
  userId: string
  status: RegistrationStatus
  checkInAt: string | null
  checkInMethod: CheckInMethod | null
  checkedInBy: string | null
  createdAt: string
  cancelledAt: string | null
}

/** 活动相册项（后端 toActivityMediaView 裁剪后的白名单字段）。 */
export interface ActivityMediaItem {
  id: string
  url: string
  type: 'image' | 'video'
  description: string
  duration?: number
  width?: number
  height?: number
  createdAt: string
}

/** 活动详情/列表项（后端 toActivityView）。列表与详情同构，游客 myRegistration=null、isFollowed=false。 */
export interface ActivityView {
  id: string
  title: string
  description: string
  coverUrl: string | null
  location: ActivityLocation
  categories: ActivityCategory[]
  startTime: string
  endTime: string
  registerDeadline: string | null
  capacity: number | null
  points: number
  status: ActivityStatus
  state: ActivityDerivedState
  createdBy: string
  createdAt: string
  updatedAt: string
  registeredCount: number
  checkedInCount: number
  remaining: number | null
  myRegistration: RegistrationRow | null
  media: ActivityMediaItem[]
  /** 当前查看者是否已关注（游客恒为 false）。 */
  isFollowed: boolean
}

/** 组织者名单行（join 用户摘要，含完整手机号）。 */
export interface RegistrationWithUser extends RegistrationRow {
  userName: string
  userPhone: string
  userImage: string | null
}

export interface ActivityStats {
  registeredCount: number
  checkedInCount: number
  capacity: number | null
  remaining: number | null
}

export type PaginationMeta = NonNullable<ApiEnvelope<unknown>['pagination']>

/** rawEnvelope 调用解出的分页信封。 */
export interface Paged<T> {
  data: T[]
  pagination: PaginationMeta
}

export interface RegistrationsPage extends Paged<RegistrationWithUser> {
  stats: ActivityStats
}

/** GET /activities/mine/registrations 元素。 */
export interface MyRegistrationItem {
  registration: RegistrationRow
  activity: ActivityView
}

/** POST /activities、PUT /activities/:id 的请求体（PUT 时字段全部可选）。 */
export interface ActivityPayload {
  title: string
  description?: string
  coverUrl?: string | null
  location: ActivityLocation
  categories: ActivityCategory[]
  startTime: string
  endTime: string
  registerDeadline?: string | null
  capacity?: number | null
  points: number
}
export type ActivityUpdatePayload = Partial<ActivityPayload>

export interface ActivityListParams {
  state: ActivityStateFilter
  page: number
  pageSize: number
  keyword?: string
}

// ===== 参与者/公开 =====

/** 活动分页列表（公开）。 */
export function listActivities(params: ActivityListParams): Promise<Paged<ActivityView>> {
  return http.Get('/activities', {
    params,
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<ActivityView>>
}

/** 活动详情（公开；登录响应附 myRegistration）。 */
export function getActivity(id: string): Promise<ActivityView> {
  return http.Get(`/activities/${id}`) as unknown as Promise<ActivityView>
}

/** 报名（幂等；满员/截止/取消 → 409，由拦截器 toast）。 */
export function registerToActivity(id: string): Promise<RegistrationRow> {
  return http.Post(`/activities/${id}/register`) as unknown as Promise<RegistrationRow>
}

/** 开始前取消报名（无记录 404，已签到/已开始 409）。 */
export function cancelMyRegistration(id: string): Promise<RegistrationRow> {
  return http.Post(`/activities/${id}/cancel-registration`) as unknown as Promise<RegistrationRow>
}

/** 自助签到（6 位码；窗外/未报名 409，错码 422，重复签到幂等）。 */
export function checkInActivity(id: string, code: string): Promise<RegistrationRow> {
  return http.Post(`/activities/${id}/check-in`, { code }) as unknown as Promise<RegistrationRow>
}

/** 我的报名（分页）。 */
export function listMyRegistrations(page: number, pageSize = 10): Promise<Paged<MyRegistrationItem>> {
  return http.Get('/activities/mine/registrations', {
    params: { page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<MyRegistrationItem>>
}

// ===== 组织者 =====

/** 发布活动。 */
export function createActivity(payload: ActivityPayload): Promise<ActivityView> {
  return http.Post('/activities', payload) as unknown as Promise<ActivityView>
}

/** 编辑活动（已取消 → 409）。 */
export function updateActivity(id: string, payload: ActivityUpdatePayload): Promise<ActivityView> {
  return http.Put(`/activities/${id}`, payload) as unknown as Promise<ActivityView>
}

/** 取消活动（终态）。 */
export function cancelActivity(id: string): Promise<ActivityView> {
  return http.Post(`/activities/${id}/cancel`) as unknown as Promise<ActivityView>
}

/** 取当前窗口滚动码 {code,expiresAt}。 */
export function getCheckInCode(id: string): Promise<{ code: string, expiresAt: string }> {
  return http.Get(`/activities/${id}/check-in-code`) as unknown as Promise<{ code: string, expiresAt: string }>
}

/** 报名/签到名单 + 统计（含完整手机号）。 */
export function listRegistrations(id: string, page: number, pageSize = 20): Promise<RegistrationsPage> {
  return http.Get(`/activities/${id}/registrations`, {
    params: { page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<RegistrationsPage>
}

/** 现场手动补签。 */
export function manualCheckIn(activityId: string, userId: string): Promise<RegistrationRow> {
  return http.Post(`/activities/${activityId}/manual-check-in`, { userId }) as unknown as Promise<RegistrationRow>
}

// ===== 相册（组织者） =====

/** 绑定媒体到活动相册（重复 409、类型不符 422，拦截器 toast）。 */
export function bindActivityMedia(
  id: string,
  payload: { mediaId: string, description?: string },
): Promise<ActivityMediaItem> {
  return http.Post(`/activities/${id}/media`, payload) as unknown as Promise<ActivityMediaItem>
}

/** 更新相册项描述（空串清空）。 */
export function updateActivityMedia(
  id: string,
  mediaId: string,
  description: string,
): Promise<ActivityMediaItem> {
  return http.Patch(`/activities/${id}/media/${mediaId}`, { description }) as unknown as Promise<ActivityMediaItem>
}

/** 移除相册项（媒体文件保留）。 */
export function removeActivityMedia(id: string, mediaId: string): Promise<void> {
  return http.Delete(`/activities/${id}/media/${mediaId}`) as unknown as Promise<void>
}
