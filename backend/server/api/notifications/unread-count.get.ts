/** 我的未读通知数（App 启动/切前台时拉取驱动红点）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const count = await countMyUnread(user.id)
  return ok({ count })
})
