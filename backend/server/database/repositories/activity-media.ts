import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../client'
import { activityMedia, mediaFile } from '../schema'
import type { DbExecutor } from './activities'

export type ActivityMediaRow = typeof activityMedia.$inferSelect

/** 关联行 + 媒体行（join 结果，供映射层裁剪）。 */
export interface ActivityMediaWithFile {
  link: ActivityMediaRow
  media: typeof mediaFile.$inferSelect
}

/** 某活动的相册列表，created_at 倒序（详情/管理页共用）。 */
export async function listActivityMedia(activityId: string): Promise<ActivityMediaWithFile[]> {
  const rows = await db
    .select()
    .from(activityMedia)
    .innerJoin(mediaFile, eq(activityMedia.mediaId, mediaFile.id))
    .where(eq(activityMedia.activityId, activityId))
    .orderBy(desc(activityMedia.createdAt))
  return rows.map(r => ({ link: r.activity_media, media: r.media_file }))
}

export async function getActivityMediaRow(
  activityId: string,
  mediaId: string
): Promise<ActivityMediaRow | null> {
  const rows = await db
    .select()
    .from(activityMedia)
    .where(and(eq(activityMedia.activityId, activityId), eq(activityMedia.mediaId, mediaId)))
    .limit(1)
  return rows[0] ?? null
}

export async function insertActivityMedia(
  input: {
    activityId: string
    mediaId: string
    description: string
  },
  executor: DbExecutor = db
): Promise<ActivityMediaRow> {
  const rows = await executor.insert(activityMedia).values(input).returning()
  return rows[0]!
}

export async function updateActivityMediaDescription(
  activityId: string,
  mediaId: string,
  description: string
): Promise<ActivityMediaRow | null> {
  const rows = await db
    .update(activityMedia)
    .set({ description })
    .where(and(eq(activityMedia.activityId, activityId), eq(activityMedia.mediaId, mediaId)))
    .returning()
  return rows[0] ?? null
}

export async function deleteActivityMediaRow(
  activityId: string,
  mediaId: string,
  executor: DbExecutor = db
): Promise<ActivityMediaRow | null> {
  const rows = await executor
    .delete(activityMedia)
    .where(and(eq(activityMedia.activityId, activityId), eq(activityMedia.mediaId, mediaId)))
    .returning()
  return rows[0] ?? null
}

/**
 * 批量取多个活动相册中「最早的一张图片」URL（跳过视频）。
 * 按 (activityId, 关联创建时间) 升序拉取后在 JS 内每组取首条，
 * 候选数受调用方限制（首页 ≤20 个候选），上限 500 行兜底。
 */
export async function listFirstImageUrlsForActivities(
  activityIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (activityIds.length === 0) return map
  const rows = await db
    .select({
      activityId: activityMedia.activityId,
      url: mediaFile.url
    })
    .from(activityMedia)
    .innerJoin(mediaFile, eq(activityMedia.mediaId, mediaFile.id))
    .where(and(inArray(activityMedia.activityId, activityIds), eq(mediaFile.type, 'image')))
    .orderBy(
      asc(activityMedia.activityId),
      asc(activityMedia.createdAt),
      asc(activityMedia.id)
    )
    .limit(500)
  for (const row of rows) {
    if (!map.has(row.activityId)) map.set(row.activityId, row.url)
  }
  return map
}
