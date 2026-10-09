import { describe, expect, it } from 'vitest'
import { codeForWindow, getCheckinWindow, getCurrentCheckinCode, verifyCheckinCode } from './checkin-code'

const SECRET = 'test-secret-at-least-32-characters-long!!'
const AID_A = 'activity-aaaaaaaa'
const AID_B = 'activity-bbbbbbbb'
const T0 = Date.UTC(2026, 9, 8, 10, 0, 0) // 恰好整分钟

describe('checkin-code', () => {
  it('derives 60s windows', () => {
    expect(getCheckinWindow(T0)).toBe(getCheckinWindow(T0 + 59_999))
    expect(getCheckinWindow(T0 + 60_000)).toBe(getCheckinWindow(T0) + 1)
  })

  it('always yields a 6 digit zero-padded code', () => {
    expect(codeForWindow(AID_A, getCheckinWindow(T0), SECRET)).toMatch(/^\d{6}$/)
  })

  it('is deterministic for the same activity and window', () => {
    const w = getCheckinWindow(T0)
    expect(codeForWindow(AID_A, w, SECRET)).toBe(codeForWindow(AID_A, w, SECRET))
  })

  it('codes are not interchangeable across activities', () => {
    const w = getCheckinWindow(T0)
    expect(codeForWindow(AID_A, w, SECRET)).not.toBe(codeForWindow(AID_B, w, SECRET))
  })

  it('accepts the current window code', () => {
    const code = codeForWindow(AID_A, getCheckinWindow(T0 + 30_000), SECRET)
    expect(verifyCheckinCode(AID_A, code, new Date(T0 + 30_000), SECRET)).toBe(true)
  })

  it('accepts the previous window code (clock/operation tolerance)', () => {
    // T0 为整分钟边界；在跨入下一窗口 5 秒后校验，w0 码即为「上一窗口码」
    const prev = codeForWindow(AID_A, getCheckinWindow(T0), SECRET)
    expect(verifyCheckinCode(AID_A, prev, new Date(T0 + 65_000), SECRET)).toBe(true)
  })

  it('rejects codes older than the previous window', () => {
    // 下一窗口内校验：w0-1 距今两个窗口，超出上一窗口容错范围
    const old = codeForWindow(AID_A, getCheckinWindow(T0) - 1, SECRET)
    expect(verifyCheckinCode(AID_A, old, new Date(T0 + 65_000), SECRET)).toBe(false)
  })

  it('rejects malformed codes and foreign activity codes', () => {
    expect(verifyCheckinCode(AID_A, 'abcdef', new Date(T0), SECRET)).toBe(false)
    expect(verifyCheckinCode(AID_A, '12345', new Date(T0), SECRET)).toBe(false)
    const foreign = codeForWindow(AID_B, getCheckinWindow(T0), SECRET)
    expect(verifyCheckinCode(AID_A, foreign, new Date(T0), SECRET)).toBe(false)
  })

  it('exposes expiresAt as the start of the next window', () => {
    const { expiresAt } = getCurrentCheckinCode(AID_A, new Date(T0 + 12_345), SECRET)
    expect(expiresAt.getTime()).toBe(T0 + 60_000)
  })
})
