/** 时间展示与滚动码倒计时辅助（活动模块统一用这一份，不在页面里手写 Date 格式化）。 */

function toDate(input?: string | number | Date | null): Date | null {
  if (input === null || input === undefined || input === '')
    return null
  const d = input instanceof Date ? input : new Date(input)
  return Number.isNaN(d.getTime()) ? null : d
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYY-MM-DD HH:mm；无效输入返回 ''。input 可为 ISO 字符串、Date 或毫秒时间戳。 */
export function formatDateTime(input?: string | number | Date | null): string {
  const d = toDate(input)
  if (!d)
    return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** YYYY-MM-DD；无效输入返回 ''。 */
export function formatDate(input?: string | Date | null): string {
  const d = toDate(input)
  if (!d)
    return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function hm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 列表/详情时间区间：同日「YYYY-MM-DD HH:mm~HH:mm」，跨日两行完整时间用 ~ 连接。 */
export function formatTimeRange(
  start?: string | Date | null,
  end?: string | Date | null,
): string {
  const s = toDate(start)
  const e = toDate(end)
  if (!s || !e)
    return ''
  const sameDay
    = s.getFullYear() === e.getFullYear()
      && s.getMonth() === e.getMonth()
      && s.getDate() === e.getDate()
  if (sameDay)
    return `${formatDate(s)} ${hm(s)}~${hm(e)}`
  return `${formatDateTime(s)} ~ ${formatDateTime(e)}`
}

/** 距离下一整分的秒数（1..60），用于滚动码倒计时。 */
export function secondsUntilNextMinute(nowMs: number = Date.now()): number {
  return 60 - (Math.floor(nowMs / 1000) % 60)
}
