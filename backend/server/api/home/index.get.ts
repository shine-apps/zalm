/**
 * 首页聚合（游客可读）：近期风采轮播 + 招募中列表。
 * 服务函数经 server/utils 自动导入；响应用普通 { code, data } 信封，无分页。
 */
export default defineEventHandler(async () => {
  return ok(await getHomeView())
})
