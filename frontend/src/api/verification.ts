import type { Paged } from './activity'
import { http } from '@/http/alova'

export type VerificationKind = 'personal' | 'enterprise'
export type VerificationStatus = 'pending' | 'approved' | 'rejected'

export interface PersonalPayload {
  realName: string
  idCardNumber: string
}

export interface EnterprisePayload {
  companyName: string
  creditCode: string
  legalPerson: string
}

export type VerificationPayload = PersonalPayload | EnterprisePayload

export interface ShowcaseMediaItem {
  url: string
  type: 'image' | 'video'
}

export interface MyVerificationView {
  id: string
  kind: VerificationKind
  status: VerificationStatus
  payload: VerificationPayload
  verificationImage: string
  showcaseMedia: ShowcaseMediaItem[]
  introduction: string
  rejectReason: string | null
  createdAt: string
  reviewedAt: string | null
}

export interface MyVerifications {
  personal: MyVerificationView | null
  enterprise: MyVerificationView | null
}

export interface PublicVerificationView {
  kind: VerificationKind
  companyName: string | null
  showcaseMedia: ShowcaseMediaItem[]
  introduction: string
  approvedAt: string | null
}

export interface SubmitVerificationBody {
  kind: VerificationKind
  payload: VerificationPayload
  verificationImage: string
  showcaseMedia: ShowcaseMediaItem[]
  introduction: string
  ocrResult?: Record<string, unknown>
}

/** 我的两类认证最新状态（pending/approved/rejected 或未申请为 null）。 */
export function fetchMyVerifications() {
  return http.Get('/verification/me') as unknown as Promise<MyVerifications>
}

/** 证件照 OCR 预填：fields 为 null 表示未识别（前端回退手填）。 */
export function recognizeVerificationImage(kind: VerificationKind, imageUrl: string) {
  return http.Post('/verification/ocr', { kind, imageUrl }) as unknown as Promise<{
    fields: Record<string, string> | null
  }>
}

export function submitVerification(body: SubmitVerificationBody) {
  return http.Post('/verification', body) as unknown as Promise<MyVerificationView>
}

/** 公开数据（user-home 用）：静默探测，未登录/失败不跳转不 toast。 */
export function getUserVerifications(userId: string) {
  return http.Get(`/users/${userId}/verification`, {
    meta: { skipAuthRedirect: true, toast: false },
  }) as unknown as Promise<PublicVerificationView[]>
}

// —— 认证审核（仅 admin，复用 PC 后台同款接口） ——

/** 管理端视图：全量字段 + OCR 快照 + 申请人信息。 */
export interface AdminVerificationView extends Omit<MyVerificationView, 'rejectReason'> {
  userId: string
  ocrResult: Record<string, unknown> | null
  reviewedBy: string | null
  rejectReason: string | null
  applicant?: { name: string, email: string }
}

/** 管理端认证申请列表（状态/类型筛选 + 分页）。 */
export function getAdminVerifications(
  page: number,
  opts: { status?: VerificationStatus, kind?: VerificationKind } = {},
  pageSize = 20,
): Promise<Paged<AdminVerificationView>> {
  return http.Get('/admin/verifications', {
    params: {
      page,
      pageSize,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.kind ? { kind: opts.kind } : {}),
    },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<AdminVerificationView>>
}

/** 审核操作：驳回必须带原因。 */
export function reviewVerification(
  id: string,
  action: 'approve' | 'reject',
  rejectReason?: string,
): Promise<AdminVerificationView> {
  return http.Post(`/admin/verifications/${id}/review`, {
    action,
    ...(rejectReason ? { rejectReason } : {}),
  }) as unknown as Promise<AdminVerificationView>
}
