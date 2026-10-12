import type { ActivityMediaWithFile } from '../database/repositories/activity-media'
import { describe, expect, it } from 'vitest'
import { toActivityMediaView } from './activity-media'

const baseRow: ActivityMediaWithFile = {
  link: {
    id: 'link-1',
    activityId: 'act-1',
    mediaId: 'media-1',
    description: '现场合影',
    createdAt: new Date('2026-10-11T08:00:00.000Z')
  },
  media: {
    id: 'media-1',
    url: 'https://bucket.cos.ap-guangzhou.myqcloud.com/activity/image/a.jpg',
    type: 'image',
    refCount: 1,
    metadata: {
      key: 'activity/image/a.jpg',
      bucket: 'bucket',
      region: 'ap-guangzhou',
      width: 1280,
      height: 720,
      size: 12345
    },
    createdAt: new Date('2026-10-11T07:00:00.000Z')
  }
}

describe('toActivityMediaView', () => {
  it('projects only whitelisted fields (no COS internals)', () => {
    const view = toActivityMediaView(baseRow)
    expect(view).toEqual({
      id: 'media-1', // media_file.id（写接口按 media_id 定位），非关联行 link.id
      url: 'https://bucket.cos.ap-guangzhou.myqcloud.com/activity/image/a.jpg',
      type: 'image',
      description: '现场合影',
      width: 1280,
      height: 720,
      createdAt: '2026-10-11T08:00:00.000Z'
    })
    expect(view).not.toHaveProperty('metadata')
    expect(view).not.toHaveProperty('refCount')
    expect(view).not.toHaveProperty('mediaId')
  })

  it('omits optional dimension/duration keys when metadata lacks them', () => {
    const view = toActivityMediaView({
      ...baseRow,
      media: { ...baseRow.media, metadata: { name: 'v.mp4', duration: 42 } }
    })
    expect(view.width).toBeUndefined()
    expect(view.duration).toBe(42)
  })
})
