import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMyVerifications, getUserVerifications, recognizeVerificationImage, submitVerification } from './verification'

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}))

vi.mock('@/http/alova', () => ({
  http: { Get: mockGet, Post: mockPost },
}))

describe('api/verification', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
  })

  it('fetchMyVerifications GETs /verification/me', () => {
    fetchMyVerifications()
    expect(mockGet).toHaveBeenCalledWith('/verification/me')
  })

  it('recognizeVerificationImage POSTs kind and imageUrl', () => {
    recognizeVerificationImage('personal', 'https://cos.example.com/images/verification/x.png')
    expect(mockPost).toHaveBeenCalledWith('/verification/ocr', {
      kind: 'personal',
      imageUrl: 'https://cos.example.com/images/verification/x.png',
    })
  })

  it('submitVerification POSTs the body verbatim', () => {
    const body = {
      kind: 'enterprise' as const,
      payload: { companyName: '某公司', creditCode: '91110108MA01C8YT3Q', legalPerson: '李四' },
      verificationImage: 'https://cos.example.com/images/verification/y.png',
      showcaseMedia: [{ url: 'https://cos.example.com/images/verification/z.png', type: 'image' as const }],
      introduction: '介绍',
      ocrResult: { companyName: '某公司' },
    }
    submitVerification(body)
    expect(mockPost).toHaveBeenCalledWith('/verification', body)
  })

  it('getUserVerifications uses silent meta for guests', () => {
    getUserVerifications('u1')
    expect(mockGet).toHaveBeenCalledWith('/users/u1/verification', {
      meta: { skipAuthRedirect: true, toast: false },
    })
  })
})
