import { and, count, desc, eq } from 'drizzle-orm'
import { db } from '../client'
import {
  activity as activityTable,
  follow as followTable,
  user as userTable,
  type ActivityLocation,
  type ActivityStatus,
  type FollowTargetType
} from '../schema'
import type { DbExecutor } from './activities'

export type FollowRow = typeof followTable.$inferSelect

/** 我关注的活动卡片（列表投影，不含敏感/冗余字段）。 */
export interface FollowedActivityCard {
  activityId: string
  title: string
  coverUrl: string | null
  startTime: Date
  location: ActivityLocation
  status: ActivityStatus
}

/** 我关注的用户卡片。 */
export interface FollowedUserCard {
  userId: string
  name: string
  image: string | null
}

/** 关注（幂等）：重复关注不报错，保留首次关注时间。 */
export async function insertFollow(
  userId: string,
  targetType: FollowTargetType,
  targetId: string,
  exec: DbExecutor = db
): Promise<void> {
  await exec
    .insert(followTable)
    .values({ userId, targetType, targetId })
    .onConflictDoNothing()
}

/** 取关（幂等）：未关注时静默无操作。 */
export async function deleteFollow(
  userId: string,
  targetType: FollowTargetType,
  targetId: string,
  exec: DbExecutor = db
): Promise<void> {
  await exec
    .delete(followTable)
    .where(
      and(
        eq(followTable.userId, userId),
        eq(followTable.targetType, targetType),
        eq(followTable.targetId, targetId)
      )
    )
}

/** 是否已关注（详情接口附带状态位）。 */
export async function isFollowing(
  userId: string,
  targetType: FollowTargetType,
  targetId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: followTable.id })
    .from(followTable)
    .where(
      and(
        eq(followTable.userId, userId),
        eq(followTable.targetType, targetType),
        eq(followTable.targetId, targetId)
      )
    )
    .limit(1)
  return rows.length > 0
}

/**
 * 我关注的活动（按关注时间倒序）。
 * inner join activity 自然过滤已删除活动产生的孤儿关注记录。
 */
export async function listFollowedActivities(
  userId: string,
  limit: number,
  offset: number
): Promise<{ rows: FollowedActivityCard[], total: number }> {
  const where = and(
    eq(followTable.userId, userId),
    eq(followTable.targetType, 'activity')
  )
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        activityId: activityTable.id,
        title: activityTable.title,
        coverUrl: activityTable.coverUrl,
        startTime: activityTable.startTime,
        location: activityTable.location,
        status: activityTable.status
      })
      .from(followTable)
      .innerJoin(activityTable, eq(activityTable.id, followTable.targetId))
      .where(where)
      .orderBy(desc(followTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(followTable)
      .innerJoin(activityTable, eq(activityTable.id, followTable.targetId))
      .where(where)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

/**
 * 我关注的用户（按关注时间倒序）。
 * inner join user + banned=false 过滤已注销/已封禁目标。
 */
export async function listFollowedUsers(
  userId: string,
  limit: number,
  offset: number
): Promise<{ rows: FollowedUserCard[], total: number }> {
  const where = and(
    eq(followTable.userId, userId),
    eq(followTable.targetType, 'user'),
    eq(userTable.banned, false)
  )
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        userId: userTable.id,
        name: userTable.name,
        image: userTable.image
      })
      .from(followTable)
      .innerJoin(userTable, eq(userTable.id, followTable.targetId))
      .where(where)
      .orderBy(desc(followTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(followTable)
      .innerJoin(userTable, eq(userTable.id, followTable.targetId))
      .where(where)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}
