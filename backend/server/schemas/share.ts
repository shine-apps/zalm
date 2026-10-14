import { z } from 'zod'
import { isJsonValue } from './settings'

/** 分享埋点支持的运行平台（与前端 platform.ts 对齐）。 */
export const SHARE_PLATFORMS = [
  'mp-weixin',
  'wx-h5',
  'mobile-h5',
  'pc-h5',
  'app',
  'unknown'
] as const

/** 分享渠道。 */
export const SHARE_CHANNELS = ['friend', 'timeline', 'copy', 'webshare'] as const

/** 分享行为事件名（与前端 tracker.ts 对齐）。 */
export const SHARE_EVENTS = [
  'panel_open',
  'channel_select',
  'guide_show',
  'copy_success',
  'copy_fail',
  'wx_config_ok',
  'wx_config_fail',
  'mp_share_trigger',
  'mp_share_fail',
  'web_share_success'
] as const

/** 附加字段：JSON 可序列化且序列化后 ≤ 2KB，防止埋点接口被灌入大对象。 */
const extraSchema = z
  .record(z.string(), z.unknown())
  .refine(isJsonValue, { message: 'extra 必须是合法的 JSON 对象' })
  .refine(v => JSON.stringify(v).length <= 2048, { message: 'extra 序列化后不能超过 2KB' })
  .optional()

/** POST /api/share/events 请求体。 */
export const shareEventBodySchema = z
  .object({
    platform: z.enum(SHARE_PLATFORMS),
    // 小程序/H5 页面路由，如 /pages/activity/detail
    page: z.string().trim().min(1).max(128),
    targetType: z.string().trim().min(1).max(64).optional(),
    targetId: z.string().trim().min(1).max(64).optional(),
    channel: z.enum(SHARE_CHANNELS).optional(),
    event: z.enum(SHARE_EVENTS),
    shareUrl: z.string().trim().min(1).max(1024).optional(),
    // 同一次面板会话的关联 id，串联 panel_open → 渠道事件
    panelId: z.string().trim().min(1).max(64).optional(),
    extra: extraSchema
  })
  .strict()

/** GET /api/share/wx-config 查询参数：待签名的当前页面 URL（# 前部分）。 */
export const wxConfigQuerySchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .url('url 必须是合法的 http(s) 地址')
      .refine(u => /^https?:\/\//i.test(u), 'url 必须以 http:// 或 https:// 开头')
  })
  .strict()
