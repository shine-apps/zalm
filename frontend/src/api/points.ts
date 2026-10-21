import type { ApiEnvelope } from '@/http/alova'
import { http } from '@/http/alova'

export type PointsDimension = 'total' | 'activity' | 'donation'
export type PointsCategory = 'activity' | 'donation'
export type PointsSource = 'checkin' | 'manual_activity' | 'manual_donation' | 'reversal'
export type DonationKind = 'money' | 'goods'

export interface PointsOverview {
  activityPoints: number
  donationPoints: number
  total: number
}

export interface LeaderboardRow {
  rank: number
  userId: string
  name: string
  image: string | null
  activityPoints: number
  donationPoints: number
  total: number
  isMe: boolean
}

export interface PointsFeedItem {
  id: string
  userId: string
  userName: string
  userImage: string | null
  points: number
  category: PointsCategory
  source: PointsSource
  activityId: string | null
  activityTitle: string | null
  donationKind: DonationKind | null
  createdAt: string
}

export interface LedgerItem {
  id: string
  points: number
  category: PointsCategory
  source: PointsSource
  activityId: string | null
  donationKind: DonationKind | null
  note: string
  reversalOf: string | null
  activityTitle: string | null
  createdAt: string
}

export type PaginationMeta = NonNullable<ApiEnvelope<unknown>['pagination']>
export interface Paged<T> {
  data: T[]
  pagination: PaginationMeta
}

/** 我的积分总览。 */
export function getMyPoints(): Promise<PointsOverview> {
  return http.Get('/points/me') as unknown as Promise<PointsOverview>
}

/** 排行榜（登录可见）。 */
export function getLeaderboard(
  dimension: PointsDimension,
  page: number,
  pageSize = 20,
): Promise<Paged<LeaderboardRow>> {
  return http.Get('/points/leaderboard', {
    params: { dimension, page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<LeaderboardRow>>
}

/** 全站近期积分动态（捐献记录不含金额/物资/备注）。 */
export function getPointsFeed(
  page: number,
  category?: PointsCategory,
  pageSize = 20,
): Promise<Paged<PointsFeedItem>> {
  return http.Get('/points/feed', {
    params: { page, pageSize, ...(category ? { category } : {}) },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<PointsFeedItem>>
}

/** 我的积分明细（含本人备注）。 */
export function getMyLedger(
  page: number,
  category?: PointsCategory,
  pageSize = 20,
): Promise<Paged<LedgerItem>> {
  return http.Get('/points/me/ledger', {
    params: { page, pageSize, ...(category ? { category } : {}) },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<LedgerItem>>
}

// —— 积分管理（仅 admin，复用 PC 后台同款接口） ——

/** 管理端全量流水行（含备注/操作人，仅 admin 可见）。 */
export interface AdminLedgerRow {
  id: string
  userId: string
  userName: string
  userImage: string | null
  userPhone: string | null
  points: number
  category: PointsCategory
  source: PointsSource
  activityId: string | null
  activityTitle: string | null
  donationKind: DonationKind | null
  note: string
  reversalOf: string | null
  operatorName: string | null
  reversalId: string | null
  createdAt: string
}

/** 录入活动积分时的活动下拉候选项。 */
export interface ActivityPickerItem {
  id: string
  title: string
  startTime: string
  status: string
  points: number
}

/** 手工录入积分 body（activity→activityId、donation→donationKind 二选一）。 */
export interface ManualPointsPayload {
  category: PointsCategory
  userId: string
  points: number
  activityId?: string
  donationKind?: DonationKind
  note?: string
  createdAt?: string
}

/** 全量积分流水（分页 + 类别/来源/关键词筛选）。 */
export function getAdminLedger(
  page: number,
  opts: { category?: PointsCategory, source?: PointsSource, keyword?: string } = {},
  pageSize = 20,
): Promise<Paged<AdminLedgerRow>> {
  return http.Get('/admin/points/ledger', {
    params: {
      page,
      pageSize,
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.source ? { source: opts.source } : {}),
      ...(opts.keyword ? { keyword: opts.keyword } : {}),
    },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<AdminLedgerRow>>
}

/** 管理员手工录入积分（活动补录 / 捐献录入）。 */
export function createManualPoints(payload: ManualPointsPayload): Promise<unknown> {
  return http.Post('/admin/points', payload) as unknown as Promise<unknown>
}

/** 冲正一条积分流水（生成等额负流水）。 */
export function reversePointsLedger(id: string, reason: string): Promise<unknown> {
  return http.Post(`/admin/points/${id}/reverse`, { reason }) as unknown as Promise<unknown>
}

/** 活动下拉候选（最近 30 条，可按标题搜索）。 */
export function getActivitiesForPicker(keyword?: string): Promise<ActivityPickerItem[]> {
  return http.Get('/admin/points/activities', {
    params: keyword ? { keyword } : {},
  }) as unknown as Promise<ActivityPickerItem[]>
}
