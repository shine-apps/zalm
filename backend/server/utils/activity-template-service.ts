import {
  deleteTemplate,
  getTemplateById,
  insertTemplate,
  listAdminTemplates,
  listTemplateSummaries,
  patchTemplate,
  type ActivityTemplateRow
} from '../database/repositories/activity-templates'
import { getActivityById } from '../database/repositories/activities'
import type {
  ActivityTemplateCreateBody,
  ActivityTemplateUpdateBody
} from '../schemas/activity-template'
import { createApiError } from './errors'

async function requireTemplate(id: string): Promise<ActivityTemplateRow> {
  const template = await getTemplateById(id)
  if (!template) throw createApiError('NOT_FOUND', { message: '活动模板不存在' })
  return template
}

// ===== 组织者 =====

/** 模板选择器精简列表。 */
export function listOrganizerTemplateSummaries() {
  return listTemplateSummaries()
}

/** 取单个模板完整内容用于预填表单。 */
export async function getOrganizerTemplate(id: string) {
  return requireTemplate(id)
}

/**
 * 从已有活动「存为模板」。
 * 仅复制非排期字段：标题/详情/封面/地点/分类/容量/积分；
 * start/end/registerDeadline 强制留空，相册不带入（相册按活动单独管理）。
 */
export async function createTemplateFromActivity(
  activityId: string,
  name: string,
  userId: string
) {
  const activity = await getActivityById(activityId)
  if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })
  return insertTemplate({
    name,
    title: activity.title,
    description: activity.description,
    coverUrl: activity.coverUrl,
    location: activity.location,
    categories: activity.categories,
    capacity: activity.capacity,
    points: activity.points,
    createdBy: userId
  })
}

// ===== Admin =====

export function listAdminTemplateViews(input: { keyword?: string, page: number, pageSize: number }) {
  return listAdminTemplates({
    keyword: input.keyword,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  })
}

export function getAdminTemplate(id: string) {
  return requireTemplate(id)
}

export async function createTemplate(input: ActivityTemplateCreateBody, userId: string) {
  return insertTemplate({
    name: input.name,
    title: input.title ?? null,
    description: input.description ?? '',
    coverUrl: input.coverUrl ?? null,
    location: input.location ?? null,
    categories: input.categories ?? [],
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    registerDeadline: input.registerDeadline ?? null,
    capacity: input.capacity ?? null,
    points: input.points ?? null,
    createdBy: userId
  })
}

export async function updateTemplate(id: string, patch: ActivityTemplateUpdateBody) {
  await requireTemplate(id)
  const updated = await patchTemplate(id, {
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.description !== undefined && { description: patch.description }),
    ...(patch.coverUrl !== undefined && { coverUrl: patch.coverUrl }),
    ...(patch.location !== undefined && { location: patch.location }),
    ...(patch.categories !== undefined && { categories: patch.categories }),
    ...(patch.startTime !== undefined && { startTime: patch.startTime }),
    ...(patch.endTime !== undefined && { endTime: patch.endTime }),
    ...(patch.registerDeadline !== undefined && { registerDeadline: patch.registerDeadline }),
    ...(patch.capacity !== undefined && { capacity: patch.capacity }),
    ...(patch.points !== undefined && { points: patch.points })
  })
  return updated!
}

export async function removeTemplate(id: string) {
  await requireTemplate(id)
  await deleteTemplate(id)
}
