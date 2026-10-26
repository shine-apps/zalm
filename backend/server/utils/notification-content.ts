import type {
  ActivityLocation,
  NotificationTargetType,
  NotificationType,
  VerificationKind
} from '../database/schema'
import type { ActivityUpdateBody } from '../schemas/activity'

/**
 * 通知内容生成（纯函数层，无 DB/网络依赖，可单测）。
 * 业务事件 → NotificationDraft[]（一人一条）；投递由 notifications-service 负责。
 */

/** 一条待投递的站内通知（target 可为空：认证审核等系统消息没有跳转对象）。 */
export interface NotificationDraft {
  userId: string
  type: NotificationType
  title: string
  body: string
  targetType: NotificationTargetType | null
  targetId: string | null
  data: Record<string, unknown>
}

/** 变更检测所需的活动字段（ActivityRow 结构满足）。 */
export interface ChangeableActivity {
  id: string
  title: string
  startTime: Date | string
  endTime: Date | string
  registerDeadline: Date | string | null
  location: ActivityLocation
}

/** 会触发通知的活动字段（描述/分类/封面/容量/积分不在内）。 */
export type ActivityChangeField
  = | 'title'
    | 'startTime'
    | 'endTime'
    | 'registerDeadline'
    | 'location'

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

function sameLocation(a: ActivityLocation, b: ActivityLocation): boolean {
  return a.name === b.name && a.address === b.address && a.latitude === b.latitude && a.longitude === b.longitude
}

/**
 * 比对编辑前后活动，返回真正发生变化、需要通知报名者的字段（固定顺序）。
 * 仅覆盖标题/开始时间/结束时间/报名截止时间/地点；undefined 表示该字段未提交。
 */
export function diffActivityChanges(
  before: ChangeableActivity,
  patch: ActivityUpdateBody
): ActivityChangeField[] {
  const changed: ActivityChangeField[] = []
  if (patch.title !== undefined && patch.title !== before.title) {
    changed.push('title')
  }
  if (patch.startTime !== undefined && toTime(patch.startTime) !== toTime(before.startTime)) {
    changed.push('startTime')
  }
  if (patch.endTime !== undefined && toTime(patch.endTime) !== toTime(before.endTime)) {
    changed.push('endTime')
  }
  if (patch.registerDeadline !== undefined) {
    const afterTime = patch.registerDeadline ? toTime(patch.registerDeadline) : null
    const beforeTime = before.registerDeadline ? toTime(before.registerDeadline) : null
    if (afterTime !== beforeTime) changed.push('registerDeadline')
  }
  if (patch.location !== undefined && !sameLocation(before.location, patch.location)) {
    changed.push('location')
  }
  return changed
}

/** 字段 → 正文中文标签；开始/结束时间合并为「活动时间」，按固定顺序去重。 */
const FIELD_LABELS: ReadonlyArray<{ field: ActivityChangeField, label: string }> = [
  { field: 'title', label: '标题' },
  { field: 'startTime', label: '活动时间' },
  { field: 'endTime', label: '活动时间' },
  { field: 'registerDeadline', label: '报名截止时间' },
  { field: 'location', label: '地点' }
]

function changeLabels(fields: ActivityChangeField[]): string[] {
  const labels: string[] = []
  for (const item of FIELD_LABELS) {
    if (fields.includes(item.field) && !labels.includes(item.label)) labels.push(item.label)
  }
  return labels
}

/** 按接收人生成草稿（去重，避免同用户在异常数据下落两条）。 */
function fanOut(
  userIds: string[],
  type: NotificationType,
  title: string,
  body: string,
  activityId: string,
  data: Record<string, unknown>
): NotificationDraft[] {
  return [...new Set(userIds)].map(userId => ({
    userId,
    type,
    title,
    body,
    targetType: 'activity',
    targetId: activityId,
    data
  }))
}

/** 报名成功（新报名或取消后复活；幂等重放不调用）。 */
export function buildRegisteredNotifications(
  activity: Pick<ChangeableActivity, 'id' | 'title'>,
  userIds: string[]
): NotificationDraft[] {
  return fanOut(
    userIds,
    'activity.registered',
    '报名成功',
    `你已成功报名「${activity.title}」`,
    activity.id,
    {}
  )
}

/** 签到成功（扫码自助 / 组织者手动补签）。 */
export function buildCheckedInNotifications(
  activity: Pick<ChangeableActivity, 'id' | 'title'>,
  userIds: string[],
  meta: { method: 'scan' | 'manual', points: number }
): NotificationDraft[] {
  const pointsClause = meta.points > 0 ? `，获得 ${meta.points} 积分` : ''
  const body = meta.method === 'manual'
    ? `组织者已为你完成「${activity.title}」签到${pointsClause}`
    : `你已完成「${activity.title}」签到${pointsClause}`
  return fanOut(userIds, 'activity.checked_in', '签到成功', body, activity.id, {
    method: meta.method,
    points: meta.points
  })
}

/** 活动取消 → 全部有效报名者。 */
export function buildCancelledNotifications(
  activity: Pick<ChangeableActivity, 'id' | 'title'>,
  userIds: string[]
): NotificationDraft[] {
  return fanOut(
    userIds,
    'activity.cancelled',
    '活动已取消',
    `「${activity.title}」已取消，如有疑问请联系组织者`,
    activity.id,
    {}
  )
}

/** 活动关键信息变更 → 全部有效报名者。 */
export function buildUpdatedNotifications(
  activity: Pick<ChangeableActivity, 'id' | 'title'>,
  userIds: string[],
  changedFields: ActivityChangeField[]
): NotificationDraft[] {
  const labels = changeLabels(changedFields)
  return fanOut(
    userIds,
    'activity.updated',
    '活动信息变更',
    `「${activity.title}」的${labels.join('、')}已变更，请留意最新安排`,
    activity.id,
    { changedFields }
  )
}

export const VERIFICATION_KIND_LABELS: Record<VerificationKind, string> = {
  personal: '个人认证',
  enterprise: '企业认证'
}

/** 认证审核通过 → 申请人（系统消息，无跳转对象）。 */
export function buildVerificationApprovedNotification(input: {
  userId: string
  kind: VerificationKind
}): NotificationDraft {
  const label = VERIFICATION_KIND_LABELS[input.kind]
  return {
    userId: input.userId,
    type: 'verification.approved',
    title: `${label}已通过`,
    body: `你提交的${label}已审核通过，认证信息将在你的个人主页展示。`,
    targetType: null,
    targetId: null,
    data: { kind: input.kind }
  }
}

/** 认证审核驳回 → 申请人（附原因，可修改后重提）。 */
export function buildVerificationRejectedNotification(input: {
  userId: string
  kind: VerificationKind
  rejectReason: string
}): NotificationDraft {
  const label = VERIFICATION_KIND_LABELS[input.kind]
  return {
    userId: input.userId,
    type: 'verification.rejected',
    title: `${label}未通过`,
    body: `你提交的${label}未通过审核。原因：${input.rejectReason}。修改后可重新提交。`,
    targetType: null,
    targetId: null,
    data: { kind: input.kind, rejectReason: input.rejectReason }
  }
}
