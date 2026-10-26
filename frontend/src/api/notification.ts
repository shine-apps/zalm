import type { Paged } from './activity'
import { http } from '@/http/alova'

/** 通知事件码（与后端 NOTIFICATION_TYPES 对齐；列表只按通用通知渲染，不做业务分支）。 */
export type NotificationType
  = | 'activity.registered'
    | 'activity.checked_in'
    | 'activity.cancelled'
    | 'activity.updated'
    | 'verification.approved'
    | 'verification.rejected'

/** 通知跳转对象类型。 */
export type NotificationTargetType = 'activity'

/** 通知视图（与后端 toNotificationView 对齐）。 */
export interface NotificationView {
  id: string
  type: NotificationType | (string & {})
  title: string
  body: string
  targetType: NotificationTargetType | null
  targetId: string | null
  data: Record<string, unknown>
  readAt: string | null
  createdAt: string
  isRead: boolean
}

export interface NotificationListParams {
  page: number
  pageSize: number
  /** true=仅未读；缺省=全部 */
  unread?: boolean
}

/** 我的通知列表（分页，新→旧）。 */
export function listNotifications(
  params: NotificationListParams,
): Promise<Paged<NotificationView>> {
  return http.Get('/notifications', {
    params: {
      page: params.page,
      pageSize: params.pageSize,
      unread: params.unread ? 'true' : undefined,
    },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<NotificationView>>
}

/** 未读数（静默：401/失败不 toast、不跳登录，供启动与切前台调用）。 */
export function getUnreadCount(): Promise<{ count: number }> {
  return http.Get('/notifications/unread-count', {
    meta: { skipAuthRedirect: true, toast: false },
  }) as unknown as Promise<{ count: number }>
}

/** 标记单条已读（幂等）。 */
export function markNotificationRead(id: string): Promise<{ id: string, readAt: string | null }> {
  return http.Post(`/notifications/${id}/read`) as unknown as Promise<{
    id: string
    readAt: string | null
  }>
}

/** 全部已读，返回 { updated }。 */
export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return http.Post('/notifications/read-all') as unknown as Promise<{ updated: number }>
}
