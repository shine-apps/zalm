import { and, asc, count, desc, eq, type SQL } from 'drizzle-orm'
import { db } from '../client'
import {
  user as userTable,
  userVerification as verificationTable,
  type ShowcaseMediaItem,
  type UserVerification,
  type VerificationKind,
  type VerificationPayload,
  type VerificationStatus
} from '../schema'

export interface NewVerificationInput {
  userId: string
  kind: VerificationKind
  payload: VerificationPayload
  verificationImage: string
  showcaseMedia: ShowcaseMediaItem[]
  introduction: string
  ocrResult?: Record<string, unknown> | null
}

/** 新建一条认证申请（状态默认 pending）。 */
export async function createVerification(input: NewVerificationInput): Promise<UserVerification> {
  const [row] = await db
    .insert(verificationTable)
    .values({
      userId: input.userId,
      kind: input.kind,
      payload: input.payload,
      verificationImage: input.verificationImage,
      showcaseMedia: input.showcaseMedia,
      introduction: input.introduction,
      ocrResult: input.ocrResult ?? null
    })
    .returning()
  return row!
}

/** 取某用户某类型最新一条申请（任何状态）。 */
export async function findLatestVerification(
  userId: string,
  kind: VerificationKind
): Promise<UserVerification | null> {
  const [row] = await db
    .select()
    .from(verificationTable)
    .where(and(eq(verificationTable.userId, userId), eq(verificationTable.kind, kind)))
    .orderBy(desc(verificationTable.createdAt))
    .limit(1)
  return row ?? null
}

/** 取某用户全部已通过认证（公开展示用）。 */
export async function findApprovedVerifications(userId: string): Promise<UserVerification[]> {
  return db
    .select()
    .from(verificationTable)
    .where(and(eq(verificationTable.userId, userId), eq(verificationTable.status, 'approved')))
    .orderBy(asc(verificationTable.kind))
}

export async function getVerificationById(id: string): Promise<UserVerification | null> {
  const [row] = await db
    .select()
    .from(verificationTable)
    .where(eq(verificationTable.id, id))
    .limit(1)
  return row ?? null
}

export interface VerificationApplicant {
  name: string
  email: string
}

/** 管理端详情：申请 + 申请人基础信息。 */
export async function getVerificationWithApplicantById(
  id: string
): Promise<{ verification: UserVerification, applicant: VerificationApplicant } | null> {
  const [row] = await db
    .select({
      verification: verificationTable,
      applicantName: userTable.name,
      applicantEmail: userTable.email
    })
    .from(verificationTable)
    .innerJoin(userTable, eq(userTable.id, verificationTable.userId))
    .where(eq(verificationTable.id, id))
    .limit(1)
  if (!row) return null
  return {
    verification: row.verification,
    applicant: { name: row.applicantName, email: row.applicantEmail }
  }
}

export interface ListVerificationsFilter {
  status?: VerificationStatus
  kind?: VerificationKind
  page: number
  pageSize: number
}

/** 管理端列表：按提交时间升序（先提交先审），支持状态/类型筛选。 */
export async function listVerifications(filter: ListVerificationsFilter): Promise<{
  items: Array<{ verification: UserVerification, applicant: VerificationApplicant }>
  total: number
}> {
  const conditions: SQL[] = []
  if (filter.status) conditions.push(eq(verificationTable.status, filter.status))
  if (filter.kind) conditions.push(eq(verificationTable.kind, filter.kind))
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        verification: verificationTable,
        applicantName: userTable.name,
        applicantEmail: userTable.email
      })
      .from(verificationTable)
      .innerJoin(userTable, eq(userTable.id, verificationTable.userId))
      .where(where)
      .orderBy(asc(verificationTable.createdAt))
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize),
    db.select({ value: count() }).from(verificationTable).where(where)
  ])
  const total = totalRows[0]?.value ?? 0

  return {
    items: rows.map(row => ({
      verification: row.verification,
      applicant: { name: row.applicantName, email: row.applicantEmail }
    })),
    total
  }
}

/**
 * 审核：仅允许从 pending 转出（并发/重复审核时 returning 为空，返回 null，由调用方报 409）。
 * updatedAt 由 schema 的 $onUpdate 自动维护。
 */
export async function reviewVerification(input: {
  id: string
  action: 'approve' | 'reject'
  reviewerId: string
  rejectReason?: string
}): Promise<UserVerification | null> {
  const [row] = await db
    .update(verificationTable)
    .set({
      status: input.action === 'approve' ? 'approved' : 'rejected',
      reviewedBy: input.reviewerId,
      reviewedAt: new Date(),
      rejectReason: input.action === 'reject' ? (input.rejectReason ?? null) : null
    })
    .where(and(eq(verificationTable.id, input.id), eq(verificationTable.status, 'pending')))
    .returning()
  return row ?? null
}
