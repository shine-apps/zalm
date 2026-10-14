import { afterEach, describe, expect, it, vi } from 'vitest'
import { signJsApiTicket } from './wechat-oa'

afterEach(() => {
  vi.resetModules()
})

describe('signJsApiTicket', () => {
  // 微信官方文档附录 1 的示例向量：
  // https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html
  it('matches the official documentation signature vector', () => {
    const signature = signJsApiTicket(
      'sM4AOVdWfPE4DxkXGEs8VMCPGGVi4C3VM0P37wVUCFvkVAy_90u5h9nbSlYy3-Sl-HhTdfl2fzFy1AOcHKP7qg',
      'Wm3WZYTPz0wzccnW',
      '1414587457',
      'http://mp.weixin.qq.com?params=value'
    )
    expect(signature).toBe('0f9de62fce790f9a083d5c99e95740ceb90c27ed')
  })

  it('produces a different signature when any input changes', () => {
    const base = ['ticket-a', 'nonce-b', '1700000000', 'https://example.com/h5/#/pages/x'] as const
    const sig = signJsApiTicket(...base)
    expect(sig).toMatch(/^[0-9a-f]{40}$/)
    expect(signJsApiTicket('ticket-b', base[1], base[2], base[3])).not.toBe(sig)
    expect(signJsApiTicket(base[0], base[1], base[2], `${base[3]}?y=1`)).not.toBe(sig)
  })
})

describe('buildWxJsSdkSignature', () => {
  it('throws a config error when OA credentials are missing', async () => {
    process.env.WECHAT_OA_APPID = ''
    process.env.WECHAT_OA_SECRET = ''
    process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/zhongailianmeng'
    process.env.BETTER_AUTH_URL ??= 'http://localhost:9999'
    process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
    const mod = await import('./wechat-oa')
    await expect(mod.buildWxJsSdkSignature('https://example.com/h5/')).rejects.toBeInstanceOf(
      mod.WechatOaConfigError
    )
  })
})
