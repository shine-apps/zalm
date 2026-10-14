import { describe, expect, it } from 'vitest'
import {
  buildH5HashUrl,
  buildMpSharePath,
  normalizePage,
  stringifyShareQuery,
  toAbsoluteUrl,
} from './url'

describe('normalizePage', () => {
  it('ensures a leading slash and strips query/hash', () => {
    expect(normalizePage('pages/activity/detail?id=1#x')).toBe('/pages/activity/detail')
    expect(normalizePage('/pages/index/index')).toBe('/pages/index/index')
  })
})

describe('stringifyShareQuery', () => {
  it('encodes keys/values and skips empty values', () => {
    expect(stringifyShareQuery({ id: 'a 1', c: 'x', empty: '' })).toBe('id=a%201&c=x')
    expect(stringifyShareQuery()).toBe('')
  })
})

describe('buildMpSharePath', () => {
  it('appends encoded query and normalizes the page', () => {
    expect(buildMpSharePath('pages/activity/detail', { id: 'abc' }))
      .toBe('/pages/activity/detail?id=abc')
    expect(buildMpSharePath('/pages/index/index')).toBe('/pages/index/index')
  })
})

describe('buildH5HashUrl', () => {
  it('builds a hash url under the site base and tolerates trailing slash', () => {
    expect(buildH5HashUrl('https://h5.example.com/h5', '/pages/activity/detail', { id: 'x' }))
      .toBe('https://h5.example.com/h5/#/pages/activity/detail?id=x')
    expect(buildH5HashUrl('https://h5.example.com/h5/', '/pages/index/index'))
      .toBe('https://h5.example.com/h5/#/pages/index/index')
  })
})

describe('toAbsoluteUrl', () => {
  it('keeps absolute, protocol-relative and data URIs', () => {
    expect(toAbsoluteUrl('https://cdn.x.com/a.jpg', 'https://h5.x.com')).toBe('https://cdn.x.com/a.jpg')
    expect(toAbsoluteUrl('//cdn.x.com/a.jpg', 'https://h5.x.com')).toBe('//cdn.x.com/a.jpg')
    expect(toAbsoluteUrl('data:image/png;base64,AAAA', 'https://h5.x.com')).toBe('data:image/png;base64,AAAA')
  })

  it('prefixes relative paths with the origin', () => {
    expect(toAbsoluteUrl('/media/a.jpg', 'https://h5.x.com')).toBe('https://h5.x.com/media/a.jpg')
    expect(toAbsoluteUrl('media/a.jpg', 'https://h5.x.com/')).toBe('https://h5.x.com/media/a.jpg')
  })
})
