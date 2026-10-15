import type { ActivityCategory, ActivityView } from '@/api/activity'

/** 招募卡：是否已满员（remaining 为 null 表示不限名额）。 */
export function isFull(a: Pick<ActivityView, 'remaining'>): boolean {
  return a.remaining !== null && a.remaining <= 0
}

/** 左上角标文案。 */
export function seatBadge(a: Pick<ActivityView, 'remaining'>): string {
  if (isFull(a))
    return '名额已满'
  return a.remaining === null ? '报名中' : `报名中 · 剩 ${a.remaining} 席`
}

/** 已报名人数文案（与活动列表页口径一致）。 */
export function enrolledText(a: Pick<ActivityView, 'capacity' | 'registeredCount'>): string {
  const cap = a.capacity === null ? '不限' : String(a.capacity)
  return `已报 ${a.registeredCount}/${cap}`
}

/** 名额进度百分比；不限名额返回 null（不渲染进度条）。 */
export function progressPercent(
  a: Pick<ActivityView, 'capacity' | 'registeredCount'>,
): number | null {
  if (a.capacity === null || a.capacity <= 0)
    return null
  return Math.min(100, Math.round((a.registeredCount / a.capacity) * 100))
}

/** ISO 时间 → 「M月D日」；无效输入返回空串。 */
export function shortChineseDate(input?: string | Date | null): string {
  if (!input)
    return ''
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime()))
    return ''
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 无封面活动的分类色底兜底图标（carbon 图标，经 UnoCSS safelist/直接类名生效）。 */
export const CATEGORY_FALLBACK: Record<ActivityCategory, string> = {
  爱心物资: 'i-carbon-delivery-parcel',
  助学帮扶: 'i-carbon-education',
  传统文化: 'i-carbon-book',
  乡村振兴: 'i-carbon-location-heart',
  关爱群体: 'i-carbon-user-multiple',
}

export const DEFAULT_FALLBACK_ICON = 'i-carbon-calendar'
