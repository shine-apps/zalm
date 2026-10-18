import Client, { SendSmsRequest } from '@alicloud/dysmsapi20170525'
import { $OpenApiUtil } from '@alicloud/openapi-core'
import { getEnv } from './env'
import { logger } from './logger'

/**
 * 短信发送抽象。
 * - 已配置阿里云四项凭证时走阿里云 SendSms 真实发送（createAliyunSmsSender）
 * - 未配置时回退为日志实现（logSmsSender，开发期从后端控制台取验证码）
 * 调用方（better-auth phoneNumber 插件）通过 resolveSmsSender() 拿到当前发送器，无需感知通道。
 */
export interface SmsSender {
  (args: { phoneNumber: string, code: string }): Promise<void> | void
}

/** 中国大陆手机号：11 位、1 开头、第二位 3-9。 */
const CN_MOBILE_RE = /^1[3-9]\d{9}$/

/**
 * 归一化手机号：去除空白/连字符，兼容 +86 / 86 前缀，返回 11 位号码。
 * 无法识别为大陆手机号时返回 null。
 */
export function normalizePhoneNumber(input: string): string | null {
  const compact = input.replaceAll(/[\s()-]/g, '')
  const withoutCountry = compact.replace(/^(\+?86)/, '')
  return CN_MOBILE_RE.test(withoutCountry) ? withoutCountry : null
}

/**
 * 规范化为带国家号的存储/展示形态，如 '+8613800138000'。
 * 非法号码返回 null。当前仅支持中国大陆手机号。
 */
export function canonicalizePhoneNumber(input: string): string | null {
  const bare = normalizePhoneNumber(input)
  return bare ? `+86${bare}` : null
}

/** better-auth phoneNumberValidator 签名：仅校验，不抛错。 */
export async function isValidPhoneNumber(phoneNumber: string): Promise<boolean> {
  return normalizePhoneNumber(phoneNumber) !== null
}

/**
 * 开发期短信发送实现：验证码只写入服务端日志，不真正发送。
 * 仅在未配置阿里云短信凭证时作为回退通道使用。
 */
export const logSmsSender: SmsSender = ({ phoneNumber, code }) => {
  logger.info(`[OTP][DEV-ONLY] 向 ${phoneNumber} 发送短信验证码：${code}（未接入短信服务商，请勿在生产使用）`)
}

/** 阿里云短信所需的四项配置（与 env 中同名键，抽成独立类型便于单测注入）。 */
export interface AliyunSmsConfig {
  ALIYUN_ACCESS_KEY_ID?: string
  ALIYUN_ACCESS_KEY_SECRET?: string
  ALIYUN_SMS_SIGN_NAME?: string
  ALIYUN_SMS_TEMPLATE_CODE?: string
}

/** 四项凭证全部配置才视为可用；缺任一项时调用方应回退 logSmsSender。 */
export function isAliyunSmsConfigured(env: AliyunSmsConfig): boolean {
  return Boolean(
    env.ALIYUN_ACCESS_KEY_ID
    && env.ALIYUN_ACCESS_KEY_SECRET
    && env.ALIYUN_SMS_SIGN_NAME
    && env.ALIYUN_SMS_TEMPLATE_CODE
  )
}

/**
 * 转换为阿里云收件号码格式：
 * 大陆号码去掉国家号发 11 位；其他国际号码去前导 '+' 原样透传（阿里云按 [国家号][号码] 接收）。
 */
export function toAliyunPhoneNumber(input: string): string {
  const bare = normalizePhoneNumber(input)
  if (bare) return bare
  return input.replace(/^\+/, '')
}

/** 日志脱敏：138****8000；无法识别为大陆号码时原样返回。 */
function maskPhoneNumber(input: string): string {
  const bare = normalizePhoneNumber(input)
  return bare ? `${bare.slice(0, 3)}****${bare.slice(7)}` : input
}

let cachedClient: Client | null = null

function getAliyunClient(config: AliyunSmsConfig): Client {
  if (!cachedClient) {
    cachedClient = new Client(new $OpenApiUtil.Config({
      accessKeyId: config.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: config.ALIYUN_ACCESS_KEY_SECRET,
      endpoint: 'dysmsapi.aliyuncs.com'
    }))
  }
  return cachedClient
}

/**
 * 阿里云短信发送器（SendSms，国内消息）。
 * 模板变量固定为 code（如「您的验证码为${code}」）；
 * 发送失败抛错，让 better-auth 的 send-otp 端点直接返回错误，避免用户空等验证码。
 */
export function createAliyunSmsSender(config: AliyunSmsConfig): SmsSender {
  return async ({ phoneNumber, code }) => {
    const request = new SendSmsRequest({
      phoneNumbers: toAliyunPhoneNumber(phoneNumber),
      signName: config.ALIYUN_SMS_SIGN_NAME,
      templateCode: config.ALIYUN_SMS_TEMPLATE_CODE,
      templateParam: JSON.stringify({ code })
    })
    const resp = await getAliyunClient(config).sendSms(request)
    const body = resp.body
    if (body?.code !== 'OK') {
      throw new Error(
        `阿里云短信发送失败：code=${body?.code ?? 'unknown'} message=${body?.message ?? ''} requestId=${body?.requestId ?? ''}`
      )
    }
    logger.info(`[OTP] 阿里云短信已受理：收件人=${maskPhoneNumber(phoneNumber)} requestId=${body.requestId ?? ''}`)
  }
}

let cachedSender: SmsSender | null = null

/**
 * 解析当前进程使用的验证码发送器：
 * 阿里云配置齐全 → 真实发送；否则回退日志模式（开发专用，生产必须配齐凭证）。
 * 结果按进程缓存，变更配置需重启服务。
 */
export function resolveSmsSender(): SmsSender {
  if (cachedSender) return cachedSender
  const env = getEnv()
  if (isAliyunSmsConfigured(env)) {
    cachedSender = createAliyunSmsSender(env)
    logger.info('[OTP] 已启用阿里云短信通道，验证码将真实发送')
  } else {
    cachedSender = logSmsSender
    logger.warn('[OTP] 未配置阿里云短信，验证码仅写入日志（开发模式，禁止用于生产）')
  }
  return cachedSender
}
