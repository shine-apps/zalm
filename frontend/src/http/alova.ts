import AdapterUniapp from '@alova/adapter-uniapp'
import { createAlova } from 'alova'
import VueHook from 'alova/vue'
import { cookieJar } from './cookie-jar'

/** 后端统一成功响应结构：{ code:'OK', data, pagination? } */
export interface ApiEnvelope<T = any> {
  code: string
  message?: string
  data: T
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  issues?: unknown
}

/** method.config.meta 上的自定义标记 */
export interface RequestMeta {
  /**
   * 命中 Better Auth 原生端点（/api/auth/*）。
   * 这些端点成功时直接返回裸数据（如 user），不走 { code:'OK', data } 包装。
   */
  rawAuth?: boolean
  /**
   * 返回后端完整信封 { code,data,pagination?,stats? }（不剥离 data）。
   * 用于需要 pagination 或顶层 stats 的分页/名单接口。
   */
  rawEnvelope?: boolean
  /** 出错时是否自动 toast（默认 true）。 */
  toast?: boolean
  /** 401 时是否跳过“清态并弹提示”（用于启动时静默探测会话）。 */
  skipAuthRedirect?: boolean
  [key: string]: unknown
}

// H5 端走 vite 同源代理（/api -> http://localhost:9999），相对路径以便浏览器自动携带会话 Cookie；
// 非 H5 端（小程序/App）无代理，直连后端基址并补上统一的 /api 前缀。
let baseURL = '/api'
// #ifndef H5
baseURL = `${import.meta.env.VITE_SERVER_BASEURL}/api`
// #endif

/**
 * 401：仅清除本地登录态（Cookie 单通道，无 refresh token 概念），不自动跳转登录页。
 * 登录引导由受保护页面的 onShow 守卫或用户主动操作（如「登录」按钮、报名）负责。
 */
async function handleUnauthorized() {
  try {
    // 动态引入以打破 alova <-> store <-> api 之间的静态循环依赖
    const { useAuthStore } = await import('@/store/auth')
    useAuthStore().clear()
  }
  catch {
    // 忽略 store 尚未就绪的极端情况
  }
}

function pickMessage(raw: unknown): string {
  return (raw as ApiEnvelope | null | undefined)?.message || ''
}

/**
 * alova 请求实例（Cookie 会话模式）。
 * - beforeRequest 不注入 Authorization，会话完全由 HttpOnly Cookie 承载；
 * - responded 解析后端统一结构，code !== 'OK' 抛错，HTTP 401 仅清态不跳转。
 */
const alovaInstance = createAlova({
  baseURL,
  ...AdapterUniapp(),
  timeout: 15000,
  statesHook: VueHook,
  // 本工程所有接口随会话 Cookie 个性化（如 myRegistration），alova 默认 GET 缓存 5 分钟
  // 内存快照，会导致写操作后 load() 拿到旧数据（报名后按钮仍显示「立即报名」），同设备
  // 切换账号也会串视图。注意：cacheFor 必须在实例配置（Method 构造期）关闭——alova 在
  // sendRequest 中先读 cacheFor 查缓存、后执行 beforeRequest，在 beforeRequest 里改
  // method.config.cacheFor 对当次请求不生效。0 = 写入即过期，等于不缓存。
  cacheFor: { GET: 0 },

  beforeRequest(method) {
    // upload 走 multipart/form-data，Content-Type 需由 uni.uploadFile/浏览器自带 boundary，
    // 这里不能指定 application/json，否则服务端无法解析表单
    const isUpload = method.config.requestType === 'upload'
    method.config.headers = {
      ...(isUpload ? {} : { 'Content-Type': 'application/json' }),
      Accept: 'application/json, text/plain, */*',
      ...method.config.headers,
    }
    // #ifndef H5
    // 小程序/App：从本地 cookie 罐恢复会话（H5 由浏览器自动携带）
    const cookieHeader = cookieJar.getCookieHeader()
    if (cookieHeader) {
      method.config.headers.Cookie = cookieHeader
    }
    // #endif
  },

  responded: {
    onSuccess(response: any, method: any) {
      const { config } = method
      const meta = (config.meta ?? {}) as RequestMeta

      // #ifndef H5
      // 小程序/App：落盘 Set-Cookie（登录下发、会话轮换都依赖此步）
      cookieJar.saveFromResponseHeaders(response?.header)
      // #endif

      // 上传/下载请求原样返回，交由调用方处理
      if (config.requestType === 'upload' || config.requestType === 'download') {
        return response
      }

      const statusCode = response?.statusCode as number
      const rawData = response?.data

      // 401：未登录 / 会话失效
      if (statusCode === 401) {
        const silent = meta.skipAuthRedirect === true
        if (!silent) {
          void handleUnauthorized()
        }
        const message = pickMessage(rawData) || '登录已过期，请重新登录'
        if (!silent && meta.toast !== false) {
          uni.showToast({ title: message, icon: 'none' })
        }
        const error: any = new Error(message)
        error.statusCode = 401
        error.code = (rawData as ApiEnvelope | null)?.code
        throw error
      }

      // 其余非 2xx：按后端统一错误负载 { code, message, issues? } 提示
      if (statusCode < 200 || statusCode >= 300) {
        const message = pickMessage(rawData) || `请求失败[${statusCode}]`
        if (meta.toast !== false) {
          uni.showToast({ title: message, icon: 'none' })
        }
        const error: any = new Error(message)
        error.statusCode = statusCode
        error.code = (rawData as ApiEnvelope | null)?.code
        throw error
      }

      // Better Auth 原生端点：成功返回裸数据（sign-in 返回 user、sign-out 返回空对象）
      if (meta.rawAuth) {
        return rawData
      }

      // 统一包装：默认返回 data；rawEnvelope 返回完整信封（含 pagination/stats）
      const body = rawData as ApiEnvelope
      if (body && body.code === 'OK') {
        if (meta.rawEnvelope)
          return body
        return body.data
      }
      const message = body?.message || '请求失败'
      if (meta.toast !== false) {
        uni.showToast({ title: message, icon: 'none' })
      }
      const error: any = new Error(message)
      error.code = body?.code
      throw error
    },

    onError(err: unknown) {
      // 网络层错误（断网、超时、跨域等）给出统一提示后继续抛出
      const message = err instanceof Error ? err.message : '网络异常，请稍后再试'
      uni.showToast({ title: message, icon: 'none' })
      throw err
    },
  },
})

export const http = alovaInstance
