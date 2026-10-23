import { getActivityById } from '../database/repositories/activities'
import {
  deleteFollow,
  insertFollow,
  listFollowedActivities,
  listFollowedUsers
} from '../database/repositories/follows'
import { getUserById } from '../database/repositories/users'
import type { FollowTargetTypeValue } from '../schemas/follow'
import { createApiError } from './errors'

/** 关注活动：活动不存在 404；重复关注幂等。 */
export async function followActivity(activityId: string, userId: string) {
  const activity = await getActivityById(activityId)
  if (!activity)
    throw createApiError('NOT_FOUND', { message: '活动不存在' })
  await insertFollow(userId, 'activity', activityId)
  return { followed: true }
}

/** 取关活动：幂等，未关注也返回成功。 */
export async function unfollowActivity(activityId: string, userId: string) {
  await deleteFollow(userId, 'activity', activityId)
  return { followed: false }
}

/** 关注用户：不能关注自己（422）；目标不存在/封禁 404；重复幂等。 */
export async function followUser(targetUserId: string, viewerId: string) {
  if (targetUserId === viewerId)
    throw createApiError('VALIDATION_ERROR', { message: '不能关注自己' })
  const target = await getUserById(targetUserId)
  if (!target || target.banned)
    throw createApiError('NOT_FOUND', { message: '用户不存在' })
  await insertFollow(viewerId, 'user', targetUserId)
  return { followed: true }
}

/** 取关用户：幂等。 */
export async function unfollowUser(targetUserId: string, viewerId: string) {
  await deleteFollow(viewerId, 'user', targetUserId)
  return { followed: false }
}

/** 我关注的列表分发（活动/用户各自投影与 join 过滤）。 */
export async function listMyFollows(
  userId: string,
  type: FollowTargetTypeValue,
  page: number,
  pageSize: number
) {
  const limit = pageSize
  const offset = (page - 1) * pageSize
  if (type === 'activity')
    return listFollowedActivities(userId, limit, offset)
  return listFollowedUsers(userId, limit, offset)
}
