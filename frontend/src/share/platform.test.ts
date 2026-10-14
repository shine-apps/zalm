import { describe, expect, it } from 'vitest'
import { detectH5Kind } from './platform'

const IOS_WX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.40'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'
const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'

describe('detectH5Kind', () => {
  it('detects WeChat built-in browser on iOS/Android', () => {
    expect(detectH5Kind(IOS_WX)).toBe('wx-h5')
    expect(detectH5Kind(`X ${ANDROID_CHROME} MicroMessenger/8.0`)).toBe('wx-h5')
  })

  it('detects mobile browsers by UA', () => {
    expect(detectH5Kind(ANDROID_CHROME)).toBe('mobile-h5')
  })

  it('treats touch narrow-screen devices without mobile UA as mobile', () => {
    expect(detectH5Kind('Mozilla/5.0 Touch', 5, 390)).toBe('mobile-h5')
  })

  it('detects desktop browsers', () => {
    expect(detectH5Kind(DESKTOP_CHROME)).toBe('pc-h5')
    expect(detectH5Kind(DESKTOP_CHROME, 0, 1920)).toBe('pc-h5')
  })

  it('falls back to pc for empty UA on wide screens', () => {
    expect(detectH5Kind('', 0, 1280)).toBe('pc-h5')
  })
})
