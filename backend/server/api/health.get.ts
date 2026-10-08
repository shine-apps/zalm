/** 公开健康检查（不查库、不鉴权）。 */
export default defineEventHandler(() =>
  ok({
    status: 'ok',
    service: 'zhongailianmeng-backend',
    time: new Date().toISOString()
  }))
