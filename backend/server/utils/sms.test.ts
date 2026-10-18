import { describe, expect, it } from 'vitest'
import {
  isAliyunSmsConfigured,
  normalizePhoneNumber,
  toAliyunPhoneNumber
} from './sms'

describe('isAliyunSmsConfigured', () => {
  const full = {
    ALIYUN_ACCESS_KEY_ID: 'ak',
    ALIYUN_ACCESS_KEY_SECRET: 'sk',
    ALIYUN_SMS_SIGN_NAME: '众爱联盟',
    ALIYUN_SMS_TEMPLATE_CODE: 'SMS_123456'
  }

  it('四项齐全才视为已配置', () => {
    expect(isAliyunSmsConfigured(full)).toBe(true)
  })

  it('缺任一项（含空串）视为未配置', () => {
    expect(isAliyunSmsConfigured({})).toBe(false)
    expect(isAliyunSmsConfigured({ ...full, ALIYUN_ACCESS_KEY_ID: undefined })).toBe(false)
    expect(isAliyunSmsConfigured({ ...full, ALIYUN_ACCESS_KEY_SECRET: '' })).toBe(false)
    expect(isAliyunSmsConfigured({ ...full, ALIYUN_SMS_SIGN_NAME: '' })).toBe(false)
    expect(isAliyunSmsConfigured({ ...full, ALIYUN_SMS_TEMPLATE_CODE: undefined })).toBe(false)
  })
})

describe('toAliyunPhoneNumber', () => {
  it('大陆号码归一化为 11 位（兼容 +86/86/分隔符写法）', () => {
    expect(toAliyunPhoneNumber('+8613800138000')).toBe('13800138000')
    expect(toAliyunPhoneNumber('86 138-0013-8000')).toBe('13800138000')
    expect(toAliyunPhoneNumber('13800138000')).toBe('13800138000')
  })

  it('非大陆号码仅去前导 + 透传', () => {
    expect(toAliyunPhoneNumber('+14155552671')).toBe('14155552671')
  })
})

describe('normalizePhoneNumber', () => {
  it('非法号码返回 null', () => {
    expect(normalizePhoneNumber('12345678901')).toBeNull()
    expect(normalizePhoneNumber('1380013800')).toBeNull()
    expect(normalizePhoneNumber('abc')).toBeNull()
  })
})
