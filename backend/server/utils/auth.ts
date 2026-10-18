import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { phoneNumber } from 'better-auth/plugins'
import { db } from '../database/client'
import * as schema from '../database/schema'
import { ensureUserRoleByName, getRoleNamesByUserId } from '../database/repositories/roles'
import { getEnv, getTrustedOrigins } from './env'
import { logger } from './logger'
import { isValidPhoneNumber, resolveSmsSender } from './sms'
import { wechatPhone } from './auth-wechat'

const env = getEnv()

/** 验证码发送通道：阿里云配置齐全走真实发送，否则回退日志（详见 sms.resolveSmsSender）。 */
const smsSender = resolveSmsSender()

/** 角色 name 常量：授权判据统一用 name，不使用独立 key 字段。 */
export const ADMIN_ROLE = 'admin'
export const DEFAULT_USER_ROLE = 'user'

/** 活动组织者角色：activity_admin 或 admin 均可组织活动。 */
export const ACTIVITY_ADMIN_ROLE = 'activity_admin'
export const ACTIVITY_ORGANIZER_ROLES = [ADMIN_ROLE, ACTIVITY_ADMIN_ROLE]

/**
 * Better Auth 实例（Cookie 单通道）。
 * - 邮箱密码（minPasswordLength=8）
 * - phoneNumber 插件：OTP 存入自带 verification 表；sendOTP 由 resolveSmsSender() 决定
 *   （阿里云配置齐全真实发送，否则日志打印）
 * - 自助注册成功后默认挂 user 角色；管理员建用户走仓储直接入库（不触发此 hook）
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: getTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification
    }
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // 管理员创建的用户邮箱视为已验证
    requireEmailVerification: false
  },
  user: {
    additionalFields: {
      banned: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false
      }
    }
  },
  plugins: [
    phoneNumber({
      // 6 位数字验证码，5 分钟有效，错误最多尝试 3 次（插件默认）
      otpLength: 6,
      expiresIn: 300,
      phoneNumberValidator: isValidPhoneNumber,
      // 阿里云四项凭证配置齐全时真实发送，否则自动回退为日志打印
      sendOTP: smsSender,
      // 验证码校验通过但用户不存在：自动建号（手机号即已验证），
      // 由下方 databaseHooks.user.create.after 自动挂默认 user 角色
      signUpOnVerification: {
        // 客户端上送带国家号（如 '+8613800138000'），邮箱本地部分只保留数字
        getTempEmail: (phone: string) => `${phone.replace(/\D/g, '')}@phone.local`
      }
    }),
    // 微信小程序「获取手机号」一键登录（/api/auth/wechat/phone-sign-in）
    wechatPhone()
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          if (!createdUser?.id) return
          try {
            await ensureUserRoleByName(createdUser.id, DEFAULT_USER_ROLE)
          } catch (err) {
            logger.error('为新注册用户分配默认角色失败', { userId: createdUser.id, err: String(err) })
          }
        }
      }
    }
  }
})

/** 读取用户角色 name 列表。 */
export async function getUserRoleNames(userId: string): Promise<string[]> {
  return getRoleNamesByUserId(userId)
}
