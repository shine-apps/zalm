import type { PointsCategory, PointsSource } from '../database/schema'
import type {
  AdminLedgerJoinRow,
  LedgerJoinRow
} from '../database/repositories/points'

/** 动态流 join 行的结构输入（与 repository 的 LedgerJoinRow 同构）。 */
export interface FeedJoinInput {
  id: string
  userId: string
  points: number
  category: PointsCategory
  source: PointsSource
  activityId: string | null
  registrationId: string | null
  donationKind: 'money' | 'goods' | null
  note: string
  createdBy: string | null
  reversalOf: string | null
  createdAt: Date
  userName: string
  userImage: string | null
  activityTitle: string | null
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
  donationKind: 'money' | 'goods' | null
  createdAt: string
}

/** 全站动态：字段白名单，结构上不含 note / registrationId（捐献金额与物资名不可能泄露）。 */
export function toFeedItem(row: FeedJoinInput): PointsFeedItem {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    points: row.points,
    category: row.category,
    source: row.source,
    activityTitle: row.category === 'activity' ? row.activityTitle : null,
    donationKind: row.category === 'donation' ? row.donationKind : null,
    createdAt: row.createdAt.toISOString()
  }
}

export interface LedgerViewItem {
  id: string
  points: number
  category: PointsCategory
  source: PointsSource
  activityId: string | null
  donationKind: 'money' | 'goods' | null
  note: string
  reversalOf: string | null
  activityTitle: string | null
  createdAt: string
}

/** 本人明细：保留 note（本人有权看自己的金额/物资备注）。 */
export function toLedgerView(row: LedgerJoinRow): LedgerViewItem {
  return {
    id: row.id,
    points: row.points,
    category: row.category,
    source: row.source,
    activityId: row.activityId,
    donationKind: row.donationKind,
    note: row.note,
    reversalOf: row.reversalOf,
    activityTitle: row.activityTitle,
    createdAt: row.createdAt.toISOString()
  }
}

/** 后台审计视图：在本人明细基础上保留用户/操作人信息。 */
export function toAdminLedgerView(row: AdminLedgerJoinRow) {
  return {
    ...toLedgerView(row),
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    userPhone: row.userPhone,
    createdBy: row.createdBy,
    operatorName: row.operatorName,
    reversalId: row.reversalId
  }
}

export function isReversal(row: { source: string }): boolean {
  return row.source === 'reversal'
}

export function buildReversalNote(originalNote: string, reason: string): string {
  const note = originalNote.trim()
  return `冲正：${note ? note : '（原记录无备注）'}；原因：${reason.trim()}`
}

const SOURCE_LABELS: Record<PointsSource, string> = {
  checkin: '签到奖励',
  manual_activity: '活动补录',
  manual_donation: '捐献录入',
  reversal: '冲正'
}

export function sourceLabel(source: PointsSource): string {
  return SOURCE_LABELS[source]
}
