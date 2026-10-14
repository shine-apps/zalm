import { wxConfigQuerySchema } from '../../schemas/share'
import { logger } from '../../utils/logger'
import { buildWxJsSdkSignature, WechatOaConfigError } from '../../utils/wechat-oa'

/**
 * 公开端点：H5 微信 JS-SDK wx.config 签名。
 * GET /api/share/wx-config?url=<location.href 的 # 前部分>
 *
 * 未配置公众号凭证时返回 { enabled:false }，前端据此降级为「右上角引导 + 复制链接」，
 * 不暴露 500/配置细节给访客。
 */
export default defineEventHandler(async (event) => {
  const { url } = parseQuery(event, wxConfigQuerySchema)
  try {
    const config = await buildWxJsSdkSignature(url)
    return ok({ enabled: true, ...config })
  } catch (err) {
    if (err instanceof WechatOaConfigError) {
      logger.warn(`[WeChatOA] JS-SDK 不可用：${err.message}`)
      return ok({ enabled: false })
    }
    logger.error({ err }, '[WeChatOA] 生成 JS-SDK 签名失败')
    throw err
  }
})
