import { http } from '@/http/alova'
import type { ActivityCategory, ActivityLocation } from './activity'

/** 模板选择器精简项。 */
export interface ActivityTemplateSummary {
  id: string
  name: string
  /** 预设的活动标题，null 表示模板未预设标题。 */
  title: string | null
  categories: ActivityCategory[]
}

/** 活动模板完整内容（字段为 null/空数组表示模板未预设该项）。 */
export interface ActivityTemplate {
  id: string
  name: string
  title: string | null
  description: string
  coverUrl: string | null
  location: ActivityLocation | null
  categories: ActivityCategory[]
  startTime: string | null
  endTime: string | null
  registerDeadline: string | null
  capacity: number | null
  points: number | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** 模板精简列表（活动组织者；发布活动选择器用）。 */
export function listActivityTemplates(): Promise<ActivityTemplateSummary[]> {
  return http.Get('/activity-templates') as unknown as Promise<ActivityTemplateSummary[]>
}

/** 单个模板完整内容（预填发布表单）。 */
export function getActivityTemplate(id: string): Promise<ActivityTemplate> {
  return http.Get(`/activity-templates/${id}`) as unknown as Promise<ActivityTemplate>
}

/** 活动详情页「存为模板」（时间字段由后端强制留空）。 */
export function createTemplateFromActivity(
  activityId: string,
  name: string,
): Promise<ActivityTemplate> {
  return http.Post(`/activity-templates/from-activity/${activityId}`, {
    name,
  }) as unknown as Promise<ActivityTemplate>
}
