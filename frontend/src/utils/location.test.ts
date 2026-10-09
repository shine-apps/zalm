import { describe, expect, it } from 'vitest'
import type { ActivityLocation } from './location'
import {
  buildMarkerUri,
  hasCoordinates,
  round6,
} from './location'

const withCoord: ActivityLocation = {
  name: '人民广场',
  address: '上海市黄浦区',
  latitude: 31.2336,
  longitude: 121.4712,
}
const degraded: ActivityLocation = {
  name: '村委会',
  address: '某镇某村 1 号',
  latitude: null,
  longitude: null,
}

describe('location helpers', () => {
  it('detects whether a location has paired coordinates', () => {
    expect(hasCoordinates(withCoord)).toBe(true)
    expect(hasCoordinates(degraded)).toBe(false)
    expect(hasCoordinates({ ...withCoord, longitude: null })).toBe(false)
  })

  it('rounds to 6 decimals', () => {
    expect(round6(31.2336009)).toBe(31.233601)
    expect(round6(121.47)).toBe(121.47)
  })

  it('builds a Tencent map marker URI with encoded title/addr', () => {
    const uri = buildMarkerUri(withCoord)
    expect(uri.startsWith('https://apis.map.qq.com/uri/v1/marker?marker=coord:31.2336,121.4712;')).toBe(true)
    expect(uri).toContain(`title=${encodeURIComponent('人民广场')}`)
    expect(uri).toContain(`addr=${encodeURIComponent('上海市黄浦区')}`)
    expect(uri.endsWith('referer=%E4%BC%97%E7%88%B1%E8%81%94%E7%9B%9F')).toBe(true)
  })

  it('returns empty marker URI when coordinates missing', () => {
    expect(buildMarkerUri(degraded)).toBe('')
  })
})
