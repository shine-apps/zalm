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
