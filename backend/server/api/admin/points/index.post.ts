import { manualPointsBodySchema } from '../../../schemas/points'
import { awardManualPoints } from '../../../utils/points-service'

/** 管理员手工录入积分（活动补录 / 捐献录入，仅 admin）。 */
export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const body = await parseBody(event, manualPointsBodySchema)
  const row = await awardManualPoints(body, admin.id)
  setResponseStatus(event, 201)
  return ok(row, body.category === 'activity' ? '活动积分录入成功' : '捐献积分录入成功')
})
