/** 全部标记已读，返回本次变为已读的条数。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const updated = await markAllMyNotificationsRead(user.id)
  return ok({ updated })
})
