import { getUserPoints } from '../../../database/repositories/points'
import { getUserById } from '../../../database/repositories/users'

/** 公开用户积分总览（排行榜已公开积分体系，此处保持一致口径）。 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createApiError('VALIDATION_ERROR', { message: '缺少用户 id' })

  const user = await getUserById(id)
  if (!user || user.banned)
    throw createApiError('NOT_FOUND', { message: '用户不存在' })

  const points = await getUserPoints(id)
  const activityPoints = points?.activityPoints ?? 0
  const donationPoints = points?.donationPoints ?? 0

  return ok({
    activityPoints,
    donationPoints,
    total: activityPoints + donationPoints
  })
})
