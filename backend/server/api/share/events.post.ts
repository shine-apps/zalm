import { db } from '../../database/client'
import { shareEvent } from '../../database/schema'
import { shareEventBodySchema } from '../../schemas/share'
import type { SessionUser } from '../../utils/auth-context'

/**
 * 公开端点：分享行为埋点上报（游客可上报）。
 * POST /api/share/events
 * 中间件对本路径软挂会话：登录用户自动记录 actorUserId，游客为 null。
 */
export default defineEventHandler(async (event) => {
  const body = await parseBody(event, shareEventBodySchema)
  const actorUserId = (event.context.user as SessionUser | undefined)?.id ?? null

  await db.insert(shareEvent).values({
    actorUserId,
    platform: body.platform,
    page: body.page,
    targetType: body.targetType ?? null,
    targetId: body.targetId ?? null,
    channel: body.channel ?? null,
    event: body.event,
    shareUrl: body.shareUrl ?? null,
    panelId: body.panelId ?? null,
    extra: body.extra ?? {}
  })

  // 埋点是旁路能力：统一 202 语义，前端不关心响应体
  setResponseStatus(event, 202)
  return ok({ accepted: true })
})
