import { createApiError } from './errors'
import { db } from '../database/client'
import {
  getActivityById,
  getActivityStat,
  getActivityStatsMap,
  getRegistration,
  insertActivity,
  insertRegistration,
  listActivities,
  listMyRegistrations,
  listRegistrationsWithUsers,
  lockActivity,
  patchActivity,
  reviveRegistration,
  setActivityStatus,
  setRegistrationCancelled,
  setRegistrationCheckedIn,
  type ActivityRow,
  type ActivityStateFilter,
  type RegistrationRow
} from '../database/repositories/activities'
import type { ActivityCreateBody, ActivityUpdateBody } from '../schemas/activity'
import { collectTimeIssues } from '../schemas/activity'
import { getCurrentCheckinCode, verifyCheckinCode } from './checkin-code'

/** 签到开放提前量：活动开始前 15 分钟。 */
const CHECKIN_LEAD_MS = 15 * 60_000

export type ActivityViewState = 'published' | 'cancelled' | 'ongoing' | 'upcoming' | 'ended'

function deriveState(activity: ActivityRow, now: Date): ActivityViewState {
  if (activity.status === 'cancelled') return 'cancelled'
  if (now < new Date(activity.startTime)) return 'upcoming'
  if (now > new Date(activity.endTime)) return 'ended'
  return 'ongoing'
}

function remaining(capacity: number | null, registeredCount: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - registeredCount)
}

function effectiveDeadline(activity: ActivityRow): Date {
  return activity.registerDeadline ? new Date(activity.registerDeadline) : new Date(activity.startTime)
}

function toActivityView(
  activity: ActivityRow,
  stat: { registeredCount: number, checkedInCount: number },
  now: Date,
  myRegistration: RegistrationRow | null
) {
  return {
    id: activity.id,
    title: activity.title,
    description: activity.description,
    coverUrl: activity.coverUrl,
    location: activity.location,
    categories: activity.categories,
    startTime: activity.startTime,
    endTime: activity.endTime,
    registerDeadline: activity.registerDeadline,
    capacity: activity.capacity,
    status: activity.status,
    state: deriveState(activity, now),
    createdBy: activity.createdBy,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    registeredCount: stat.registeredCount,
    checkedInCount: stat.checkedInCount,
    remaining: remaining(activity.capacity, stat.registeredCount),
    myRegistration
  }
}

async function requireActivity(id: string): Promise<ActivityRow> {
  const activity = await getActivityById(id)
  if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })
  return activity
}

// ===== 查询 =====

export async function listActivityView(input: {
  state: ActivityStateFilter
  keyword?: string
  page: number
  pageSize: number
}) {
  const now = new Date()
  const { rows, total } = await listActivities({
    state: input.state,
    keyword: input.keyword,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
    now
  })
  const statsMap = await getActivityStatsMap(rows.map(r => r.id))
  const data = rows.map(a =>
    toActivityView(a, statsMap.get(a.id) ?? { registeredCount: 0, checkedInCount: 0 }, now, null)
  )
  return { data, total }
}

export async function getActivityDetail(
  id: string,
  viewerId: string | null,
  now: Date = new Date()
) {
  const activity = await requireActivity(id)
  const stat = await getActivityStat(id)
  const myRegistration = viewerId ? await getRegistration(id, viewerId) : null
  return toActivityView(activity, stat, now, myRegistration)
}

// ===== 组织者写操作 =====

export async function publishActivity(input: ActivityCreateBody, userId: string) {
  return insertActivity({
    title: input.title,
    description: input.description,
    coverUrl: input.coverUrl ?? null,
    location: input.location,
    categories: input.categories,
    startTime: input.startTime,
    endTime: input.endTime,
    registerDeadline: input.registerDeadline ?? null,
    capacity: input.capacity ?? null,
    createdBy: userId
  })
}

export async function editActivity(id: string, patch: ActivityUpdateBody) {
  const existing = await requireActivity(id)
  if (existing.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '活动已取消，不能编辑' })
  }

  // 缺省字段从库中补齐后统一校验时间关系
  const issues = collectTimeIssues({
    startTime: patch.startTime ?? new Date(existing.startTime),
    endTime: patch.endTime ?? new Date(existing.endTime),
    registerDeadline:
      patch.registerDeadline === undefined
        ? (existing.registerDeadline ? new Date(existing.registerDeadline) : null)
        : patch.registerDeadline
  })
  if (issues.length) {
    throw createApiError('VALIDATION_ERROR', {
      issues: issues.map(i => ({ path: i.path, message: i.message }))
    })
  }

  if (patch.capacity !== undefined && patch.capacity !== null) {
    const { registeredCount } = await getActivityStat(id)
    if (patch.capacity < registeredCount) {
      throw createApiError('CONFLICT', {
        message: `人数上限不能低于已报名人数（${registeredCount}）`
      })
    }
  }

  const updated = await patchActivity(id, {
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.description !== undefined && { description: patch.description }),
    ...(patch.coverUrl !== undefined && { coverUrl: patch.coverUrl }),
    ...(patch.location !== undefined && { location: patch.location }),
    ...(patch.categories !== undefined && { categories: patch.categories }),
    ...(patch.startTime !== undefined && { startTime: patch.startTime }),
    ...(patch.endTime !== undefined && { endTime: patch.endTime }),
    ...(patch.registerDeadline !== undefined && { registerDeadline: patch.registerDeadline }),
    ...(patch.capacity !== undefined && { capacity: patch.capacity })
  })
  if (!updated) throw createApiError('NOT_FOUND', { message: '活动不存在' })
  return updated
}

export async function cancelActivity(id: string) {
  const existing = await requireActivity(id)
  if (existing.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '活动已取消' })
  }
  const updated = await setActivityStatus(id, 'cancelled')
  return updated!
}

export async function getOrganizerCheckInCode(id: string) {
  await requireActivity(id)
  const { code, expiresAt } = getCurrentCheckinCode(id)
  return { code, expiresAt: expiresAt.toISOString() }
}

export async function getRegistrationListView(id: string, page: number, pageSize: number) {
  const activity = await requireActivity(id)
  const [{ rows, total }, stat] = await Promise.all([
    listRegistrationsWithUsers(id, pageSize, (page - 1) * pageSize),
    getActivityStat(id)
  ])
  return {
    rows,
    total,
    stats: {
      registeredCount: stat.registeredCount,
      checkedInCount: stat.checkedInCount,
      capacity: activity.capacity,
      remaining: remaining(activity.capacity, stat.registeredCount)
    }
  }
}

// ===== 参与者操作 =====

export async function registerToActivity(activityId: string, userId: string, now: Date = new Date()) {
  // 必须把 tx 传给所有 repo 查询：全局 db 走池化连接，不参与本事务（见 DbExecutor 注释）
  return db.transaction(async (tx) => {
    // 先锁活动行，串行化同一活动的容量校验，否则并发 count-then-insert 会超卖
    await lockActivity(activityId, tx)
    const activity = await getActivityById(activityId, tx)
    if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })
    if (activity.status === 'cancelled') {
      throw createApiError('CONFLICT', { message: '活动已取消，无法报名' })
    }
    if (now > effectiveDeadline(activity)) {
      throw createApiError('CONFLICT', { message: '报名已截止' })
    }

    const reg = await getRegistration(activityId, userId, tx)
    if (reg) {
      if (reg.status === 'cancelled') {
        // 复活前重新校验容量
        if (activity.capacity !== null) {
          const { registeredCount } = await getActivityStat(activityId, tx)
          if (registeredCount >= activity.capacity) {
            throw createApiError('CONFLICT', { message: '名额已满' })
          }
        }
        return (await reviveRegistration(reg.id, tx))!
      }
      return reg // registered / checked_in 幂等
    }

    if (activity.capacity !== null) {
      const { registeredCount } = await getActivityStat(activityId, tx)
      if (registeredCount >= activity.capacity) {
        throw createApiError('CONFLICT', { message: '名额已满' })
      }
    }
    return insertRegistration(activityId, userId, tx)
  })
}

export async function cancelMyRegistration(
  activityId: string,
  userId: string,
  now: Date = new Date()
) {
  const activity = await getActivityById(activityId)
  if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })

  const reg = await getRegistration(activityId, userId)
  if (!reg) throw createApiError('NOT_FOUND', { message: '未找到报名记录' })
  if (reg.status === 'checked_in') {
    throw createApiError('CONFLICT', { message: '已签到，无法取消报名' })
  }
  if (reg.status === 'cancelled') return reg // 幂等
  if (now >= new Date(activity.startTime)) {
    throw createApiError('CONFLICT', { message: '活动已开始，无法取消' })
  }
  return (await setRegistrationCancelled(reg.id, now))!
}

export async function checkInToActivity(
  activityId: string,
  userId: string,
  code: string,
  now: Date = new Date()
) {
  const activity = await getActivityById(activityId)
  if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })
  if (activity.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '活动已取消' })
  }

  const reg = await getRegistration(activityId, userId)
  if (!reg) throw createApiError('CONFLICT', { message: '请先报名再签到' })
  if (reg.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '报名已取消，请重新报名' })
  }
  if (reg.status === 'checked_in') return reg // 幂等

  const opensAt = new Date(new Date(activity.startTime).getTime() - CHECKIN_LEAD_MS)
  if (now < opensAt) throw createApiError('CONFLICT', { message: '签到尚未开始' })
  if (now > new Date(activity.endTime)) {
    throw createApiError('CONFLICT', { message: '活动已结束，签到已关闭' })
  }
  if (!verifyCheckinCode(activityId, code, now)) {
    throw createApiError('VALIDATION_ERROR', { message: '签到码无效或已过期' })
  }

  return (await setRegistrationCheckedIn(reg.id, {
    checkInAt: now,
    method: 'scan',
    checkedInBy: null
  }))!
}

export async function manualCheckIn(
  activityId: string,
  targetUserId: string,
  operatorId: string,
  now: Date = new Date()
) {
  await requireActivity(activityId)
  const reg = await getRegistration(activityId, targetUserId)
  if (!reg) throw createApiError('CONFLICT', { message: '该用户未报名此活动' })
  if (reg.status === 'checked_in') return reg // 幂等
  if (reg.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '该用户已取消报名' })
  }
  return (await setRegistrationCheckedIn(reg.id, {
    checkInAt: now,
    method: 'manual',
    checkedInBy: operatorId
  }))!
}

export async function listMineView(userId: string, page: number, pageSize: number) {
  const { rows, total } = await listMyRegistrations(userId, pageSize, (page - 1) * pageSize)
  const now = new Date()
  const statsMap = await getActivityStatsMap(rows.map(r => r.activity.id))
  const data = rows.map(({ registration, activity }) => ({
    registration,
    activity: toActivityView(
      activity,
      statsMap.get(activity.id) ?? { registeredCount: 0, checkedInCount: 0 },
      now,
      registration
    )
  }))
  return { data, total }
}
