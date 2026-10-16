import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../client'
import {
  notification as notificationTable,
  type notification,
  type NotificationTargetType,
  type NotificationType
} from '../schema'

export type NotificationRow = typeof notification.$inferSelect

export interface NewNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  targetType: NotificationTargetType | null
  targetId: string | null
  data: Record<string, unknown>
}

export interface NotificationListParams {
  userId: string
  unreadOnly: boolean
  limit: number
  offset: number
}

/** 批量投递（一条多值 INSERT；活动规模小无需分批）。 */
export async function insertNotificationsBulk(inputs: NewNotificationInput[]): Promise<void> {
  if (inputs.length === 0) return
  await db.insert(notificationTable).values(inputs)
}

/** 通知列表（本人，created_at DESC）+ 总数（未读筛选时为未读总数）。 */
export async function listNotifications(
  params: NotificationListParams
): Promise<{ rows: NotificationRow[], total: number }> {
  const filters = [
    eq(notificationTable.userId, params.userId),
    params.unreadOnly ? isNull(notificationTable.readAt) : undefined
  ]
  const where = and(...filters)

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(notificationTable)
      .where(where)
      .orderBy(desc(notificationTable.createdAt))
      .limit(params.limit)
      .offset(params.offset),
    db.select({ value: count() }).from(notificationTable).where(where)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

/** 本人未读数（高频轮询点，走 notification_user_unread_idx 部分索引）。 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(notificationTable)
    .where(and(eq(notificationTable.userId, userId), isNull(notificationTable.readAt)))
  return Number(rows[0]?.value ?? 0)
}

/**
 * 标记单条已读（幂等：已读再调仍返回该行，且保留首次 readAt）。
 * 必须带 userId 匹配，他人通知返回 null（路由据此 404，不暴露存在性）。
 */
export async function markNotificationRead(
  id: string,
  userId: string
): Promise<NotificationRow | null> {
  // 仅未读行更新，保留首次已读时间
  const updated = await db
    .update(notificationTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationTable.id, id),
        eq(notificationTable.userId, userId),
        isNull(notificationTable.readAt)
      )
    )
    .returning()
  if (updated[0]) return updated[0]
  // 区分「此前已读（幂等成功）」与「不存在/他人记录（404）」
  const existing = await db
    .select()
    .from(notificationTable)
    .where(and(eq(notificationTable.id, id), eq(notificationTable.userId, userId)))
    .limit(1)
  return existing[0] ?? null
}

/** 全部已读，返回本次变为已读的条数。 */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await db
    .update(notificationTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationTable.userId, userId), isNull(notificationTable.readAt)))
    .returning({ id: notificationTable.id })
  return rows.length
}
