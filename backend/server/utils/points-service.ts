import { db } from '../database/client'
import { getActivityById, type DbExecutor } from '../database/repositories/activities'
import {
  getLedgerById,
  getReversalOf,
  getUserPoints,
  getUserPointsForUpdate,
  insertLedger,
  listAllLedger,
  listFeed,
  listLeaderboard,
  listMyLedger,
  upsertPointsDelta,
  type PointsDimension,
  type PointsLedgerRow
} from '../database/repositories/points'
import { getUserById } from '../database/repositories/users'
import type { ManualPointsBody } from '../schemas/points'
import { createApiError } from './errors'
import {
  buildReversalNote,
  isReversal,
  toAdminLedgerView,
  toFeedItem,
  toLedgerView
} from './points-views'

// ===== 签到自动发分 =====

/**
 * 签到事务内调用：仅当流水实际插入（registration_id 唯一索引放行）时累加汇总。
 * points=0 的活动不写流水。
 */
export async function awardCheckinPoints(
  tx: DbExecutor,
  input: { registrationId: string, userId: string, activityId: string, points: number }
): Promise<PointsLedgerRow | null> {
  if (input.points <= 0) return null
  const row = await insertLedger(
    {
      userId: input.userId,
      points: input.points,
      category: 'activity',
      source: 'checkin',
      activityId: input.activityId,
      registrationId: input.registrationId,
      createdBy: null
    },
    tx,
    { ignoreRegistrationConflict: true }
  )
  if (!row) return null // 重复签到/补签：唯一索引冲突，不重复加分
  await upsertPointsDelta(input.userId, 'activity', input.points, tx)
  return row
}

// ===== 手工录入 =====

export async function awardManualPoints(
  body: ManualPointsBody,
  operatorId: string
): Promise<PointsLedgerRow> {
  const target = await getUserById(body.userId)
  if (!target) throw createApiError('NOT_FOUND', { message: '用户不存在' })

  if (body.category === 'activity') {
    const activity = await getActivityById(body.activityId!)
    if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })
  }

  return db.transaction(async (tx) => {
    const row = await insertLedger(
      {
        userId: body.userId,
        points: body.points,
        category: body.category,
        source: body.category === 'activity' ? 'manual_activity' : 'manual_donation',
        activityId: body.category === 'activity' ? body.activityId! : null,
        donationKind: body.category === 'donation' ? body.donationKind! : null,
        note: body.note,
        createdBy: operatorId,
        createdAt: body.createdAt
      },
      tx
    )
    await upsertPointsDelta(body.userId, body.category, body.points, tx)
    return row!
  })
}

// ===== 冲正 =====

export async function reverseLedger(
  originalId: string,
  reason: string,
  operatorId: string
): Promise<PointsLedgerRow> {
  const original = await getLedgerById(originalId)
  if (!original) throw createApiError('NOT_FOUND', { message: '积分记录不存在' })
  if (isReversal(original)) {
    throw createApiError('VALIDATION_ERROR', { message: '冲正记录不能再次冲正' })
  }
  if (await getReversalOf(originalId)) {
    throw createApiError('CONFLICT', { message: '该记录已冲正' })
  }

  try {
    return await db.transaction(async (tx) => {
      // 锁定汇总行后复检余额：把同一用户的并发冲正串行化，杜绝检查与扣减之间的 TOCTOU
      const summary = await getUserPointsForUpdate(tx, original.userId)
      const net = original.category === 'activity' ? summary?.activityPoints : summary?.donationPoints
      if (summary === null || (net ?? 0) < original.points) {
        throw createApiError('CONFLICT', { message: '该用户当前积分余额不足，无法冲正' })
      }
      const row = await insertLedger(
        {
          userId: original.userId,
          points: -original.points,
          category: original.category,
          source: 'reversal',
          activityId: original.activityId,
          donationKind: original.donationKind,
          note: buildReversalNote(original.note, reason),
          createdBy: operatorId,
          reversalOf: original.id
        },
        tx
      )
      await upsertPointsDelta(original.userId, original.category, -original.points, tx)
      return row!
    })
  } catch (err) {
    // 并发冲正：两个请求同时通过 getReversalOf 预检，(reversal_of) 部分唯一索引兜底
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
      throw createApiError('CONFLICT', { message: '该记录已冲正' })
    }
    throw err
  }
}

// ===== 读侧 =====

export async function getMyPointsOverview(userId: string) {
  const summary = await getUserPoints(userId)
  const activityPoints = summary?.activityPoints ?? 0
  const donationPoints = summary?.donationPoints ?? 0
  return { activityPoints, donationPoints, total: activityPoints + donationPoints }
}

export async function getLeaderboardView(input: {
  dimension: PointsDimension
  page: number
  pageSize: number
  viewerId: string
}) {
  const { rows, total } = await listLeaderboard(input.dimension, {
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  })
  const data = rows.map((r, i) => ({
    rank: (input.page - 1) * input.pageSize + i + 1,
    ...r,
    isMe: r.userId === input.viewerId
  }))
  return { data, total }
}

export async function getFeedView(input: {
  category?: 'activity' | 'donation'
  page: number
  pageSize: number
}) {
  const { rows, total } = await listFeed(input.category, {
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  })
  return { data: rows.map(toFeedItem), total }
}

export async function getMyLedgerView(input: {
  userId: string
  category?: 'activity' | 'donation'
  page: number
  pageSize: number
}) {
  const { rows, total } = await listMyLedger(input.userId, input.category, {
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  })
  return { data: rows.map(toLedgerView), total }
}

export async function getAdminLedgerView(input: {
  category?: 'activity' | 'donation'
  source?: 'checkin' | 'manual_activity' | 'manual_donation' | 'reversal'
  keyword?: string
  page: number
  pageSize: number
}) {
  const { rows, total } = await listAllLedger({
    category: input.category,
    source: input.source,
    keyword: input.keyword,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  })
  return { data: rows.map(toAdminLedgerView), total }
}
