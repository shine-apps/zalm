import {
  getActivityStatsMap,
  listRecentlyEndedActivities,
  listRecruitingActivities
} from '../database/repositories/activities'
import { listFirstImageUrlsForActivities } from '../database/repositories/activity-media'
import type { ActivityCategory } from '../database/schema'
import { toActivityView } from './activity-service'

/** 近期风采时间窗：30 天。 */
const HIGHLIGHT_WINDOW_MS = 30 * 24 * 60 * 60_000
/** 首页每板块上限。 */
const HOME_SECTION_LIMIT = 5
/** 风采候选超采样上限：部分候选可能无任何图片被跳过。 */
const HIGHLIGHT_CANDIDATE_LIMIT = 20

export interface HomeHighlight {
  id: string
  title: string
  endTime: string
  categories: ActivityCategory[]
  imageUrl: string
  imageSource: 'album' | 'cover'
}

export interface HighlightSource {
  id: string
  title: string
  endTime: Date | string
  categories: ActivityCategory[]
  coverUrl: string | null
}

/**
 * 纯映射：按「相册首图 → 封面」选取风采图，两者皆无跳过，截断到 limit。
 * 入参顺序由 SQL 保证（endTime 倒序），此函数不再排序。
 */
export function toHighlights(
  sources: HighlightSource[],
  firstImageUrl: Map<string, string>,
  limit: number = HOME_SECTION_LIMIT
): HomeHighlight[] {
  const result: HomeHighlight[] = []
  for (const s of sources) {
    if (result.length >= limit) break
    const album = firstImageUrl.get(s.id)
    const endTime = s.endTime instanceof Date ? s.endTime.toISOString() : s.endTime
    if (album) {
      result.push({
        id: s.id,
        title: s.title,
        endTime,
        categories: s.categories,
        imageUrl: album,
        imageSource: 'album'
      })
    } else if (s.coverUrl) {
      result.push({
        id: s.id,
        title: s.title,
        endTime,
        categories: s.categories,
        imageUrl: s.coverUrl,
        imageSource: 'cover'
      })
    }
  }
  return result
}

export interface HomeView {
  highlights: HomeHighlight[]
  recruiting: ReturnType<typeof toActivityView>[]
}

/** 首页聚合：近期风采 + 招募中。无 myRegistration（游客视角）。 */
export async function getHomeView(now: Date = new Date()): Promise<HomeView> {
  const [ended, recruiting] = await Promise.all([
    listRecentlyEndedActivities({ now, windowMs: HIGHLIGHT_WINDOW_MS, limit: HIGHLIGHT_CANDIDATE_LIMIT }),
    listRecruitingActivities({ now, limit: HOME_SECTION_LIMIT })
  ])

  const [firstImageUrl, statsMap] = await Promise.all([
    listFirstImageUrlsForActivities(ended.map(a => a.id)),
    getActivityStatsMap(recruiting.map(a => a.id))
  ])

  return {
    highlights: toHighlights(ended, firstImageUrl, HOME_SECTION_LIMIT),
    recruiting: recruiting.map(a =>
      toActivityView(
        a,
        statsMap.get(a.id) ?? { registeredCount: 0, checkedInCount: 0 },
        now,
        null,
        []
      )
    )
  }
}
