import type { NewNotificationInput, NotificationRow } from '../database/repositories/notifications'
import {
  countUnreadNotifications,
  insertNotificationsBulk,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../database/repositories/notifications'
import { logger } from './logger'
import type { NotificationDraft } from './notification-content'

// 注意：内容构建纯函数（build*Notifications / diffActivityChanges）保留在
// notification-content.ts 中由业务层直接引入，本文件不再导出，避免 Nuxt
// 对 server/utils 的自动导入产生重复导出告警。

/**
 * 通知唯一投递入口。
 *
 * 本期仅「站内落库」一个渠道；未来接入微信订阅消息/短信时，
 * 在本函数内按用户渠道设置 fan-out，业务侧（activity-service 等）无需改动。
 *
 * 尽力而为语义：调用方一律在**业务事务提交成功后**调用；
 * 投递失败只记日志，不抛错、不回滚业务。
 */
export async function notifyUsers(drafts: NotificationDraft[]): Promise<void> {
  if (drafts.length === 0) return
  const rows: NewNotificationInput[] = drafts.map(draft => ({
    userId: draft.userId,
    type: draft.type,
    title: draft.title,
    body: draft.body,
    targetType: draft.targetType,
    targetId: draft.targetId,
    data: draft.data
  }))
  try {
    await insertNotificationsBulk(rows)
  } catch (error) {
    logger.error('站内通知投递失败', error)
  }
}

// ===== 本人收件箱查询 =====

/** 通知列表视图：追加派生字段 isRead。 */
export function toNotificationView(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    targetType: row.targetType,
    targetId: row.targetId,
    data: row.data,
    readAt: row.readAt,
    createdAt: row.createdAt,
    isRead: row.readAt !== null
  }
}

/** 我的通知（分页，DESC；unreadOnly=true 时仅未读）。 */
export async function listMyNotificationViews(input: {
  userId: string
  unreadOnly: boolean
  page: number
  pageSize: number
}) {
  const { rows, total } = await listNotifications({
    userId: input.userId,
    unreadOnly: input.unreadOnly,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  })
  return { data: rows.map(toNotificationView), total }
}

export function countMyUnread(userId: string): Promise<number> {
  return countUnreadNotifications(userId)
}

/** 标记单条已读；他人/不存在返回 null（路由 404），已读幂等返回该行。 */
export function markMyNotificationRead(id: string, userId: string) {
  return markNotificationRead(id, userId)
}

export function markAllMyNotificationsRead(userId: string) {
  return markAllNotificationsRead(userId)
}
