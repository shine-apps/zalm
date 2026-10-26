import type {
  ShowcaseMediaItem,
  UserVerification,
  VerificationKind,
  VerificationStatus
} from '../database/schema'
import { getMediaFileByUrl } from '../database/repositories/media'
import { parseObjectKey, type ParsedObjectKey } from './media'

/** 本人视图：含驳回原因（仅 rejected 时透出），不含 ocrResult（OCR 快照仅供管理员比对）。 */
export interface MyVerificationView {
  id: string
  kind: VerificationKind
  status: VerificationStatus
  payload: UserVerification['payload']
  verificationImage: string
  showcaseMedia: ShowcaseMediaItem[]
  introduction: string
  rejectReason: string | null
  createdAt: Date
  reviewedAt: Date | null
}

export function toMyVerificationView(row: UserVerification): MyVerificationView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    payload: row.payload,
    verificationImage: row.verificationImage,
    showcaseMedia: row.showcaseMedia,
    introduction: row.introduction,
    rejectReason: row.status === 'rejected' ? row.rejectReason : null,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt
  }
}

/**
 * 公开视图（游客可见）：只暴露已通过认证的相册/介绍与企业名称。
 * 隐私红线：绝不包含 payload（证件号）、verificationImage（证件照）、
 * ocrResult、rejectReason、userId、reviewedBy。
 */
export interface PublicVerificationView {
  kind: VerificationKind
  companyName: string | null
  showcaseMedia: ShowcaseMediaItem[]
  introduction: string
  approvedAt: Date | null
}

export function toPublicVerificationView(row: UserVerification): PublicVerificationView {
  return {
    kind: row.kind,
    companyName: 'companyName' in row.payload ? row.payload.companyName : null,
    showcaseMedia: row.showcaseMedia,
    introduction: row.introduction,
    approvedAt: row.reviewedAt
  }
}

/** 管理端视图：全量字段 + OCR 快照（供比对）+ 申请人信息。 */
export interface AdminVerificationView extends MyVerificationView {
  userId: string
  ocrResult: Record<string, unknown> | null
  reviewedBy: string | null
  applicant?: { name: string, email: string }
}

export function toAdminVerificationView(
  row: UserVerification,
  applicant?: { name: string, email: string }
): AdminVerificationView {
  return {
    ...toMyVerificationView(row),
    rejectReason: row.rejectReason,
    userId: row.userId,
    ocrResult: row.ocrResult,
    reviewedBy: row.reviewedBy,
    ...(applicant ? { applicant } : {})
  }
}

/**
 * 取认证域已登记媒体的 key 解析结果（含路径推导的实际媒体类型）：
 * 必须已登记在 media_file 且 scope=verification。
 * 证件照/相册只允许引用认证域已登记媒体，防止引用他域文件绕过登记校验。
 */
export async function findVerificationMedia(url: string): Promise<ParsedObjectKey | null> {
  const media = await getMediaFileByUrl(url)
  const key = media?.metadata?.key
  if (!key) return null
  const parsed = parseObjectKey(key)
  if (!parsed || parsed.scope !== 'verification') return null
  return parsed
}

/**
 * 断言 URL 是认证域已登记媒体，且（可选）实际类型与期望一致，否则抛 VALIDATION_ERROR。
 * expectedType 用于交叉校验客户端声明的媒体类型（key 前缀经 register 的 MIME 权威核对，可信）。
 */
export async function assertVerificationMedia(
  url: string,
  expectedType?: 'image' | 'video'
): Promise<void> {
  const parsed = await findVerificationMedia(url)
  if (!parsed) {
    throw createApiError('VALIDATION_ERROR', { message: '媒体文件未登记或不属于认证域' })
  }
  if (expectedType && parsed.type !== expectedType) {
    throw createApiError('VALIDATION_ERROR', { message: '媒体类型与实际文件不一致' })
  }
}
