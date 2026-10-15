import { describe, expect, it } from 'vitest'
import { toHighlights, type HighlightSource } from './home-service'

function source(over: Partial<HighlightSource> & { id: string }): HighlightSource {
  return {
    title: `活动-${over.id}`,
    endTime: '2026-10-12T01:00:00.000Z',
    categories: [],
    coverUrl: null,
    ...over
  }
}

describe('toHighlights（近期风采选取）', () => {
  it('相册首图优先于封面，并标记 imageSource', () => {
    const items = toHighlights(
      [source({ id: 'a', coverUrl: '/cover-a.jpg' })],
      new Map([['a', '/album-a.jpg']])
    )
    expect(items).toEqual([
      {
        id: 'a',
        title: '活动-a',
        endTime: '2026-10-12T01:00:00.000Z',
        categories: [],
        imageUrl: '/album-a.jpg',
        imageSource: 'album'
      }
    ])
  })

  it('相册无图片时退回封面', () => {
    const items = toHighlights(
      [source({ id: 'b', coverUrl: '/cover-b.jpg' })],
      new Map()
    )
    expect(items[0]?.imageUrl).toBe('/cover-b.jpg')
    expect(items[0]?.imageSource).toBe('cover')
  })

  it('相册只有视频（map 无该活动）且无封面时跳过该活动', () => {
    const items = toHighlights([source({ id: 'c', coverUrl: null })], new Map())
    expect(items).toEqual([])
  })

  it('保持入参顺序（SQL 已按结束时间倒序），最多返回 5 个', () => {
    const sources = Array.from({ length: 6 }, (_, i) =>
      source({ id: `e${i}`, coverUrl: `/c${i}.jpg` })
    )
    const items = toHighlights(sources, new Map())
    expect(items).toHaveLength(5)
    expect(items.map(i => i.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4'])
  })
})
