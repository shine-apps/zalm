/**
 * 微信公众号（Official Account）H5 JS-SDK 服务端能力。
 * 文档：https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html
 *
 * - access_token / jsapi_ticket 进程内缓存（提前 5 分钟刷新）
 * - buildWxJsSdkSignature() 生成 wx.config 所需签名
 * - 未配置 WECHAT_OA_APPID/SECRET 时抛 WechatOaConfigError，路由据此降级
 */
import { createHash, randomBytes } from 'node:crypto'
import { getEnv } from './env'
import { logger } from './logger'

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token'
const TICKET_URL = 'https://api.weixin.qq.com/cgi-bin/ticket/getticket'

/** 提前刷新的时间余量，避免临界点过期。 */
const EARLY_REFRESH_MS = 5 * 60_000

export class WechatOaConfigError extends Error {}

interface CachedValue {
  value: string
  /** 毫秒时间戳。 */
  expiresAt: number
}

let tokenCache: CachedValue | null = null
let ticketCache: CachedValue | null = null

interface WeixinEnvelope {
  access_token?: string
  ticket?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

/** 公众号 access_token（client_credential），进程内缓存。 */
async function getOaAccessToken(): Promise<string> {
  const env = getEnv()
  if (!env.WECHAT_OA_APPID || !env.WECHAT_OA_SECRET) {
    throw new WechatOaConfigError('未配置 WECHAT_OA_APPID / WECHAT_OA_SECRET，无法使用微信 JS-SDK')
  }

  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt - EARLY_REFRESH_MS > now) {
    return tokenCache.value
  }

  const url = `${TOKEN_URL}?grant_type=client_credential&appid=${encodeURIComponent(env.WECHAT_OA_APPID)}&secret=${encodeURIComponent(env.WECHAT_OA_SECRET)}`
  const resp = await fetch(url)
  const data = await resp.json() as WeixinEnvelope
  if (!data.access_token || data.errcode) {
    tokenCache = null
    throw new Error(`获取公众号 access_token 失败：${data.errmsg ?? 'unknown'}(${data.errcode ?? '?'})`)
  }

  tokenCache = {
    value: data.access_token,
    expiresAt: now + (data.expires_in ?? 7200) * 1000
  }
  return tokenCache.value
}

/** jsapi_ticket，进程内缓存。 */
async function getJsApiTicket(): Promise<string> {
  const now = Date.now()
  if (ticketCache && ticketCache.expiresAt - EARLY_REFRESH_MS > now) {
    return ticketCache.value
  }

  const accessToken = await getOaAccessToken()
  const url = `${TICKET_URL}?type=jsapi&access_token=${encodeURIComponent(accessToken)}`
  const resp = await fetch(url)
  const data = await resp.json() as WeixinEnvelope
  if (!data.ticket || data.errcode) {
    ticketCache = null
    throw new Error(`获取公众号 jsapi_ticket 失败：${data.errmsg ?? 'unknown'}(${data.errcode ?? '?'})`)
  }

  ticketCache = {
    value: data.ticket,
    expiresAt: now + (data.expires_in ?? 7200) * 1000
  }
  logger.info('[WeChatOA] jsapi_ticket 已刷新')
  return ticketCache.value
}

export interface JsSdkSignature {
  appId: string
  nonceStr: string
  /** 秒级时间戳（字符串形式，微信签名与 wx.config 均接受字符串）。 */
  timestamp: string
  signature: string
}

/**
 * 纯函数：按官方规则对 (jsapi_ticket, noncestr, timestamp, url) 做 sha1 签名。
 * 字段顺序固定为字典序：jsapi_ticket → noncestr → timestamp → url。
 */
export function signJsApiTicket(
  ticket: string,
  nonceStr: string,
  timestamp: string,
  url: string
): string {
  const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`
  return createHash('sha1').update(raw, 'utf8').digest('hex')
}

/** 生成一次 wx.config 所需的完整签名负载。 */
export async function buildWxJsSdkSignature(pageUrl: string): Promise<JsSdkSignature> {
  const env = getEnv()
  if (!env.WECHAT_OA_APPID || !env.WECHAT_OA_SECRET) {
    throw new WechatOaConfigError('未配置 WECHAT_OA_APPID / WECHAT_OA_SECRET，无法使用微信 JS-SDK')
  }

  const ticket = await getJsApiTicket()
  const nonceStr = randomBytes(8).toString('hex')
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = signJsApiTicket(ticket, nonceStr, timestamp, pageUrl)
  return { appId: env.WECHAT_OA_APPID, nonceStr, timestamp, signature }
}
