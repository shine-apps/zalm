import { describe, expect, it } from 'vitest'
import {
  isValidIdCardNumber,
  listVerificationsQuerySchema,
  reviewVerificationSchema,
  submitVerificationSchema
} from './verification'

const VALID_ID = '110101199003071276'
const VALID_ID_X = '11010119960307127X'
const VALID_CREDIT_CODE = '91110108MA01C8YT3Q'

describe('isValidIdCardNumber', () => {
  it('accepts valid id card numbers including check code X', () => {
    expect(isValidIdCardNumber(VALID_ID)).toBe(true)
    expect(isValidIdCardNumber(VALID_ID_X)).toBe(true)
  })

  it('rejects wrong checksum', () => {
    expect(isValidIdCardNumber('110101199003071277')).toBe(false)
    expect(isValidIdCardNumber('123456789012345678')).toBe(false)
  })

  it('rejects malformed numbers', () => {
    expect(isValidIdCardNumber('11010119900307127')).toBe(false)
    expect(isValidIdCardNumber('1101011990030712760')).toBe(false)
    expect(isValidIdCardNumber('')).toBe(false)
    // 小写 x 由 schema 层 toUpperCase 兜底，纯函数只认大写
    expect(isValidIdCardNumber('11010119960307127x')).toBe(false)
  })
})

describe('submitVerificationSchema', () => {
  const personalPayload = { realName: '张三', idCardNumber: VALID_ID }
  const enterprisePayload = {
    companyName: '众爱联盟科技有限公司',
    creditCode: VALID_CREDIT_CODE,
    legalPerson: '张三'
  }

  it('parses personal verification and applies defaults', () => {
    const parsed = submitVerificationSchema.parse({
      kind: 'personal',
      payload: personalPayload,
      verificationImage: 'https://cos.example.com/images/verification/id.jpg'
    })
    expect(parsed.showcaseMedia).toEqual([])
    expect(parsed.introduction).toBe('')
    expect(parsed.ocrResult).toBeUndefined()
  })

  it('normalizes id card number to uppercase before checksum validation', () => {
    const parsed = submitVerificationSchema.parse({
      kind: 'personal',
      payload: { realName: '张三', idCardNumber: '11010119960307127x' },
      verificationImage: 'u'
    })
    if (parsed.kind !== 'personal') throw new Error('expected personal')
    expect(parsed.payload.idCardNumber).toBe(VALID_ID_X)
  })

  it('rejects invalid id card number with a friendly issue', () => {
    const result = submitVerificationSchema.safeParse({
      kind: 'personal',
      payload: { realName: '张三', idCardNumber: '110101199003071277' },
      verificationImage: 'u'
    })
    expect(result.success).toBe(false)
  })

  it('accepts enterprise payload, trims and uppercases fields', () => {
    const parsed = submitVerificationSchema.parse({
      kind: 'enterprise',
      payload: { companyName: '  众爱联盟科技有限公司  ', creditCode: '91110108ma01c8yt3q', legalPerson: '张三' },
      verificationImage: 'u'
    })
    if (parsed.kind !== 'enterprise') throw new Error('expected enterprise')
    expect(parsed.payload.companyName).toBe('众爱联盟科技有限公司')
    expect(parsed.payload.creditCode).toBe(VALID_CREDIT_CODE)
  })

  it('rejects credit code with characters outside the allowed set', () => {
    const result = submitVerificationSchema.safeParse({
      kind: 'enterprise',
      payload: { ...enterprisePayload, creditCode: '91110108MA01C8YT3I' },
      verificationImage: 'u'
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 9 showcase media items', () => {
    const result = submitVerificationSchema.safeParse({
      kind: 'personal',
      payload: personalPayload,
      verificationImage: 'u',
      showcaseMedia: Array.from({ length: 10 }, (_, i) => ({ url: `u${i}`, type: 'image' }))
    })
    expect(result.success).toBe(false)
  })

  it('rejects introduction longer than 2000 chars', () => {
    const result = submitVerificationSchema.safeParse({
      kind: 'personal',
      payload: personalPayload,
      verificationImage: 'u',
      introduction: 'x'.repeat(2001)
    })
    expect(result.success).toBe(false)
  })

  it('passes through the ocr snapshot verbatim', () => {
    const parsed = submitVerificationSchema.parse({
      kind: 'personal',
      payload: personalPayload,
      verificationImage: 'u',
      ocrResult: { realName: '张三', idCardNumber: VALID_ID }
    })
    expect(parsed.ocrResult).toEqual({ realName: '张三', idCardNumber: VALID_ID })
  })
})

describe('listVerificationsQuerySchema', () => {
  it('applies pagination defaults and coerces string page params', () => {
    expect(listVerificationsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
    expect(listVerificationsQuerySchema.parse({ page: '2' })).toEqual({ page: 2, pageSize: 20 })
  })

  it('accepts status and kind filters', () => {
    expect(listVerificationsQuerySchema.parse({ status: 'pending', kind: 'personal' }))
      .toEqual({ page: 1, pageSize: 20, status: 'pending', kind: 'personal' })
  })
})

describe('reviewVerificationSchema', () => {
  it('allows approve without a reason', () => {
    expect(reviewVerificationSchema.parse({ action: 'approve' })).toEqual({ action: 'approve' })
  })

  it('requires a reason when rejecting', () => {
    expect(reviewVerificationSchema.safeParse({ action: 'reject' }).success).toBe(false)
    expect(reviewVerificationSchema.safeParse({ action: 'reject', rejectReason: '  ' }).success).toBe(false)
  })

  it('accepts reject with a reason', () => {
    expect(reviewVerificationSchema.parse({ action: 'reject', rejectReason: '照片模糊' }))
      .toEqual({ action: 'reject', rejectReason: '照片模糊' })
  })
})
