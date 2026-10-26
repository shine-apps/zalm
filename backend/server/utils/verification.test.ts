import { describe, expect, it, vi } from 'vitest'
import type { UserVerification } from '../database/schema'
import {
  assertVerificationMedia,
  toAdminVerificationView,
  toMyVerificationView,
  toPublicVerificationView
} from './verification'

const { mockGetByUrl } = vi.hoisted(() => ({ mockGetByUrl: vi.fn() }))
vi.mock('../database/repositories/media', () => ({ getMediaFileByUrl: mockGetByUrl }))

// vitest 环境没有 Nitro 自动导入，补一个与 utils/errors 行为一致的 createApiError 桩
;(globalThis as Record<string, unknown>).createApiError = (
  code: string,
  extra?: { message?: string }
) => Object.assign(new Error(extra?.message ?? code), { code })

function makeRow(overrides: Partial<UserVerification> = {}): UserVerification {
  return {
    id: 'v-1',
    userId: 'u-1',
    kind: 'personal',
    status: 'approved',
    payload: { realName: '张三', idCardNumber: '110101199003071276' },
    verificationImage: 'https://cos.example.com/images/verification/id.jpg',
    showcaseMedia: [
      { url: 'https://cos.example.com/images/verification/a.jpg', type: 'image' },
      { url: 'https://cos.example.com/videos/verification/b.mp4', type: 'video' }
    ],
    introduction: '热爱公益',
    ocrResult: { realName: '张三' },
    reviewedBy: 'admin-1',
    reviewedAt: new Date('2026-01-02T00:00:00Z'),
    rejectReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides
  }
}

describe('toMyVerificationView', () => {
  it('keeps reject reason only when rejected', () => {
    expect(toMyVerificationView(makeRow()).rejectReason).toBeNull()
    const rejected = makeRow({ status: 'rejected', rejectReason: '照片模糊' })
    expect(toMyVerificationView(rejected).rejectReason).toBe('照片模糊')
  })

  it('never exposes the ocr snapshot to the owner view', () => {
    expect(toMyVerificationView(makeRow())).not.toHaveProperty('ocrResult')
  })
})

describe('toPublicVerificationView', () => {
  it('exposes showcase media, introduction and approval time', () => {
    expect(toPublicVerificationView(makeRow())).toEqual({
      kind: 'personal',
      companyName: null,
      showcaseMedia: [
        { url: 'https://cos.example.com/images/verification/a.jpg', type: 'image' },
        { url: 'https://cos.example.com/videos/verification/b.mp4', type: 'video' }
      ],
      introduction: '热爱公益',
      approvedAt: new Date('2026-01-02T00:00:00Z')
    })
  })

  it('exposes company name for enterprise verifications', () => {
    const row = makeRow({
      kind: 'enterprise',
      payload: {
        companyName: '众爱联盟科技有限公司',
        creditCode: '91110108MA01C8YT3Q',
        legalPerson: '张三'
      }
    })
    expect(toPublicVerificationView(row).companyName).toBe('众爱联盟科技有限公司')
  })

  it('never leaks sensitive fields (privacy red lines)', () => {
    const view = toPublicVerificationView(makeRow())
    expect(view).not.toHaveProperty('payload')
    expect(view).not.toHaveProperty('verificationImage')
    expect(view).not.toHaveProperty('ocrResult')
    expect(view).not.toHaveProperty('rejectReason')
    expect(view).not.toHaveProperty('userId')
    expect(view).not.toHaveProperty('reviewedBy')
  })
})

describe('toAdminVerificationView', () => {
  it('includes ocr snapshot and applicant for review comparison', () => {
    const view = toAdminVerificationView(makeRow(), { name: '张三', email: 'a@b.com' })
    expect(view.ocrResult).toEqual({ realName: '张三' })
    expect(view.applicant).toEqual({ name: '张三', email: 'a@b.com' })
    expect(view.userId).toBe('u-1')
  })

  it('keeps the raw reject reason regardless of status', () => {
    const view = toAdminVerificationView(makeRow({ status: 'rejected', rejectReason: '照片模糊' }))
    expect(view.rejectReason).toBe('照片模糊')
  })
})

describe('assertVerificationMedia', () => {
  const UUID = '11111111-1111-1111-1111-111111111111'
  const IMG_URL = `https://cos.example.com/images/verification/${UUID}.jpg`
  const VIDEO_URL = `https://cos.example.com/videos/verification/${UUID}.mp4`

  it('rejects unregistered or foreign-scope media', async () => {
    mockGetByUrl.mockResolvedValueOnce(null)
    await expect(assertVerificationMedia(IMG_URL))
      .rejects.toThrow('媒体文件未登记或不属于认证域')

    mockGetByUrl.mockResolvedValueOnce({ metadata: { key: `images/activity/${UUID}.jpg` } })
    await expect(assertVerificationMedia(IMG_URL))
      .rejects.toThrow('媒体文件未登记或不属于认证域')
  })

  it('rejects a video object submitted as the ID photo', async () => {
    mockGetByUrl.mockResolvedValueOnce({ metadata: { key: `videos/verification/${UUID}.mp4` } })
    await expect(assertVerificationMedia(VIDEO_URL, 'image'))
      .rejects.toThrow('媒体类型与实际文件不一致')
  })

  it('rejects showcase items whose declared type mismatches the object key', async () => {
    mockGetByUrl.mockResolvedValueOnce({ metadata: { key: `videos/verification/${UUID}.mp4` } })
    await expect(assertVerificationMedia(VIDEO_URL, 'image'))
      .rejects.toThrow('媒体类型与实际文件不一致')
  })

  it('passes when registration, scope and declared type all match', async () => {
    mockGetByUrl.mockResolvedValueOnce({ metadata: { key: `images/verification/${UUID}.jpg` } })
    await expect(assertVerificationMedia(IMG_URL, 'image')).resolves.toBeUndefined()

    mockGetByUrl.mockResolvedValueOnce({ metadata: { key: `videos/verification/${UUID}.mp4` } })
    await expect(assertVerificationMedia(VIDEO_URL, 'video')).resolves.toBeUndefined()
  })
})
