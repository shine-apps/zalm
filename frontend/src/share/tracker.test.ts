import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPanelId, currentPagePath, trackShare } from './tracker'

const { reportShareEvent } = vi.hoisted(() => ({
  reportShareEvent: vi.fn().mockResolvedValue({ accepted: true }),
}))

vi.mock('@/api/share', () => ({
  reportShareEvent,
}))

beforeEach(() => {
  reportShareEvent.mockClear()
})

describe('createPanelId', () => {
  it('generates unique short panel ids with p- prefix', () => {
    const a = createPanelId()
    const b = createPanelId()
    expect(a.startsWith('p-')).toBe(true)
    expect(a).not.toBe(b)
  })
})

describe('currentPagePath', () => {
  it('reads the last page route from the uni page stack', () => {
    expect(currentPagePath()).toBe('/pages/index/index')
  })
})

describe('trackShare', () => {
  it('reports an enriched event and swallows rejections silently', async () => {
    trackShare({
      event: 'panel_open',
      panelId: 'p-test1234',
      targetType: 'activity',
      targetId: 'act-1',
    })

    expect(reportShareEvent).toHaveBeenCalledTimes(1)
    const body = reportShareEvent.mock.calls[0][0]
    expect(body).toMatchObject({
      event: 'panel_open',
      panelId: 'p-test1234',
      targetType: 'activity',
      targetId: 'act-1',
      page: '/pages/index/index',
    })
    expect(body.platform).toBeTruthy()
  })

  it('never throws when the report endpoint rejects', () => {
    reportShareEvent.mockRejectedValueOnce(new Error('network down'))
    expect(() => trackShare({ event: 'copy_fail' })).not.toThrow()
  })
})
