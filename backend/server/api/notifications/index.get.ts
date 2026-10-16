import { notificationListQuerySchema } from '../../schemas/notification'

/** 我的站内通知列表（分页，created_at DESC；?unread=true 仅未读）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const query = parseQuery(event, notificationListQuerySchema)
  const { data, total } = await listMyNotificationViews({
    userId: user.id,
    unreadOnly: query.unread === 'true',
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, { page: query.page, pageSize: query.pageSize, total })
})
