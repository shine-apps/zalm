# 用户实名认证实施计划

> **REQUIRED SUB-SKILL:** 执行本计划时配合 executing-plans 流程（subagent-driven 或 inline 逐 Task 执行）。每个 Task 内的步骤按顺序完成并验证后，再进入下一个 Task。

**Goal:** 实现用户实名认证：个人认证（身份证）与企业认证（营业执照）可并存；腾讯云 OCR 预填 + 管理员人工审核；审核结果经站内通知送达；认证信息（相册 + 介绍）在用户主页公开展示。

**Architecture:** 复用现有 COS 直传链路（STS 凭证 → 前端直传 → 服务端登记）承载证件照与展示媒体（媒体白名单新增 `verification` scope）；新增独立 OCR 预填端点（仅返回识别字段、不落库）；提交落 `user_verification` 表（驳回可重提、通过即锁定）；管理员后台比对 OCR 快照与用户提交后审核；公开端点仅暴露已通过认证的相册/介绍/企业名。

**Tech Stack:** Nuxt 4.5 + Drizzle ORM 0.45 + PostgreSQL 18 + Better Auth 1.7（backend）；unibest + Vue 3.4 + wot-ui v2 + alova 3（frontend）；腾讯云 OCR（`tencentcloud-sdk-nodejs-ocr`）。

**Spec:** `docs/superpowers/specs/2026-10-26-user-verification-design.md`

**全局约定:**
- 后端命令在 `backend/` 下执行，前端在 `frontend/` 下执行；包管理器一律 `bun`；PowerShell 用 `;` 串联命令。
- **提交代码仅在用户明确要求时执行**。每个 Task 末尾的 commit 步骤给出建议信息，执行前与用户确认。
- 后端 handler 中 `requireUser` / `parseBody` / `parseQuery` / `ok` / `paginated` / `createApiError` / `getRouterParam` 等 server utils 为 Nitro 自动导入，**不写 import**；repositories 与 schemas 必须显式 import（参照 `server/api/media/register.post.ts`）。
- 新建 server utils/handler 后跑一次 `bun run typecheck` 让 Nitro 重新生成自动导入类型。

---

## Task 1: user_verification 表 + 迁移 + repository

**Files:**
- Modify: `backend/server/database/schema.ts`（在末尾 auth-schema re-export 行之前插入）
- Create: `backend/server/database/repositories/verifications.ts`
- Generate: `backend/drizzle/0002_add_user_verification.sql`（由 drizzle-kit 生成，不手写）

- [ ] **Step 1: schema.ts 插入认证表定义**

用 SearchReplace，锚点为文件末尾（第 393 行）的 re-export 行：

old_str（搜索段）:
```ts
export { account, session, user, verification } from './auth-schema'
```

new_str（替换段）:
```ts
// ===== 实名认证 =====

/** 认证类型：personal=个人（身份证），enterprise=企业（营业执照）。 */
export const VERIFICATION_KINDS = ['personal', 'enterprise'] as const
export type VerificationKind = (typeof VERIFICATION_KINDS)[number]

export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected'] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

export interface PersonalVerificationPayload {
  realName: string
  idCardNumber: string
}

export interface EnterpriseVerificationPayload {
  companyName: string
  creditCode: string
  legalPerson: string
}

export type VerificationPayload = PersonalVerificationPayload | EnterpriseVerificationPayload

export interface ShowcaseMediaItem {
  url: string
  type: 'image' | 'video'
}

/**
 * 用户实名认证申请：个人/企业两种可并存、独立审核。
 * - payload 存敏感证件信息，仅本人与管理端可见，绝不进入公开视图；
 * - ocrResult 存 OCR 预填快照，供管理员比对用户最终提交；
 * - 驳回可重提（新插入一行），通过即锁定（同 kind 已有 approved 禁止再提交，见提交端点）。
 */
export const userVerification = pgTable(
  'user_verification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<VerificationKind>().notNull(),
    status: text('status').$type<VerificationStatus>().notNull().default('pending'),
    payload: jsonb('payload').$type<VerificationPayload>().notNull(),
    /** 证件照（身份证人像面 / 营业执照），单张。 */
    verificationImage: text('verification_image').notNull(),
    /** 个人/公司展示相册（图片或视频，最多 9 个）。 */
    showcaseMedia: jsonb('showcase_media').$type<ShowcaseMediaItem[]>().notNull().default([]),
    /** 个人/公司介绍文字（最多 2000 字）。 */
    introduction: text('introduction').notNull().default(''),
    ocrResult: jsonb('ocr_result').$type<Record<string, unknown> | null>(),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  t => [
    index('user_verification_user_idx').on(t.userId),
    index('user_verification_status_created_idx').on(t.status, t.createdAt)
  ]
)

export type UserVerification = typeof userVerification.$inferSelect

export { account, session, user, verification } from './auth-schema'
```

（`pgTable` / `text` / `jsonb` / `timestamp` / `index` 与 `user` 均已在 schema.ts 顶部 import/可用，无需新增 import。）

- [ ] **Step 2: 生成并执行迁移**

```powershell
cd backend
bun run db:generate -- --name add_user_verification
```

预期输出：生成 `drizzle/0002_add_user_verification.sql`，内容含 `CREATE TABLE "user_verification"` 与两个索引。

```powershell
bun run db:migrate
```

预期输出：迁移应用成功，无报错。

- [ ] **Step 3: 新建 repository**

创建 `backend/server/database/repositories/verifications.ts`：

```ts
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
  return row
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

  const [rows, [{ value: total }]] = await Promise.all([
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
```

- [ ] **Step 4: 验证**

```powershell
cd backend
bun run typecheck
```

预期：0 error。

- [ ] **Step 5: 提交（仅在用户明确要求时执行）**

```powershell
git add backend/server/database/schema.ts backend/server/database/repositories/verifications.ts backend/drizzle/0002_add_user_verification.sql
git commit -m "feat: 新增 user_verification 实名认证表与数据访问层"
```

---

## Task 2: 认证入参校验 schemas

**Files:**
- Create: `backend/server/schemas/verification.ts`
- Create: `backend/server/schemas/verification.test.ts`

- [ ] **Step 1: 新建 schema**

创建 `backend/server/schemas/verification.ts`：

```ts
import { z } from 'zod'
import { pageQuerySchema } from '../utils/pagination'

// ===== 身份证号校验位（GB 11643）=====
const ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CARD_CHECK_CODES = '10X98765432'

/** 18 位身份证号校验位验证（导出供单测）。 */
export function isValidIdCardNumber(id: string): boolean {
  if (!/^\d{17}[\dX]$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 17; i += 1) {
    sum += Number(id[i]) * ID_CARD_WEIGHTS[i]
  }
  return ID_CARD_CHECK_CODES[sum % 11] === id[17]
}

/** 统一社会信用代码：18 位，字符集排除 I/O/S/V/Z。 */
const CREDIT_CODE_PATTERN = /^[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}$/

export const personalPayloadSchema = z.object({
  realName: z.string().trim().min(2, '姓名至少 2 个字符').max(30, '姓名过长'),
  idCardNumber: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isValidIdCardNumber, '身份证号校验失败，请核对后重新输入')
})

export const enterprisePayloadSchema = z.object({
  companyName: z.string().trim().min(4, '公司名称至少 4 个字符').max(60, '公司名称过长'),
  creditCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CREDIT_CODE_PATTERN, '统一社会信用代码格式不正确'),
  legalPerson: z.string().trim().min(2, '法定代表人姓名至少 2 个字符').max(30, '姓名过长')
})

export const showcaseMediaItemSchema = z.object({
  url: z.string().min(1),
  type: z.enum(['image', 'video'])
})

const baseFields = {
  verificationImage: z.string().min(1, '请上传证件照'),
  showcaseMedia: z.array(showcaseMediaItemSchema).max(9, '展示相册最多 9 个媒体').default([]),
  introduction: z.string().trim().max(2000, '介绍最多 2000 字').default(''),
  /** OCR 预填快照（前端回传存档，供管理员比对用户修改；不校验内部结构）。 */
  ocrResult: z.record(z.string(), z.unknown()).optional()
}

/** 提交认证申请：按 kind 判别 payload 结构。 */
export const submitVerificationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('personal'), payload: personalPayloadSchema, ...baseFields }),
  z.object({ kind: z.literal('enterprise'), payload: enterprisePayloadSchema, ...baseFields })
])

export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>

/** OCR 预填请求。 */
export const ocrRequestSchema = z.object({
  kind: z.enum(['personal', 'enterprise']),
  imageUrl: z.string().min(1, '缺少证件照地址')
})

/** 管理端列表查询：分页 + 状态/类型筛选。 */
export const listVerificationsQuerySchema = pageQuerySchema.extend({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  kind: z.enum(['personal', 'enterprise']).optional()
})

/** 审核操作：驳回必须填写原因。 */
export const reviewVerificationSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    rejectReason: z.string().trim().max(500, '驳回原因最多 500 字').optional()
  })
  .superRefine((value, ctx) => {
    if (value.action === 'reject' && !value.rejectReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectReason'],
        message: '驳回时必须填写驳回原因'
      })
    }
  })
```

- [ ] **Step 2: 新建测试**

创建 `backend/server/schemas/verification.test.ts`：

```ts
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
```

注意：`rejectReason: '  '`（纯空白）依赖 `.trim()` 先于 superRefine 执行——zod 的 `.trim()` 是 transform，superRefine 在 transform 之后运行，因此纯空白 trim 成 `''` 后被判为缺失。若该用例失败，把断言改为只校验缺省场景。

- [ ] **Step 3: 运行测试**

```powershell
cd backend
bunx vitest run server/schemas/verification.test.ts
```

预期：全部用例通过（约 15 个）。

- [ ] **Step 4: 提交（仅在用户明确要求时执行）**

```powershell
git add backend/server/schemas/verification.ts backend/server/schemas/verification.test.ts
git commit -m "feat: 新增实名认证入参校验 schema（身份证校验位/信用代码/审核操作）"
```

---

## Task 3: 认证视图序列化器（隐私红线）

**Files:**
- Create: `backend/server/utils/verification.ts`
- Create: `backend/server/utils/verification.test.ts`

- [ ] **Step 1: 新建序列化器与媒体域校验**

创建 `backend/server/utils/verification.ts`：

```ts
import type {
  ShowcaseMediaItem,
  UserVerification,
  VerificationKind,
  VerificationStatus
} from '../database/schema'
import { getMediaFileByUrl } from '../database/repositories/media'
import { parseObjectKey } from './media'

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
 * 取媒体 URL 对应的 COS key：必须已登记在 media_file 且 scope=verification。
 * 证件照/相册只允许引用认证域已登记媒体，防止引用他域文件绕过登记校验。
 */
export async function findVerificationMediaKey(url: string): Promise<string | null> {
  const media = await getMediaFileByUrl(url)
  const key = media?.metadata?.key
  if (!key) return null
  const parsed = parseObjectKey(key)
  if (!parsed || parsed.scope !== 'verification') return null
  return key
}

/** 断言 URL 是认证域已登记媒体，否则抛 VALIDATION_ERROR。 */
export async function assertVerificationMedia(url: string): Promise<void> {
  const key = await findVerificationMediaKey(url)
  if (!key) {
    throw createApiError('VALIDATION_ERROR', { message: '媒体文件未登记或不属于认证域' })
  }
}
```

（`createApiError` 走 server utils 自动导入，无需 import，与 `utils/cos.ts` 一致。）

- [ ] **Step 2: 新建测试（序列化器为纯函数，隐私红线用否定断言覆盖）**

创建 `backend/server/utils/verification.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { UserVerification } from '../database/schema'
import {
  toAdminVerificationView,
  toMyVerificationView,
  toPublicVerificationView
} from './verification'

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
```

- [ ] **Step 3: 运行测试与类型检查**

```powershell
cd backend
bunx vitest run server/utils/verification.test.ts
bun run typecheck
```

预期：测试全绿；typecheck 0 error。

- [ ] **Step 4: 提交（仅在用户明确要求时执行）**

```powershell
git add backend/server/utils/verification.ts backend/server/utils/verification.test.ts
git commit -m "feat: 新增认证视图序列化器与认证域媒体校验"
```

---

## Task 4: 腾讯云 OCR 工具层

**Files:**
- Modify: `backend/server/utils/env.ts`（第 45 行 `TENCENT_COS_STS_TTL` 之后插入 OCR 变量）
- Modify: `backend/server/utils/cos.ts`（末尾追加 `getCosObjectBuffer`）
- Create: `backend/server/utils/ocr.ts`
- Create: `backend/server/utils/ocr.test.ts`
- Modify: `backend/.env.example`
- Modify: `backend/package.json`（bun add 自动更新）

- [ ] **Step 1: 安装 OCR SDK**

```powershell
cd backend
bun add tencentcloud-sdk-nodejs-ocr
```

预期：`package.json` dependencies 新增 `tencentcloud-sdk-nodejs-ocr`。（bun 的进度输出在 stderr，以退出码为准。）

- [ ] **Step 2: env.ts 注册 OCR 环境变量**

用 SearchReplace，锚点为 COS 段结尾（env.ts 第 45-46 行）：

old_str:
```ts
  TENCENT_COS_STS_TTL: z.coerce.number().int().positive().max(7200).default(1800),
  // 缓存：存储介质 memory（进程内，默认）| redis（共享缓存，需 CACHE_REDIS_URL）
```

new_str:
```ts
  TENCENT_COS_STS_TTL: z.coerce.number().int().positive().max(7200).default(1800),
  // 腾讯云 OCR（实名认证证件识别）：复用 COS 永久密钥，region 独立（OCR 无 ap-shanghai 时可换）
  TENCENT_OCR_REGION: z.string().default('ap-guangzhou'),
  // 开发开关：true 时返回固定识别结果，不调用腾讯云
  OCR_MOCK: z.string().default('false').transform(v => v === 'true'),
  // 缓存：存储介质 memory（进程内，默认）| redis（共享缓存，需 CACHE_REDIS_URL）
```

- [ ] **Step 3: cos.ts 追加对象读取**

用 SearchReplace，锚点为 cos.ts 末尾的 `deleteCosObject` 函数结尾：

old_str:
```ts
/** 删除对象；对象已不存在（404）视为成功，保证删除流程可重试。 */
export async function deleteCosObject(key: string): Promise<void> {
  const cfg = getCosConfig()
  try {
    await getCosClient().deleteObject({
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key
    })
  } catch (err) {
    if ((err as COS.CosSdkError).statusCode === 404) return
    throw err
  }
}
```

new_str:
```ts
/** 删除对象；对象已不存在（404）视为成功，保证删除流程可重试。 */
export async function deleteCosObject(key: string): Promise<void> {
  const cfg = getCosConfig()
  try {
    await getCosClient().deleteObject({
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key
    })
  } catch (err) {
    if ((err as COS.CosSdkError).statusCode === 404) return
    throw err
  }
}

/** 拉取对象内容到内存（仅用于证件照等小文件做 OCR）；对象不存在抛 NOT_FOUND。 */
export async function getCosObjectBuffer(key: string): Promise<Buffer> {
  const cfg = getCosConfig()
  try {
    const data = await getCosClient().getObject({
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key
    })
    return data.Body as Buffer
  } catch (err) {
    if ((err as COS.CosSdkError).statusCode === 404) {
      throw createApiError('NOT_FOUND', { message: '文件不存在或已删除' })
    }
    throw err
  }
}
```

- [ ] **Step 4: 新建 OCR 工具**

创建 `backend/server/utils/ocr.ts`：

```ts
import { getCosConfig } from './cos'
import { getEnv } from './env'

/**
 * 腾讯云 OCR 预填：身份证人像面（IDCardOCR）与营业执照（BizLicenseOCR）。
 * 仅用于表单预填，识别结果不落库、不参与判定；任何失败一律返回 null，
 * 由前端回退为手工填写，绝不影响提交主链路。
 */

export interface OcrResult<TFields extends Record<string, unknown>> {
  fields: TFields
  raw: Record<string, unknown>
}

export interface IdCardFields {
  realName: string
  idCardNumber: string
}

export interface BizLicenseFields {
  companyName: string
  creditCode: string
  legalPerson: string
}

const MOCK_ID_CARD: OcrResult<IdCardFields> = {
  fields: { realName: '张三', idCardNumber: '110101199003071276' },
  raw: { mock: true }
}

const MOCK_BIZ_LICENSE: OcrResult<BizLicenseFields> = {
  fields: {
    companyName: '众爱联盟科技有限公司',
    creditCode: '91110108MA01C8YT3Q',
    legalPerson: '张三'
  },
  raw: { mock: true }
}

interface OcrClient {
  IDCardOCR: (req: { ImageBase64: string }) => Promise<Record<string, unknown>>
  BizLicenseOCR: (req: { ImageBase64: string }) => Promise<Record<string, unknown>>
}

let ocrClient: OcrClient | null | undefined

/**
 * 惰性构建 OCR client（复用 COS 永久密钥）；未配置密钥（开发环境常见）时
 * 降级为 null，调用方拿到 null 直接返回"未识别"。
 */
async function getOcrClient(): Promise<OcrClient | null> {
  if (ocrClient !== undefined) return ocrClient
  try {
    const { secretId, secretKey } = getCosConfig()
    const mod = await import('tencentcloud-sdk-nodejs-ocr')
    const { Client } = mod.tencentcloud.ocr.v20181119
    ocrClient = new Client({
      credential: { secretId, secretKey },
      region: getEnv().TENCENT_OCR_REGION,
      profile: { httpProfile: { endpoint: 'ocr.tencentcloudapi.com' } }
    }) as unknown as OcrClient
    return ocrClient
  } catch {
    ocrClient = null
    return null
  }
}

/** 身份证人像面 OCR；mock 模式或未配置/识别失败返回固定结果或 null。 */
export async function recognizeIdCard(image: Buffer): Promise<OcrResult<IdCardFields> | null> {
  if (getEnv().OCR_MOCK) return MOCK_ID_CARD
  const client = await getOcrClient()
  if (!client) return null
  try {
    const raw = await client.IDCardOCR({ ImageBase64: image.toString('base64') })
    const name = typeof raw.Name === 'string' ? raw.Name : ''
    const idNum = typeof raw.IdNum === 'string' ? raw.IdNum : ''
    if (!name || !idNum) return null
    return { fields: { realName: name, idCardNumber: idNum }, raw }
  } catch {
    return null
  }
}

/** 营业执照 OCR；mock 模式或未配置/识别失败返回固定结果或 null。 */
export async function recognizeBizLicense(image: Buffer): Promise<OcrResult<BizLicenseFields> | null> {
  if (getEnv().OCR_MOCK) return MOCK_BIZ_LICENSE
  const client = await getOcrClient()
  if (!client) return null
  try {
    const raw = await client.BizLicenseOCR({ ImageBase64: image.toString('base64') })
    const companyName = typeof raw.Name === 'string' ? raw.Name : ''
    const creditCode = typeof raw.RegNum === 'string' ? raw.RegNum : ''
    const legalPerson = typeof raw.Person === 'string' ? raw.Person : ''
    if (!companyName || !creditCode) return null
    return { fields: { companyName, creditCode, legalPerson }, raw }
  } catch {
    return null
  }
}
```

- [ ] **Step 5: 新建测试（沿用 wechat.test.ts 的 env mock 模式）**

创建 `backend/server/utils/ocr.test.ts`：

```ts
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
```

- [ ] **Step 6: .env.example 追加 OCR 段**

用 SearchReplace，锚点为 `.env.example` 第 55-57 行：

old_str:
```
# 临时凭证有效期（秒）
TENCENT_COS_STS_TTL=1800

# 缓存机制
```

new_str:
```
# 临时凭证有效期（秒）
TENCENT_COS_STS_TTL=1800

# 腾讯云 OCR（实名认证证件识别，复用上方 COS 永久密钥）
# OCR 服务地域（默认可不填，默认 ap-guangzhou）
TENCENT_OCR_REGION=ap-guangzhou
# 开发开关：true 时返回固定识别结果，不调用腾讯云
OCR_MOCK=false

# 缓存机制
```

- [ ] **Step 7: 运行测试与类型检查**

```powershell
cd backend
bunx vitest run server/utils/ocr.test.ts
bun run typecheck
```

预期：3 个用例通过；typecheck 0 error（若报 `tencentcloud-sdk-nodejs-ocr` 类型缺失，确认 Step 1 已在 `backend/` 下执行）。

- [ ] **Step 8: 提交（仅在用户明确要求时执行）**

```powershell
git add backend/package.json backend/bun.lock backend/server/utils/env.ts backend/server/utils/cos.ts backend/server/utils/ocr.ts backend/server/utils/ocr.test.ts backend/.env.example
git commit -m "feat: 接入腾讯云 OCR 工具层（身份证/营业执照识别，支持 OCR_MOCK 降级）"
```

---

## Task 5: 媒体白名单新增 verification scope

**Files:**
- Modify: `backend/server/utils/media.ts`（第 11-12 行）
- Modify: `backend/server/utils/media.test.ts`（parseObjectKey describe 中补用例）
- Modify: `frontend/src/api/media.ts`（第 5-6 行）

- [ ] **Step 1: 后端扩白名单**

`backend/server/utils/media.ts` 用 SearchReplace：

old_str:
```ts
/** 业务路径段白名单：activity=活动相册/封面，avatar=个人头像。 */
export const MEDIA_SCOPES = ['activity', 'avatar'] as const
```

new_str:
```ts
/** 业务路径段白名单：activity=活动相册/封面，avatar=个人头像，verification=实名认证证件与相册。 */
export const MEDIA_SCOPES = ['activity', 'avatar', 'verification'] as const
```

`credentialBodySchema`（schemas/media.ts）与 `parseObjectKey` 的正则均由 `MEDIA_SCOPES` 动态生成，扩白名单后 STS 凭证签发、key 生成/解析全链自动生效，无需其他改动。

- [ ] **Step 2: 后端补测试用例**

`backend/server/utils/media.test.ts` 用 SearchReplace，锚点为 parseObjectKey 的 scope 用例块（第 102-109 行）：

old_str:
```ts
  it('parses keys with a whitelisted scope segment', () => {
    expect(parseObjectKey(`images/activity/${UUID}.jpg`))
      .toEqual({ type: 'image', scope: 'activity', id: UUID, ext: 'jpg' })
    expect(parseObjectKey(`videos/activity/${UUID}.mp4`))
      .toEqual({ type: 'video', scope: 'activity', id: UUID, ext: 'mp4' })
    expect(parseObjectKey(`images/avatar/${UUID}`))
      .toEqual({ type: 'image', scope: 'avatar', id: UUID, ext: null })
  })
```

new_str:
```ts
  it('parses keys with a whitelisted scope segment', () => {
    expect(parseObjectKey(`images/activity/${UUID}.jpg`))
      .toEqual({ type: 'image', scope: 'activity', id: UUID, ext: 'jpg' })
    expect(parseObjectKey(`videos/activity/${UUID}.mp4`))
      .toEqual({ type: 'video', scope: 'activity', id: UUID, ext: 'mp4' })
    expect(parseObjectKey(`images/avatar/${UUID}`))
      .toEqual({ type: 'image', scope: 'avatar', id: UUID, ext: null })
    expect(parseObjectKey(`images/verification/${UUID}.png`))
      .toEqual({ type: 'image', scope: 'verification', id: UUID, ext: 'png' })
    expect(parseObjectKey(`videos/verification/${UUID}.mp4`))
      .toEqual({ type: 'video', scope: 'verification', id: UUID, ext: 'mp4' })
  })
```

- [ ] **Step 3: 前端扩类型**

`frontend/src/api/media.ts` 用 SearchReplace：

old_str:
```ts
/** 业务路径段白名单：activity=活动相册/封面，avatar=个人头像。 */
export type MediaScope = 'activity' | 'avatar'
```

new_str:
```ts
/** 业务路径段白名单：activity=活动相册/封面，avatar=个人头像，verification=实名认证证件与相册。 */
export type MediaScope = 'activity' | 'avatar' | 'verification'
```

- [ ] **Step 4: 验证**

```powershell
cd backend
bunx vitest run server/utils/media.test.ts
```

预期：全部通过（含新增 2 个断言）。

- [ ] **Step 5: 提交（仅在用户明确要求时执行）**

```powershell
git add backend/server/utils/media.ts backend/server/utils/media.test.ts frontend/src/api/media.ts
git commit -m "feat: 媒体白名单新增 verification 业务域"
```

## Task 6: OCR 预填端点 + 限流注册

**Files:**
- Create: `backend/server/api/verification/ocr.post.ts`
- Modify: `backend/server/utils/rate-limit.ts:25`（敏感清单追加一行）
- Test:    `backend/server/utils/rate-limit.test.ts:49,57`（追加断言）

- [ ] **Step 1: 注册限流敏感档**

`rate-limit.ts` 在 `|| (method === 'GET' && /^\/api\/activities\/[^/]+\/check-in-code$/.test(pathname))`（25 行）后追加一行：

```ts
    || (method === 'POST' && pathname === '/api/verification/ocr')
```

注意与上一行同一缩进（4 空格），上一行末尾已有 `)` 无分号，新行接在其后。

- [ ] **Step 2: 限流测试追加断言**

`rate-limit.test.ts` 'keeps sensitive endpoints on the sensitive tier' 用例内（49 行 `check-in-code` 断言后）追加：

```ts
    expect(getRateLimitTier('/api/verification/ocr', 'POST')).toBe('sensitive')
```

'does not misclassify sibling paths' 用例内追加（确保 GET 不误伤）：

```ts
    expect(getRateLimitTier('/api/verification/ocr', 'GET')).toBe('global')
```

- [ ] **Step 3: 实现 OCR 端点**

```ts
// backend/server/api/verification/ocr.post.ts
import { getMediaFileByUrl } from '../../database/repositories/media'
import { ocrRequestSchema } from '../../schemas/verification'

export default defineEventHandler(async (event) => {
  requireUser(event) // 登录即可，无需角色
  const body = await parseBody(event, ocrRequestSchema)

  // URL → media_file → COS key（登记时 metadata.key 已存）
  const media = await getMediaFileByUrl(body.imageUrl)
  const key = media?.metadata?.key
  const parsed = typeof key === 'string' ? parseObjectKey(key) : null
  if (!parsed || parsed.scope !== 'verification') {
    throw createApiError('VALIDATION_ERROR', { message: '证件照未登记或不属于认证域' })
  }

  const buffer = await getCosObjectBuffer(key as string)
  const result = body.kind === 'personal'
    ? await recognizeIdCard(buffer)
    : await recognizeBizLicense(buffer)

  return ok({ fields: result?.fields ?? null })
})
```

（`parseObjectKey` / `getCosObjectBuffer` / `recognizeIdCard` / `recognizeBizLicense` / `requireUser` / `parseBody` / `ok` / `createApiError` 均自动导入；`getCosObjectBuffer` 找不到对象时抛 NOT_FOUND，无需额外处理。）

- [ ] **Step 4: 运行限流测试**

Run: `cd backend; bunx vitest run server/utils/rate-limit.test.ts`
Expected: PASS（sensitive 清单 + sibling 不误伤）

## Task 7: 用户提交/查询认证端点

**Files:**
- Create: `backend/server/api/verification/index.post.ts`
- Create: `backend/server/api/verification/me.get.ts`

- [ ] **Step 1: 提交端点**

```ts
// backend/server/api/verification/index.post.ts
import { createVerification, findLatestVerification } from '../../database/repositories/verifications'
import { submitVerificationSchema } from '../../schemas/verification'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const body = await parseBody(event, submitVerificationSchema)

  const latest = await findLatestVerification(user.id, body.kind)
  if (latest?.status === 'pending') {
    throw createApiError('CONFLICT', { message: '已有待审核的申请，请等待审核结果' })
  }
  if (latest?.status === 'approved') {
    throw createApiError('CONFLICT', { message: '该类型认证已通过，无需重复提交' })
  }

  // 证件照与展示媒体都必须已完成 COS 登记（防未授权对象入库）
  await assertVerificationMedia(body.verificationImage)
  for (const item of body.showcaseMedia) {
    await assertVerificationMedia(item.url)
  }

  const row = await createVerification({
    userId: user.id,
    kind: body.kind,
    payload: body.payload,
    verificationImage: body.verificationImage,
    showcaseMedia: body.showcaseMedia,
    introduction: body.introduction,
    ocrResult: body.ocrResult ?? null,
  })
  return ok(toMyVerificationView(row))
})
```

（`assertVerificationMedia` / `toMyVerificationView` 为 utils 自动导入。）

- [ ] **Step 2: 我的认证状态端点**

```ts
// backend/server/api/verification/me.get.ts
import { findLatestVerification } from '../../database/repositories/verifications'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const [personal, enterprise] = await Promise.all([
    findLatestVerification(user.id, 'personal'),
    findLatestVerification(user.id, 'enterprise'),
  ])
  return ok({
    personal: personal ? toMyVerificationView(personal) : null,
    enterprise: enterprise ? toMyVerificationView(enterprise) : null,
  })
})
```

- [ ] **Step 3: 类型检查（新端点文件纳入编译）**

Run: `cd backend; bun run typecheck`
Expected: 0 error

## Task 8: 公开认证信息端点（user-home 数据源）

**Files:**
- Create: `backend/server/api/users/[id]/verification.get.ts`
- Modify: `backend/server/utils/path.ts`（PUBLIC_GET_PATTERNS 追加）
- Test:    `backend/server/utils/path.test.ts:110`（追加用例）

- [ ] **Step 1: 公开端点**

```ts
// backend/server/api/users/[id]/verification.get.ts
import { findApprovedVerifications } from '../../database/repositories/verifications'
import { getUserById } from '../../database/repositories/users'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createApiError('VALIDATION_ERROR', { message: '缺少用户 id' })
  }
  const target = await getUserById(id)
  if (!target || target.banned) {
    throw createApiError('NOT_FOUND', { message: '用户不存在' })
  }
  const rows = await findApprovedVerifications(id)
  return ok(rows.map(toPublicVerificationView))
})
```

- [ ] **Step 2: path.ts 白名单**

`PUBLIC_GET_PATTERNS` 数组末尾（`/^\/api\/users\/[^/]+\/registrations$/` 行后）追加：

```ts
  /^\/api\/users\/[^/]+\/verification$/,
```

- [ ] **Step 3: path.test.ts 用例**

'allows guest GET on the public user profile' 用例后追加：

```ts
  it('allows guest GET on public verification info but not writes', () => {
    expect(isPublicRequest('/api/users/u1/verification', 'GET')).toBe(true)
    expect(isPublicRequest('/api/users/u1/verification', 'POST')).toBe(false)
  })
```

- [ ] **Step 4: 测试 + typecheck**

Run: `cd backend; bunx vitest run server/utils/path.test.ts; bun run typecheck`
Expected: PASS / 0 error

## Task 9: 通知类型扩展与认证通知构建器

**Files:**
- Modify: `backend/server/database/schema.ts:313-321`（NOTIFICATION_TYPES 扩 2 项，注释更新）
- Modify: `backend/server/utils/notification-content.ts`（Draft 可空 + 2 个 builder）
- Test:    `backend/server/utils/notification-content.test.ts`（追加 describe）

- [ ] **Step 1: schema.ts 通知类型扩展**

`NOTIFICATION_TYPES` 处（313-321 行）注释与数组改为：

```ts
// 通知类型：活动域 4 类 + 认证域 2 类；targetType 目前仅 'activity'，认证域通知 target 为空
export const NOTIFICATION_TYPES = [
  'activity.registration_approved',
  'activity.registration_rejected',
  'activity.reminder',
  'activity.cancelled',
  'verification.approved',
  'verification.rejected',
] as const
```

（text 列无 DB 枚举约束，无需迁移。）

- [ ] **Step 2: NotificationDraft 放开可空 + 认证构建器**

`notification-content.ts` 顶部 import type 行改为：

```ts
import type { ActivityLocation, NotificationTargetType, NotificationType, VerificationKind } from '../database/schema'
```

`NotificationDraft`（13-22 行）改为：

```ts
export interface NotificationDraft {
  userId: string
  type: NotificationType
  title: string
  body: string
  /** 跳转目标；可为空（认证审核等系统消息没有跳转对象） */
  targetType: NotificationTargetType | null
  targetId: string | null
  data?: Record<string, unknown>
}
```

文件末尾追加：

```ts
export const VERIFICATION_KIND_LABELS: Record<VerificationKind, string> = {
  personal: '个人认证',
  enterprise: '企业认证',
}

export function buildVerificationApprovedNotification(input: {
  userId: string
  kind: VerificationKind
}): NotificationDraft {
  const label = VERIFICATION_KIND_LABELS[input.kind]
  return {
    userId: input.userId,
    type: 'verification.approved',
    title: `${label}已通过`,
    body: `你提交的${label}已审核通过，认证信息将在你的个人主页展示。`,
    targetType: null,
    targetId: null,
    data: { kind: input.kind },
  }
}

export function buildVerificationRejectedNotification(input: {
  userId: string
  kind: VerificationKind
  rejectReason: string
}): NotificationDraft {
  const label = VERIFICATION_KIND_LABELS[input.kind]
  return {
    userId: input.userId,
    type: 'verification.rejected',
    title: `${label}未通过`,
    body: `你提交的${label}未通过审核。原因：${input.rejectReason}。修改后可重新提交。`,
    targetType: null,
    targetId: null,
    data: { kind: input.kind, rejectReason: input.rejectReason },
  }
}
```

（`notifyUsers` 透传 draft，service/repository 层无需改动。）

- [ ] **Step 3: 通知测试追加**

`notification-content.test.ts` 末尾追加：

```ts
describe('buildVerificationApprovedNotification', () => {
  it('builds an approved draft with null target', () => {
    expect(buildVerificationApprovedNotification({ userId: 'u1', kind: 'personal' })).toEqual({
      userId: 'u1',
      type: 'verification.approved',
      title: '个人认证已通过',
      body: '你提交的个人认证已审核通过，认证信息将在你的个人主页展示。',
      targetType: null,
      targetId: null,
      data: { kind: 'personal' },
    })
  })
})

describe('buildVerificationRejectedNotification', () => {
  it('includes the reject reason in body and data', () => {
    const draft = buildVerificationRejectedNotification({ userId: 'u1', kind: 'enterprise', rejectReason: '执照模糊' })
    expect(draft.type).toBe('verification.rejected')
    expect(draft.title).toBe('企业认证未通过')
    expect(draft.body).toContain('执照模糊')
    expect(draft.targetType).toBeNull()
    expect(draft.data).toEqual({ kind: 'enterprise', rejectReason: '执照模糊' })
  })
})
```

- [ ] **Step 4: 测试 + typecheck**

Run: `cd backend; bunx vitest run server/utils/notification-content.test.ts; bun run typecheck`
Expected: PASS / 0 error

## Task 10: 管理端审核端点

**Files:**
- Create: `backend/server/api/admin/verifications/index.get.ts`
- Create: `backend/server/api/admin/verifications/[id].get.ts`
- Create: `backend/server/api/admin/verifications/[id]/review.post.ts`

（`/api/admin/**` 由 `20.auth` 中间件统一要求 admin 角色，处理器不重复鉴权；review 中取当前用户用 `requireUser`。）

- [ ] **Step 1: 列表端点**

```ts
// backend/server/api/admin/verifications/index.get.ts
import { listVerifications } from '../../../database/repositories/verifications'
import { listVerificationsQuerySchema } from '../../../schemas/verification'

export default defineEventHandler(async (event) => {
  const query = parseQuery(event, listVerificationsQuerySchema)
  const { items, total } = await listVerifications(query)
  return paginated(
    items.map(item => toAdminVerificationView(item.verification, item.applicant)),
    buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }),
  )
})
```

（`parseQuery` / `paginated` / `buildPaginationMeta` / `toAdminVerificationView` 均自动导入。）

- [ ] **Step 2: 详情端点**

```ts
// backend/server/api/admin/verifications/[id].get.ts
import { getVerificationWithApplicantById } from '../../../database/repositories/verifications'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createApiError('VALIDATION_ERROR', { message: '缺少认证申请 id' })
  }
  const found = await getVerificationWithApplicantById(id)
  if (!found) {
    throw createApiError('NOT_FOUND', { message: '认证申请不存在' })
  }
  return ok(toAdminVerificationView(found.verification, found.applicant))
})
```

- [ ] **Step 3: 审核端点（含站内通知）**

```ts
// backend/server/api/admin/verifications/[id]/review.post.ts
import { getVerificationById, reviewVerification } from '../../../database/repositories/verifications'
import { reviewVerificationSchema } from '../../../schemas/verification'

export default defineEventHandler(async (event) => {
  const admin = requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createApiError('VALIDATION_ERROR', { message: '缺少认证申请 id' })
  }
  const body = await parseBody(event, reviewVerificationSchema)

  const existing = await getVerificationById(id)
  if (!existing) {
    throw createApiError('NOT_FOUND', { message: '认证申请不存在' })
  }

  const reviewed = await reviewVerification({
    id,
    action: body.action,
    reviewerId: admin.id,
    rejectReason: body.rejectReason,
  })
  if (!reviewed) {
    throw createApiError('CONFLICT', { message: '该申请已被处理，请刷新列表' })
  }

  const draft = reviewed.status === 'approved'
    ? buildVerificationApprovedNotification({ userId: reviewed.userId, kind: reviewed.kind })
    : buildVerificationRejectedNotification({
        userId: reviewed.userId,
        kind: reviewed.kind,
        rejectReason: reviewed.rejectReason ?? body.rejectReason ?? '',
      })
  await notifyUsers([draft])

  return ok(toAdminVerificationView(reviewed))
})
```

（`buildVerificationApprovedNotification` / `buildVerificationRejectedNotification` / `notifyUsers` 为 utils 自动导入。）

- [ ] **Step 4: typecheck + 后端全量测试**

Run: `cd backend; bun run typecheck; bun run test`
Expected: 0 error / 全绿

## Task 11: 前端 API 层（verification.ts + notification.ts 类型扩展）

**Files:**
- Create: `frontend/src/api/verification.ts`
- Modify: `frontend/src/api/notification.ts:5-9`（NotificationType 联合追加 2 项）
- Test:    `frontend/src/api/verification.test.ts`

- [ ] **Step 1: API 封装**

```ts
// frontend/src/api/verification.ts
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
  updatedAt: string
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

export function fetchMyVerifications() {
  return http.Get('/verification/me') as unknown as Promise<MyVerifications>
}

export function recognizeVerificationImage(kind: VerificationKind, imageUrl: string) {
  return http.Post('/verification/ocr', { kind, imageUrl }) as unknown as Promise<{
    fields: Record<string, string> | null
  }>
}

export function submitVerification(body: SubmitVerificationBody) {
  return http.Post('/verification', body) as unknown as Promise<MyVerificationView>
}

/** 公开数据（user-home 用）：静默探测，未登录/失败不跳转不 toast */
export function getUserVerifications(userId: string) {
  return http.Get(`/users/${userId}/verification`, {
    meta: { skipAuthRedirect: true, toast: false },
  }) as unknown as Promise<PublicVerificationView[]>
}
```

- [ ] **Step 2: notification.ts 类型联合扩展**

`NotificationType`（5-9 行）追加两项：

```ts
  | 'verification.approved'
  | 'verification.rejected'
```

- [ ] **Step 3: API 测试**

```ts
// frontend/src/api/verification.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}))

vi.mock('@/http/alova', () => ({
  http: { Get: mockGet, Post: mockPost },
}))

import { fetchMyVerifications, getUserVerifications, recognizeVerificationImage, submitVerification } from './verification'

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
```

- [ ] **Step 4: 测试 + type-check**

Run: `cd frontend; bunx vitest run src/api/verification.test.ts; bun run type-check`
Expected: PASS / 0 error

## Task 12: 「我的」认证入口与申请页

**Files:**
- Create: `frontend/src/pages/me/verification/index.vue`（双卡片状态页）
- Create: `frontend/src/pages/me/verification/apply.vue`（上传 → OCR 预填 → 校对提交）
- Modify: `frontend/src/pages/me/me.vue:103,15-18`（菜单项 + 图标注释）

- [ ] **Step 1: 状态总览页**

```vue
<!-- frontend/src/pages/me/verification/index.vue -->
<script setup lang="ts">
// 图标 safelist 占位：i-carbon-identification i-carbon-enterprise
import type { MyVerifications, VerificationKind, VerificationStatus } from '@/api/verification'
import { onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { fetchMyVerifications } from '@/api/verification'

definePage({
  style: { navigationBarTitleText: '实名认证' },
})

const KIND_LABELS: Record<VerificationKind, string> = {
  personal: '个人认证',
  enterprise: '企业认证',
}
const KIND_DESCS: Record<VerificationKind, string> = {
  personal: '提交身份证完成个人实名认证',
  enterprise: '提交营业执照完成企业认证',
}
const KIND_ICONS: Record<VerificationKind, string> = {
  personal: 'i-carbon-identification',
  enterprise: 'i-carbon-enterprise',
}
const STATUS_META: Record<VerificationStatus, { label: string, cls: string }> = {
  pending: { label: '审核中', cls: 'bg-hover text-sub' },
  approved: { label: '已认证', cls: 'bg-primary-soft text-primary-soft-text' },
  rejected: { label: '已驳回', cls: 'bg-danger-soft text-danger' },
}

const data = ref<MyVerifications>({ personal: null, enterprise: null })
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    data.value = await fetchMyVerifications()
  }
  catch {
    // alova 层已 toast
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  void load()
})

function applyFor(kind: VerificationKind) {
  uni.navigateTo({ url: `/pages/me/verification/apply?kind=${kind}` })
}
</script>

<template>
  <view class="px-4 py-4">
    <view
      v-for="kind in (['personal', 'enterprise'] as const)"
      :key="kind"
      class="mb-4 rounded-2 bg-surface p-4"
    >
      <view class="flex items-center justify-between">
        <view class="flex items-center">
          <view :class="KIND_ICONS[kind]" class="mr-2 text-6 text-primary" />
          <view>
            <view class="text-4 text-main font-medium">
              {{ KIND_LABELS[kind] }}
            </view>
            <view class="mt-1 text-3 text-sub">
              {{ KIND_DESCS[kind] }}
            </view>
          </view>
        </view>
        <text
          v-if="data[kind]"
          class="rounded px-2 py-0.5 text-3"
          :class="STATUS_META[data[kind]!.status].cls"
        >
          {{ STATUS_META[data[kind]!.status].label }}
        </text>
      </view>

      <view
        v-if="data[kind]?.status === 'rejected' && data[kind]!.rejectReason"
        class="mt-3 rounded bg-danger-soft px-3 py-2 text-3 text-danger"
      >
        驳回原因：{{ data[kind]!.rejectReason }}
      </view>

      <view class="mt-3">
        <wd-button
          v-if="!data[kind] || data[kind]!.status === 'rejected'"
          size="small"
          @click="applyFor(kind)"
        >
          {{ data[kind]?.status === 'rejected' ? '重新提交' : '去认证' }}
        </wd-button>
        <wd-button v-else-if="data[kind]!.status === 'pending'" size="small" disabled>
          等待审核
        </wd-button>
      </view>
    </view>
  </view>
</template>
```

- [ ] **Step 2: 申请表单页**

```vue
<!-- frontend/src/pages/me/verification/apply.vue -->
<script setup lang="ts">
// 图标 safelist 占位：i-carbon-identification i-carbon-enterprise
import type { MediaItem } from '@/components/media-uploader/types'
import type { ShowcaseMediaItem, SubmitVerificationBody, VerificationKind } from '@/api/verification'
import { onLoad } from '@dcloudio/uni-app'
import { computed, reactive, ref, watch } from 'vue'
import { recognizeVerificationImage, submitVerification } from '@/api/verification'
import { toast } from '@/utils/toast'

definePage({
  style: { navigationBarTitleText: '提交认证' },
})

const kind = ref<VerificationKind>('personal')
onLoad((query) => {
  if (query?.kind === 'enterprise')
    kind.value = 'enterprise'
})

const personalForm = reactive({ realName: '', idCardNumber: '' })
const enterpriseForm = reactive({ companyName: '', creditCode: '', legalPerson: '' })

const idImages = ref<MediaItem[]>([])
const showcaseItems = ref<MediaItem[]>([])
const introduction = ref('')
const ocrResult = ref<Record<string, unknown> | undefined>(undefined)
const ocrLoading = ref(false)
const submitting = ref(false)
const lastOcrUrl = ref('')

// 证件照上传完成后自动 OCR 预填（失败/无结果时用户可手填）
watch(idImages, async (items) => {
  const latest = items[items.length - 1]
  const url = latest?.url
  if (!url || url === lastOcrUrl.value)
    return
  lastOcrUrl.value = url
  ocrLoading.value = true
  try {
    const res = await recognizeVerificationImage(kind.value, url)
    ocrResult.value = res.fields ?? undefined
    if (!res.fields) {
      toast.info('未能识别证件信息，请手动填写')
      return
    }
    if (kind.value === 'personal') {
      personalForm.realName = res.fields.realName ?? personalForm.realName
      personalForm.idCardNumber = res.fields.idCardNumber ?? personalForm.idCardNumber
    }
    else {
      enterpriseForm.companyName = res.fields.companyName ?? enterpriseForm.companyName
      enterpriseForm.creditCode = res.fields.creditCode ?? enterpriseForm.creditCode
      enterpriseForm.legalPerson = res.fields.legalPerson ?? enterpriseForm.legalPerson
    }
    toast.success('已识别证件信息，请核对后提交')
  }
  catch {
    // alova 层已 toast；保留手填路径
  }
  finally {
    ocrLoading.value = false
  }
})

const verificationImage = computed(() => idImages.value[0]?.url ?? '')

function buildShowcaseMedia(): ShowcaseMediaItem[] {
  return showcaseItems.value
    .filter(item => !!item.url)
    .map(item => ({
      url: item.url,
      type: (item.type === 'video' ? 'video' : 'image') as 'image' | 'video',
    }))
}

async function submit() {
  const payload = kind.value === 'personal'
    ? { ...personalForm }
    : { ...enterpriseForm }
  const filled = Object.values(payload).every(v => v.trim().length > 0)
  if (!verificationImage.value) {
    toast.info(kind.value === 'personal' ? '请上传身份证照片' : '请上传营业执照照片')
    return
  }
  if (!filled) {
    toast.info('请完整填写证件信息')
    return
  }

  submitting.value = true
  try {
    const body: SubmitVerificationBody = {
      kind: kind.value,
      payload,
      verificationImage: verificationImage.value,
      showcaseMedia: buildShowcaseMedia(),
      introduction: introduction.value.trim(),
      ocrResult: ocrResult.value,
    }
    await submitVerification(body)
    toast.success('已提交，等待审核')
    uni.navigateBack()
  }
  catch {
    // alova 层已 toast（409 提示由后端 message 透出）
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="px-4 py-4">
    <!-- 第一步：上传证件照 -->
    <view class="mb-4 rounded-2 bg-surface p-4">
      <view class="mb-2 text-4 text-main font-medium">
        {{ kind === 'personal' ? '身份证照片（人像面）' : '营业执照照片' }}
      </view>
      <view class="mb-3 text-3 text-sub">
        上传后自动识别证件信息，识别失败可手动填写
      </view>
      <media-uploader
        v-model="idImages"
        type="image"
        scope="verification"
        :max-count="1"
      />
      <view v-if="ocrLoading" class="mt-2 text-3 text-sub">
        正在识别证件信息…
      </view>
    </view>

    <!-- 第二步：核对证件信息 -->
    <view class="mb-4 rounded-2 bg-surface p-4">
      <view class="mb-2 text-4 text-main font-medium">
        证件信息
      </view>
      <template v-if="kind === 'personal'">
        <wd-input v-model="personalForm.realName" label="真实姓名" placeholder="请输入真实姓名" />
        <wd-input v-model="personalForm.idCardNumber" label="身份证号" placeholder="请输入 18 位身份证号" />
      </template>
      <template v-else>
        <wd-input v-model="enterpriseForm.companyName" label="企业名称" placeholder="请输入企业名称" />
        <wd-input v-model="enterpriseForm.creditCode" label="信用代码" placeholder="请输入统一社会信用代码" />
        <wd-input v-model="enterpriseForm.legalPerson" label="法定代表人" placeholder="请输入法定代表人姓名" />
      </template>
    </view>

    <!-- 第三步：展示相册与介绍（可选） -->
    <view class="mb-4 rounded-2 bg-surface p-4">
      <view class="mb-2 text-4 text-main font-medium">
        {{ kind === 'personal' ? '个人展示（可选）' : '企业展示（可选）' }}
      </view>
      <view class="mb-3 text-3 text-sub">
        认证通过后将在你的主页展示，最多 9 张图片或视频
      </view>
      <media-uploader
        v-model="showcaseItems"
        type="mixed"
        scope="verification"
        multiple
        :max-count="9"
      />
      <view class="mt-3">
        <wd-textarea
          v-model="introduction"
          :maxlength="2000"
          :placeholder="kind === 'personal' ? '介绍一下自己（可选）' : '介绍一下企业（可选）'"
        />
      </view>
    </view>

    <wd-button block :loading="submitting" @click="submit">
      提交认证
    </wd-button>
  </view>
</template>
```

（`MediaItem` 的导入路径以 `frontend/src/components/media-uploader/` 实际导出的类型文件为准——若类型定义在组件内联，则改用 `type MediaItem = { url?: string, type?: string }` 局部声明。执行时先 `LS frontend/src/components/media-uploader` 确认。）

- [ ] **Step 3: me.vue 菜单入口**

`firstGroup`（102-109 行）在 user-home 项后插入：

```ts
    { key: 'verification', label: '实名认证', icon: 'i-carbon-identification', url: '/pages/me/verification/index' },
```

图标注释块（15-18 行）补充 `i-carbon-identification` 到 safelist 注释中。

- [ ] **Step 4: type-check**

Run: `cd frontend; bun run type-check`
Expected: 0 error（图标类为 UnoCSS safelist，不参与类型检查）

## Task 13: user-home 展示认证徽标、相册与介绍

**Files:**
- Modify: `frontend/src/pages/user-home/index.vue`（script 数据加载 + 模板徽标与认证模块）

- [ ] **Step 1: script 增加认证数据加载**

script setup 顶部 import 区追加：

```ts
import type { PublicVerificationView } from '@/api/verification'
import { getUserVerifications } from '@/api/verification'
```

状态区（`points` 等 ref 附近）追加：

```ts
const verifications = ref<PublicVerificationView[]>([])

async function loadVerifications() {
  if (!targetUserId.value)
    return
  try {
    verifications.value = await getUserVerifications(targetUserId.value)
  }
  catch {
    verifications.value = []
  }
}
```

onShow（203-207 行）改为：

```ts
onShow(() => {
  void loadProfile()
  void loadPoints()
  void loadVerifications()
  void reload()
})
```

computed 区（roleBadge 218-225 之后）追加：

```ts
const verifiedBadge = computed(() => {
  if (verifications.value.length === 0)
    return null
  return verifications.value.some(v => v.kind === 'enterprise') ? '企业已认证' : '已认证'
})

const showcaseSections = computed(() =>
  verifications.value.filter(v => v.showcaseMedia.length > 0 || v.introduction),
)

function imageUrlsOf(section: PublicVerificationView) {
  return section.showcaseMedia.filter(m => m.type === 'image').map(m => m.url)
}

function previewImage(urls: string[], current: string) {
  uni.previewImage({ urls, current })
}
```

- [ ] **Step 2: 模板——认证徽标**

roleBadge 的 `<text>` 块（273-279 行）之后插入：

```vue
        <text
          v-if="verifiedBadge"
          class="ml-2 rounded bg-primary-soft px-2 py-0.5 text-3 text-primary-soft-text"
        >
          {{ verifiedBadge }}
        </text>
```

- [ ] **Step 3: 模板——认证相册与介绍模块**

模块二（积分）结尾 `</view>`（337 行）与 `<!-- 模块三：活动参与记录 -->`（339 行）之间插入：

```vue
    <!-- 认证展示：相册与介绍（仅已认证用户有数据） -->
    <view v-for="section in showcaseSections" :key="section.kind" class="mt-4 rounded-2 bg-surface p-4">
      <view class="mb-3 text-4 text-main font-medium">
        {{ section.kind === 'personal' ? '个人展示' : (section.companyName || '企业展示') }}
      </view>
      <view v-if="section.showcaseMedia.length > 0" class="grid grid-cols-3 gap-2">
        <template v-for="media in section.showcaseMedia" :key="media.url">
          <image
            v-if="media.type === 'image'"
            :src="media.url"
            mode="aspectFill"
            class="h-24 w-full rounded"
            @click="previewImage(imageUrlsOf(section), media.url)"
          />
          <video
            v-else
            :src="media.url"
            :show-center-play-btn="true"
            class="h-24 w-full rounded"
            object-fit="cover"
          />
        </template>
      </view>
      <view v-if="section.introduction" class="mt-3 text-3.5 text-main leading-relaxed">
        {{ section.introduction }}
      </view>
    </view>
```

（`previewImage` 的 `current` 传 url 字符串而非索引，避免混合媒体时索引错位；视频用内联 `<video>` 不弹层。）

- [ ] **Step 4: type-check + lint**

Run: `cd frontend; bun run type-check; bun run lint`
Expected: 0 error / 0 problem

## Task 14: PC 管理后台审核页

**Files:**
- Create: `backend/app/pages/admin/verifications/index.vue`
- Create: `backend/app/pages/admin/verifications/[id].vue`
- Modify: `backend/app/layouts/default.vue:15-24`（navItems 追加）

（范式参照 [admin/activities/index.vue](file:///d:/projects/zhongailianmeng/zalm-code/backend/app/pages/admin/activities/index.vue)：useFetch 解包统一响应、UTable `${column.id}-cell` 插槽取 `row.original`、UPagination `v-model:page` + `:total` + `:items-per-page`；UModal 正文用 `<template #body>`。）

- [ ] **Step 1: 审核列表页**

```vue
<!-- backend/app/pages/admin/verifications/index.vue -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ title: '认证审核' })

interface AdminVerificationRow {
  id: string
  kind: 'personal' | 'enterprise'
  status: 'pending' | 'approved' | 'rejected'
  payload: Record<string, string>
  createdAt: string
  applicant: { id: string, name: string, email: string } | null
}

interface Envelope<T> { code: string, data: T, pagination?: { page: number, pageSize: number, total: number } }

const route = useRoute()
const router = useRouter()
const page = ref(Number(route.query.page) || 1)
const status = ref<string>((route.query.status as string) || 'pending')
const kind = ref<string>((route.query.kind as string) || '')

const statusOptions = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
  { label: '全部', value: '' },
]
const kindOptions = [
  { label: '个人认证', value: 'personal' },
  { label: '企业认证', value: 'enterprise' },
  { label: '全部类型', value: '' },
]

const query = computed(() => ({
  page: page.value,
  pageSize: 20,
  ...(status.value ? { status: status.value } : {}),
  ...(kind.value ? { kind: kind.value } : {}),
}))

const { data: res, pending, refresh } = await useFetch<Envelope<AdminVerificationRow[]>>(
  '/api/admin/verifications',
  { query },
)
watch([status, kind], () => {
  page.value = 1
  router.replace({ query: { ...route.query, status: status.value || undefined, kind: kind.value || undefined, page: undefined } })
})

const rows = computed(() => res.value?.data ?? [])
const total = computed(() => res.value?.pagination?.total ?? 0)

const KIND_LABELS: Record<string, string> = { personal: '个人认证', enterprise: '企业认证' }
const STATUS_META: Record<string, { label: string, color: 'warning' | 'success' | 'error' }> = {
  pending: { label: '待审核', color: 'warning' },
  approved: { label: '已通过', color: 'success' },
  rejected: { label: '已驳回', color: 'error' },
}

const columns: TableColumn<AdminVerificationRow>[] = [
  { id: 'applicant', header: '申请人' },
  { id: 'kind', header: '类型' },
  { id: 'summary', header: '证件信息' },
  { id: 'status', header: '状态' },
  { id: 'createdAt', header: '提交时间' },
  { id: 'actions', header: '操作' },
]

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <USelect v-model="status" :items="statusOptions" value-key="value" class="w-32" />
      <USelect v-model="kind" :items="kindOptions" value-key="value" class="w-36" />
    </div>

    <UTable :data="rows" :columns="columns" :loading="pending">
      <template #applicant-cell="{ row }">
        <div>{{ row.original.applicant?.name ?? '—' }}</div>
        <div class="text-xs text-muted">
          {{ row.original.applicant?.email ?? '' }}
        </div>
      </template>
      <template #kind-cell="{ row }">
        {{ KIND_LABELS[row.original.kind] ?? row.original.kind }}
      </template>
      <template #summary-cell="{ row }">
        {{ row.original.payload.realName ?? row.original.payload.companyName ?? '—' }}
      </template>
      <template #status-cell="{ row }">
        <UBadge :color="STATUS_META[row.original.status]?.color ?? 'neutral'" variant="subtle">
          {{ STATUS_META[row.original.status]?.label ?? row.original.status }}
        </UBadge>
      </template>
      <template #createdAt-cell="{ row }">
        {{ formatTime(row.original.createdAt) }}
      </template>
      <template #actions-cell="{ row }">
        <UButton size="xs" variant="soft" @click="navigateTo(`/admin/verifications/${row.original.id}`)">
          审核
        </UButton>
      </template>
    </UTable>

    <div class="flex justify-end">
      <UPagination v-model:page="page" :total="total" :items-per-page="20" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: 审核详情页**

```vue
<!-- backend/app/pages/admin/verifications/[id].vue -->
<script setup lang="ts">
definePageMeta({ title: '认证审核详情' })

interface AdminVerificationDetail {
  id: string
  kind: 'personal' | 'enterprise'
  status: 'pending' | 'approved' | 'rejected'
  payload: Record<string, string>
  verificationImage: string
  showcaseMedia: { url: string, type: 'image' | 'video' }[]
  introduction: string
  ocrResult: Record<string, unknown> | null
  rejectReason: string | null
  createdAt: string
  applicant: { id: string, name: string, email: string } | null
}

interface Envelope<T> { code: string, data: T }

const route = useRoute()
const router = useRouter()
const id = route.params.id as string

const { data: res, refresh } = await useFetch<Envelope<AdminVerificationDetail>>(`/api/admin/verifications/${id}`)
const detail = computed(() => res.value?.data ?? null)

const FIELD_LABELS: Record<string, string> = {
  realName: '真实姓名',
  idCardNumber: '身份证号',
  companyName: '企业名称',
  creditCode: '统一社会信用代码',
  legalPerson: '法定代表人',
}
const compareFields = computed(() => {
  if (!detail.value)
    return [] as { key: string, label: string, user: string, ocr: string, differs: boolean }[]
  const keys = detail.value.kind === 'personal' ? ['realName', 'idCardNumber'] : ['companyName', 'creditCode', 'legalPerson']
  return keys.map((key) => {
    const user = String(detail.value!.payload[key] ?? '')
    const ocr = detail.value!.ocrResult?.[key] == null ? '—' : String(detail.value!.ocrResult[key])
    return { key, label: FIELD_LABELS[key] ?? key, user, ocr, differs: ocr !== '—' && user !== ocr }
  })
})

const toast = useToast()
const reviewing = ref(false)
const rejectOpen = ref(false)
const rejectReason = ref('')

async function review(action: 'approve' | 'reject') {
  reviewing.value = true
  try {
    await $fetch(`/api/admin/verifications/${id}/review`, {
      method: 'POST',
      body: action === 'reject' ? { action, rejectReason: rejectReason.value } : { action },
    })
    toast.add({ title: action === 'approve' ? '已通过' : '已驳回', color: 'success' })
    rejectOpen.value = false
    await refresh()
    router.push('/admin/verifications')
  }
  catch (err: any) {
    toast.add({ title: '操作失败', description: err?.data?.message ?? '', color: 'error' })
  }
  finally {
    reviewing.value = false
  }
}
</script>

<template>
  <div v-if="detail" class="space-y-6">
    <UCard>
      <template #header>
        申请人：{{ detail.applicant?.name ?? '—' }}（{{ detail.applicant?.email ?? '' }}）
      </template>
      <div class="grid grid-cols-2 gap-6">
        <div>
          <h3 class="mb-2 text-sm font-medium">
            证件照
          </h3>
          <img :src="detail.verificationImage" class="max-h-64 rounded border" alt="证件照">
        </div>
        <div>
          <h3 class="mb-2 text-sm font-medium">
            用户填写 vs OCR 识别
          </h3>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="py-1">字段</th><th>用户填写</th><th>OCR 识别</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in compareFields" :key="f.key" :class="{ 'text-error': f.differs }">
                <td class="py-1">{{ f.label }}</td>
                <td>{{ f.user }}</td>
                <td>{{ f.ocr }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!detail.ocrResult" class="mt-2 text-xs text-muted">
            无 OCR 识别记录（用户手动填写）
          </p>
        </div>
      </div>
    </UCard>

    <UCard v-if="detail.showcaseMedia.length > 0 || detail.introduction">
      <template #header>
        展示资料
      </template>
      <div v-if="detail.showcaseMedia.length > 0" class="mb-3 grid grid-cols-4 gap-3">
        <template v-for="m in detail.showcaseMedia" :key="m.url">
          <img v-if="m.type === 'image'" :src="m.url" class="h-28 w-full rounded object-cover" alt="展示图">
          <video v-else :src="m.url" controls class="h-28 w-full rounded object-cover" />
        </template>
      </div>
      <p v-if="detail.introduction" class="whitespace-pre-wrap text-sm">
        {{ detail.introduction }}
      </p>
    </UCard>

    <div v-if="detail.status === 'pending'" class="flex gap-3">
      <UButton color="success" :loading="reviewing" @click="review('approve')">
        通过
      </UButton>
      <UButton color="error" variant="soft" @click="rejectOpen = true">
        驳回
      </UButton>
    </div>
    <UAlert v-else :title="detail.status === 'approved' ? '已通过' : `已驳回：${detail.rejectReason ?? ''}`" />

    <UModal v-model:open="rejectOpen" title="驳回原因">
      <template #body>
        <UTextarea v-model="rejectReason" :rows="4" placeholder="请填写驳回原因（将通知申请人）" />
      </template>
      <template #footer>
        <UButton variant="ghost" @click="rejectOpen = false">
          取消
        </UButton>
        <UButton color="error" :loading="reviewing" :disabled="!rejectReason.trim()" @click="review('reject')">
          确认驳回
        </UButton>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 3: 侧边栏导航**

`default.vue` navItems（15-24 行）在「活动模板」项后插入：

```ts
  { label: '认证审核', to: '/admin/verifications', icon: 'i-lucide-badge-check' as unknown as Component, adminOnly: true },
```

- [ ] **Step 4: backend typecheck + lint**

Run: `cd backend; bun run typecheck; bun run lint`
Expected: 0 error / 0 problem

## Task 15: 全量质量门禁 + 手工验证

**Files:**
- Modify: `backend/.env`（本地开发追加 `OCR_MOCK=true`，不入库）

- [ ] **Step 1: backend 门禁**

Run: `cd backend; bun run typecheck; bun run lint; bun run test`
Expected: typecheck 0 error / lint 0 problem / vitest 全绿

- [ ] **Step 2: frontend 门禁**

Run: `cd frontend; bun run type-check; bun run lint; bun run test:run`
Expected: 全部 0 error / 全绿

- [ ] **Step 3: 手工 E2E 验证（OCR_MOCK=true 启动后端）**

1. 前端登录普通用户 → 「我的」→「实名认证」→ 个人认证「去认证」
2. 上传任意图片作为证件照 → 自动预填 `张三 / 110101199003071276`（mock 结果）→ 修改姓名 → 上传 2 张展示图 + 填写介绍 → 提交 → toast「已提交，等待审核」
3. 状态页显示「审核中」；再次点击无「去认证」按钮（pending 锁定）
4. admin 登录 PC 后台 → 认证审核列表（默认 pending 筛选）→ 进入详情 → 用户填写 vs OCR 比对表可见差异行高亮 → 点「通过」
5. 普通用户站内通知收到「个人认证已通过」；user-home 显示「已认证」徽标 + 相册 + 介绍
6. 企业认证走一遍「驳回」流程（填执照图 → 预填 mock 企业信息 → 提交 → admin 驳回填原因）→ 用户收到驳回通知、状态页显示驳回原因、可点「重新提交」
7. 游客（未登录）访问该用户 user-home → 可见徽标与认证相册/介绍（公开端点 200）
8. 重复提交已通过的类型 → 409「该类型认证已通过」

## 执行交接

- 任务顺序：Task 1 → 2 → 3 → 4 → 5 可并行度低（schema → repository → schemas → utils → media 白名单有依赖）；Task 6-10 依赖 1-5；Task 11 依赖后端 API 契约（可与 6-10 并行）；Task 12/13 依赖 11；Task 14 依赖 10；Task 15 最后。
- 每个 Task 完成后运行其 Step 内标注的验证命令，全绿再进下一个。
- 提交代码**仅在用户明确要求时执行**；提交信息遵循 `.trae/rules/git-commit-message.md`（动词开头、≤100 字符、多变更用无序列表）。
- 迁移生成必须带语义名：`bun run db:generate -- --name add_user_verification`（`.trae/rules/database-migration.md`）。
- Spec 覆盖核对：spec §4.1 表结构 → Task 1；§4.2 校验 → Task 2；§4.3 序列化/隐私 → Task 3；§4.4 OCR → Task 4/6；§4.5 媒体链路 → Task 5/6/7；§5 API（POST/GET me/GET users/:id/OCR/管理三端点）→ Task 6/7/8/10；§5.4 限流 → Task 6；§6 通知 → Task 9/10；§7 前端（状态页/申请页/菜单/user-home）→ Task 11/12/13；§8 管理端页面 → Task 14；§9 门禁与验收 → Task 15。
