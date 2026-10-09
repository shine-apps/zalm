import { createHmac } from 'node:crypto'
import { getEnv } from './env'

/** 滚动码窗口长度（毫秒）。 */
export const CHECKIN_WINDOW_MS = 60_000
const CODE_MOD = 1_000_000

/** 当前时间所属窗口序号。 */
export function getCheckinWindow(nowMs: number): number {
  return Math.floor(nowMs / CHECKIN_WINDOW_MS)
}

/**
 * 计算某活动在某窗口的 6 位码（HOTP 式截断，避免直接截 hex 的数值偏斜）。
 * secret 仅测试时显式注入；运行时取 BETTER_AUTH_SECRET。
 */
export function codeForWindow(
  activityId: string,
  window: number,
  secret: string = getEnv().BETTER_AUTH_SECRET
): string {
  const digest = createHmac('sha256', secret)
    .update(`activity-checkin:${activityId}:${window}`)
    .digest()
  const num = digest.readUInt32BE(0)
  return String(num % CODE_MOD).padStart(6, '0')
}

/** 当前窗口码与该窗口到期时间（下一窗口起点）。 */
export function getCurrentCheckinCode(
  activityId: string,
  now: Date = new Date(),
  secret?: string
): { code: string, expiresAt: Date } {
  const w = getCheckinWindow(now.getTime())
  const code = secret ? codeForWindow(activityId, w, secret) : codeForWindow(activityId, w)
  return { code, expiresAt: new Date((w + 1) * CHECKIN_WINDOW_MS) }
}

/**
 * 校验签到码：接受当前窗口与上一窗口（容忍 ≤ ~2 分钟时钟差/出示延迟）。
 */
export function verifyCheckinCode(
  activityId: string,
  code: string,
  now: Date = new Date(),
  secret?: string
): boolean {
  if (!/^\d{6}$/.test(code)) return false
  const w = getCheckinWindow(now.getTime())
  const calc = (win: number) =>
    secret ? codeForWindow(activityId, win, secret) : codeForWindow(activityId, win)
  return calc(w) === code || calc(w - 1) === code
}
