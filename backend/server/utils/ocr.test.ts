import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  delete process.env.OCR_MOCK
})

describe('ocr utils', () => {
  it('returns mock id card fields when OCR_MOCK=true', async () => {
    process.env.OCR_MOCK = 'true'
    const mod = await import('./ocr')
    const result = await mod.recognizeIdCard(Buffer.from('x'))
    expect(result?.fields).toEqual({ realName: '张三', idCardNumber: '110101199003071276' })
  })

  it('returns mock biz license fields when OCR_MOCK=true', async () => {
    process.env.OCR_MOCK = 'true'
    const mod = await import('./ocr')
    const result = await mod.recognizeBizLicense(Buffer.from('x'))
    expect(result?.fields).toEqual({
      companyName: '众爱联盟科技有限公司',
      creditCode: '91110108MA01C8YT3Q',
      legalPerson: '张三'
    })
  })

  it('degrades to null when COS credentials are not configured (no network call)', async () => {
    process.env.OCR_MOCK = 'false'
    process.env.TENCENT_COS_SECRET_ID = ''
    process.env.TENCENT_COS_SECRET_KEY = ''
    process.env.TENCENT_COS_BUCKET = ''
    const mod = await import('./ocr')
    await expect(mod.recognizeIdCard(Buffer.from('x'))).resolves.toBeNull()
  })
})
