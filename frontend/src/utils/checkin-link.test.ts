import { describe, expect, it } from 'vitest'
import { buildCheckinUrl, parseCheckinUrl } from './checkin-link'

const ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const CODE = '042042'

describe('buildCheckinUrl', () => {
  it('appends hash-route query and tolerates trailing slash', () => {
    expect(buildCheckinUrl('https://h5.example.com', ID, CODE))
      .toBe(`https://h5.example.com/#/pages/activity/checkin?a=${ID}&c=${CODE}`)
    expect(buildCheckinUrl('https://h5.example.com/', ID, CODE))
      .toBe(`https://h5.example.com/#/pages/activity/checkin?a=${ID}&c=${CODE}`)
  })
})

describe('parseCheckinUrl', () => {
  it('round-trips a built H5 url', () => {
    const url = buildCheckinUrl('https://h5.example.com', ID, CODE)
    expect(parseCheckinUrl(url)).toEqual({ activityId: ID, code: CODE })
  })

  it('parses a scanner result with surrounding whitespace or query after hash', () => {
    const raw = `  https://h5.example.com/?from=scan#/pages/activity/checkin?a=${ID}&c=${CODE}  `
    expect(parseCheckinUrl(raw)).toEqual({ activityId: ID, code: CODE })
  })

  it('rejects foreign paths and malformed codes', () => {
    // 域名不做白名单（生产/测试域名可能不同），但路由片段必须是本系统签到页
    expect(parseCheckinUrl('https://evil.com/#/pages/promo?a=x&c=123456')).toBe(null)
    expect(parseCheckinUrl(`https://h5.example.com/#/pages/activity/checkin?a=${ID}`)).toBe(null)
    expect(parseCheckinUrl(`https://h5.example.com/#/pages/activity/checkin?a=${ID}&c=abcdef`)).toBe(null)
    expect(parseCheckinUrl('not a url')).toBe(null)
    expect(parseCheckinUrl('')).toBe(null)
  })
})
