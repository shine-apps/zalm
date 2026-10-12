import type { ActivityMediaWithFile } from '../database/repositories/activity-media'

/** 活动相册项（GET /api/activities/:id 的 media 元素；前端 ActivityMediaItem 对齐）。 */
export interface ActivityMediaItemView {
  id: string
  url: string
  type: 'image' | 'video'
  description: string
  duration?: number
  width?: number
  height?: number
  createdAt: string
}

/**
 * 关联行 + 媒体行 → 相册视图项。
 * 只暴露白名单字段，不泄漏 media_file.metadata 内的 COS key/bucket/etag 等内部信息；
 * id 取 media_file 主键（非 activity_media 关联行 id）：写接口 PATCH/DELETE 均按
 * (activity_id, media_id) 定位，视图 id 与路由 /media/:mediaId 的标识必须一致，
 * 传关联行 id 会匹配 0 行导致 404；相册内 (activity_id, media_id) 唯一，作 v-for key 安全；
 * 排序（created_at 倒序）在 repository 的 SQL 层完成。
 */
export function toActivityMediaView(row: ActivityMediaWithFile): ActivityMediaItemView {
  const { width, height, duration } = row.media.metadata
  return {
    id: row.media.id,
    url: row.media.url,
    type: row.media.type as 'image' | 'video',
    description: row.link.description,
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
    ...(duration !== undefined && { duration }),
    createdAt: row.link.createdAt.toISOString()
  }
}
