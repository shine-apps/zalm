# 用户积分管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地双口径积分体系——签到自动发活动积分、管理员后台手工录入活动/捐献积分与冲正、登录用户可见排行榜/全站动态/个人明细。

**Architecture:** Drizzle 新增 `points_ledger`（流水，唯一事实源）+ `user_points`（汇总，读优化），同事务维护；两个部分唯一索引保证「一场签到最多一条积分流水」「一条流水最多冲正一次」。签到链路事务化，仅在状态首次变为 checked_in 时发分。读侧分登录用户端点 `/api/points/**` 与管理员端点 `/api/admin/points/**`（仅 admin）。前端新增排行榜页与明细页，PC 后台新增积分管理页。

**Tech Stack:** Nuxt 4 / Nitro / Drizzle ORM / PostgreSQL / Zod / Vitest（后端）；unibest(uniapp Vue3) / alova / wot-ui v2 / UnoCSS（前端）；Nuxt UI v4（后台）。包管理一律 `bun`。

**约定：**
- 所有命令在对应子工程目录执行；PowerShell 用 `;` 分隔。
- **本计划不含 git commit 步骤**（仓库规则：仅用户明确要求时提交）。每个 Task 结束的验证即检查点。
- 设计文档：`docs/superpowers/specs/2026-10-14-points-system-design.md`。
- 自动导入：`server/api/**` 处理器内 `defineEventHandler/ok/paginated/parseQuery/parseBody/parseParams/createApiError/requireUser/requireAdmin/setResponseStatus` 均为 Nuxt 自动导入；普通 `utils/`、`repositories/`、`schemas/` 文件一律显式 import。

---

## File Structure

**backend 新增**
- `server/database/repositories/points.ts` — 流水/汇总全部数据访问（写函数支持事务句柄）
- `server/schemas/points.ts` — 积分相关 Zod 入参
- `server/utils/points-views.ts` — 纯函数：动态流隐私序列化、冲正备注、可冲正断言（无 db 依赖，可单测）
- `server/utils/points-service.ts` — 积分业务逻辑（发分/录入/冲正/读侧视图）
- `server/api/points/leaderboard.get.ts`、`feed.get.ts`、`me.get.ts`、`me/ledger.get.ts`
- `server/api/admin/points/index.post.ts`、`ledger.get.ts`、`activities.get.ts`、`[id]/reverse.post.ts`
- `server/schemas/points.test.ts`、`server/utils/points-views.test.ts`
- `app/pages/admin/points.vue`

**backend 修改**
- `server/database/schema.ts` — `activity.points`、`pointsLedger`、`userPoints`
- `server/schemas/activity.ts` — create/update 增加 `points`
- `server/database/repositories/activities.ts` — NewActivityInput/insert 透传 points；新增条件更新签到函数
- `server/utils/activity-service.ts` — 发布/编辑/视图透传 points；签到事务化 + 发分
- `server/utils/rate-limit.ts` — 管理员积分写端点纳入 sensitive 档
- `app/layouts/default.vue` — 侧边栏「积分管理」菜单
- `app/pages/admin/activities/[id].vue` — 展示参与积分

**frontend 新增**
- `src/api/points.ts`
- `src/pages/points/index.vue`（排行榜 + 全站动态）
- `src/pages/points/ledger.vue`（我的明细）

**frontend 修改**
- `src/api/activity.ts` — `ActivityView.points`、`ActivityPayload.points`
- `src/pages/activity/edit.vue`、`src/pages/activity/detail.vue`
- `src/pages/me/me.vue`

---

## Task 1: 数据模型与迁移

**Files:**
- Modify: `backend/server/database/schema.ts`

- [ ] **Step 1: 修改 drizzle-orm 导入**

`schema.ts` 顶部两处 import 改为：

```ts
import { desc, sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  type AnyPgColumn
} from 'drizzle-orm/pg-core'
```

- [ ] **Step 2: activity 表增加 points 列**

在 `activity` 表定义中 `capacity` 列之后插入：

```ts
  capacity: integer('capacity'),
  // 签到成功可得的参与积分，0 表示该活动不计分（值域 0..9999，Zod 入口保证）
  points: integer('points').notNull().default(0),
  status: text('status').notNull().default('published'),
```

- [ ] **Step 3: 在「分享埋点」区块之前追加积分表定义**

在 `schema.ts` 中 `// ===== 分享埋点 =====` 注释之前插入：

```ts
// ===== 积分 =====

export const POINTS_CATEGORIES = ['activity', 'donation'] as const
export type PointsCategory = (typeof POINTS_CATEGORIES)[number]

export const POINTS_SOURCES = ['checkin', 'manual_activity', 'manual_donation', 'reversal'] as const
export type PointsSource = (typeof POINTS_SOURCES)[number]

export const DONATION_KINDS = ['money', 'goods'] as const
export type DonationKind = (typeof DONATION_KINDS)[number]

/**
 * 积分流水（唯一事实源）：一行一次变动，points 带符号（得分正、冲正负）。
 * - (registration_id) 部分唯一索引：一场签到最多一条活动积分流水（并发/重复签到兜底）
 * - (reversal_of) 部分唯一索引：一条流水最多被冲正一次
 */
export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    points: integer('points').notNull(),
    category: text('category').notNull(),
    source: text('source').notNull(),
    activityId: text('activity_id').references(() => activity.id, { onDelete: 'restrict' }),
    registrationId: text('registration_id').references(() => activityRegistration.id, {
      onDelete: 'restrict'
    }),
    donationKind: text('donation_kind'),
    // 金额/物资名称等仅后台与本人可见；全站动态流在序列化层强制剔除
    note: text('note').notNull().default(''),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'restrict' }),
    reversalOf: text('reversal_of').references((): AnyPgColumn => pointsLedger.id, {
      onDelete: 'restrict'
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    uniqueIndex('points_ledger_registration_uidx')
      .on(t.registrationId)
      .where(sql`${t.registrationId} IS NOT NULL`),
    uniqueIndex('points_ledger_reversal_uidx')
      .on(t.reversalOf)
      .where(sql`${t.reversalOf} IS NOT NULL`),
    index('points_ledger_user_idx').on(t.userId, t.category, desc(t.createdAt)),
    index('points_ledger_category_idx').on(t.category, desc(t.createdAt))
  ]
)

/** 用户积分汇总（读优化）；只允许由流水在同事务内 upsert 增量，无其他修改入口。 */
export const userPoints = pgTable('user_points', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  activityPoints: integer('activity_points').notNull().default(0),
  donationPoints: integer('donation_points').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
})
```

- [ ] **Step 4: 生成迁移并人工检查**

Run: `cd backend; bun run db:generate`

打开新生成的 `backend/drizzle/000X_*.sql`，确认包含：
1. `ALTER TABLE "activity" ADD COLUMN "points" integer DEFAULT 0 NOT NULL`；
2. `CREATE TABLE "points_ledger"` 与 `"user_points"`；
3. 两条 `CREATE UNIQUE INDEX ... WHERE ... IS NOT NULL`；
4. 两条普通 `CREATE INDEX`。

- [ ] **Step 5: 执行迁移**

Run: `cd backend; bun run db:migrate`
Expected: 迁移成功无报错；psql/客户端可见三张变更（activity 新列、两张新表）。

---

## Task 2: 活动积分字段贯通（schema/repo/service）TDD

**Files:**
- Test: `backend/server/schemas/activity.test.ts`
- Modify: `backend/server/schemas/activity.ts`
- Modify: `backend/server/database/repositories/activities.ts`
- Modify: `backend/server/utils/activity-service.ts`

- [ ] **Step 1: 先写失败测试**

在 `backend/server/schemas/activity.test.ts` 末尾追加：

```ts
describe('activity points', () => {
  it('defaults points to 0 when omitted', () => {
    const parsed = activityCreateBodySchema.parse({ ...baseBody })
    expect(parsed.points).toBe(0)
  })

  it('accepts points in 0..9999 and rejects out of range / non-integer', () => {
    expect(activityCreateBodySchema.parse({ ...baseBody, points: 10 }).points).toBe(10)
    expect(activityCreateBodySchema.parse({ ...baseBody, points: 9999 }).points).toBe(9999)
    expect(activityCreateBodySchema.safeParse({ ...baseBody, points: -1 }).success).toBe(false)
    expect(activityCreateBodySchema.safeParse({ ...baseBody, points: 10000 }).success).toBe(false)
    expect(activityCreateBodySchema.safeParse({ ...baseBody, points: 1.5 }).success).toBe(false)
  })

  it('update schema accepts optional points', () => {
    expect(activityUpdateBodySchema.parse({ points: 5 })).toEqual({ points: 5 })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend; bun run test -- server/schemas/activity.test.ts`
Expected: FAIL（`parsed.points` 为 undefined）。

- [ ] **Step 3: Zod schema 增加 points**

`server/schemas/activity.ts`：`activityCreateBodySchema` 中 `capacity` 之后加：

```ts
    capacity: z.number().int().min(1).max(99999).nullable().optional(),
    points: z.number().int().min(0).max(9999).default(0)
```

`activityUpdateBodySchema` 中 `capacity` 之后加：

```ts
    capacity: z.number().int().min(1).max(99999).nullable().optional(),
    points: z.number().int().min(0).max(9999).optional()
```

- [ ] **Step 4: repo 透传 points**

`server/database/repositories/activities.ts`：
`NewActivityInput` 接口在 `capacity` 后加 `points: number`；
`insertActivity` 的 `.values({...})` 中 `capacity: input.capacity,` 之后加 `points: input.points,`。

- [ ] **Step 5: service 透传 points 并在视图返回**

`server/utils/activity-service.ts`：

1. `publishActivity` 返回对象中 `capacity: input.capacity ?? null,` 之后加 `points: input.points,`。
2. `editActivity` 的 `patchActivity` 入参对象中加一行：
   ```ts
    ...(patch.points !== undefined && { points: patch.points }),
   ```
   （放在 capacity 展开之后）
3. `toActivityView` 返回对象中 `capacity: activity.capacity,` 之后加 `points: activity.points,`。

- [ ] **Step 6: 跑测试与 typecheck**

Run: `cd backend; bun run test -- server/schemas/activity.test.ts`
Expected: PASS。

Run: `cd backend; bun run typecheck`
Expected: 0 error。

---

## Task 3: 积分 Zod 入参 schema（TDD）

**Files:**
- Create: `backend/server/schemas/points.ts`
- Test: `backend/server/schemas/points.test.ts`

- [ ] **Step 1: 先写失败测试**

创建 `backend/server/schemas/points.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  adminLedgerQuerySchema,
  leaderboardQuerySchema,
  manualPointsBodySchema,
  reversalBodySchema
} from './points'

const goodUser = {
  userId: 'u-1234567890abcdef',
  points: 20,
  note: '2026 秋季助学捐款',
  activityId: '8b1f2c50-1111-4aaa-bbbb-222222222222'
}

describe('manualPointsBodySchema', () => {
  it('accepts activity award with activityId', () => {
    const parsed = manualPointsBodySchema.parse({ ...goodUser, category: 'activity' })
    expect(parsed.category).toBe('activity')
    expect(parsed.activityId).toBe(goodUser.activityId)
    expect(parsed.donationKind).toBeUndefined()
    expect(parsed.note).toBe(goodUser.note)
  })

  it('accepts donation award with donationKind and defaults note', () => {
    const parsed = manualPointsBodySchema.parse({
      category: 'donation',
      userId: goodUser.userId,
      points: 100,
      donationKind: 'money'
    })
    expect(parsed.donationKind).toBe('money')
    expect(parsed.note).toBe('')
  })

  it('rejects activity without activityId, donation without donationKind', () => {
    expect(
      manualPointsBodySchema.safeParse({ category: 'activity', userId: goodUser.userId, points: 1 })
        .success
    ).toBe(false)
    expect(
      manualPointsBodySchema.safeParse({ category: 'donation', userId: goodUser.userId, points: 1 })
        .success
    ).toBe(false)
  })

  it('rejects crossed fields and out-of-range points', () => {
    expect(
      manualPointsBodySchema.safeParse({
        category: 'activity',
        userId: goodUser.userId,
        points: 1,
        activityId: goodUser.activityId,
        donationKind: 'goods'
      }).success
    ).toBe(false)
    expect(
      manualPointsBodySchema.safeParse({ ...goodUser, category: 'activity', points: 0 }).success
    ).toBe(false)
    expect(
      manualPointsBodySchema.safeParse({ ...goodUser, category: 'activity', points: 10000 }).success
    ).toBe(false)
  })

  it('parses createdAt ISO string to Date', () => {
    const parsed = manualPointsBodySchema.parse({
      category: 'donation',
      userId: goodUser.userId,
      points: 5,
      donationKind: 'goods',
      createdAt: '2026-09-01T10:00:00+08:00'
    })
    expect(parsed.createdAt).toBeInstanceOf(Date)
  })
})

describe('other points schemas', () => {
  it('leaderboard dimension defaults to total', () => {
    expect(leaderboardQuerySchema.parse({}).dimension).toBe('total')
    expect(leaderboardQuerySchema.parse({ dimension: 'activity' }).dimension).toBe('activity')
    expect(leaderboardQuerySchema.safeParse({ dimension: 'xxx' }).success).toBe(false)
  })

  it('reversal reason required 1..200', () => {
    expect(reversalBodySchema.safeParse({ reason: '' }).success).toBe(false)
    expect(reversalBodySchema.parse({ reason: '录错用户' }).reason).toBe('录错用户')
  })

  it('admin ledger query accepts filters', () => {
    const q = adminLedgerQuerySchema.parse({ category: 'donation', source: 'manual_donation', keyword: ' 张 ' })
    expect(q).toMatchObject({ category: 'donation', source: 'manual_donation', keyword: '张' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend; bun run test -- server/schemas/points.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 schema**

创建 `backend/server/schemas/points.ts`：

```ts
import { z } from 'zod'
import { DONATION_KINDS, POINTS_CATEGORIES, POINTS_SOURCES } from '../database/schema'
import { pageQuerySchema } from '../utils/pagination'

/** ISO 字符串 → Date（非法值在 transform 阶段发 issue）。 */
const isoDate = z.string().trim().min(1).transform((value, ctx) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '时间格式不正确' })
    return z.NEVER
  }
  return d
})

/** 手工录入积分：必须为正整数 1..9999（0 分录入无意义，活动签到 0 分不写流水）。 */
export const manualPointsBodySchema = z
  .object({
    category: z.enum(POINTS_CATEGORIES),
    // Better Auth 用户 id 非 uuid 格式，按现有 manualCheckInBodySchema 口径放宽为 1..64
    userId: z.string().min(1).max(64),
    points: z.number().int().min(1).max(9999),
    activityId: z.string().uuid().optional(),
    donationKind: z.enum(DONATION_KINDS).optional(),
    note: z.string().trim().max(200).default(''),
    createdAt: isoDate.optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.category === 'activity') {
      if (!data.activityId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activityId'], message: '活动积分必须选择活动' })
      }
      if (data.donationKind !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['donationKind'], message: '活动积分不能携带捐献类型' })
      }
    }
    else {
      if (!data.donationKind) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['donationKind'], message: '捐献积分必须选择捐献类型' })
      }
      if (data.activityId !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activityId'], message: '捐献积分不能携带活动' })
      }
    }
  })

export type ManualPointsBody = z.infer<typeof manualPointsBodySchema>

export const reversalBodySchema = z
  .object({
    reason: z.string().trim().min(1, '请填写冲正原因').max(200, '冲正原因不能超过 200 字')
  })
  .strict()

export const ledgerIdParamsSchema = z.object({
  id: z.string().uuid()
})

export const leaderboardQuerySchema = pageQuerySchema.extend({
  dimension: z.enum(['total', 'activity', 'donation']).default('total')
})

export const feedQuerySchema = pageQuerySchema.extend({
  category: z.enum(POINTS_CATEGORIES).optional()
})

export const myLedgerQuerySchema = pageQuerySchema.extend({
  category: z.enum(POINTS_CATEGORIES).optional()
})

export const adminLedgerQuerySchema = pageQuerySchema.extend({
  category: z.enum(POINTS_CATEGORIES).optional(),
  source: z.enum(POINTS_SOURCES).optional(),
  keyword: z.string().trim().min(1).max(50).optional()
})

export const activityPickerQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(50).optional()
})
```

- [ ] **Step 4: 跑测试**

Run: `cd backend; bun run test -- server/schemas/points.test.ts`
Expected: PASS（含 6 个用例全绿）。

---

## Task 4: 积分数据访问层 repository

**Files:**
- Create: `backend/server/database/repositories/points.ts`

- [ ] **Step 1: 创建 repository 完整文件**

```ts
import { alias, and, asc, count, desc, eq, gt, ilike, ne, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../client'
import {
  activity as activityTable,
  pointsLedger as ledgerTable,
  user as userTable,
  userPoints as pointsTable,
  type DonationKind,
  type PointsCategory,
  type PointsSource
} from '../schema'
import type { DbExecutor } from './activities'

export type PointsLedgerRow = typeof ledgerTable.$inferSelect
export type PointsDimension = 'total' | 'activity' | 'donation'

export interface NewLedgerInput {
  userId: string
  points: number
  category: PointsCategory
  source: PointsSource
  activityId?: string | null
  registrationId?: string | null
  donationKind?: DonationKind | null
  note?: string
  createdBy?: string | null
  reversalOf?: string | null
  createdAt?: Date
}

interface PageParams {
  limit: number
  offset: number
}

// ===== 汇总 =====

export async function getUserPoints(
  userId: string,
  exec: DbExecutor = db
): Promise<{ activityPoints: number, donationPoints: number } | null> {
  const rows = await exec.select().from(pointsTable).where(eq(pointsTable.userId, userId)).limit(1)
  return rows[0] ?? null
}

/** 同事务内增量 upsert；delta 可正可负。 */
export async function upsertPointsDelta(
  userId: string,
  category: PointsCategory,
  delta: number,
  exec: DbExecutor = db
): Promise<void> {
  const setClause = category === 'activity'
    ? { activityPoints: sql`${pointsTable.activityPoints} + ${delta}`, updatedAt: new Date() }
    : { donationPoints: sql`${pointsTable.donationPoints} + ${delta}`, updatedAt: new Date() }
  await exec
    .insert(pointsTable)
    .values({
      userId,
      activityPoints: category === 'activity' ? delta : 0,
      donationPoints: category === 'donation' ? delta : 0
    })
    .onConflictDoUpdate({ target: pointsTable.userId, set: setClause })
}

// ===== 流水写入 =====

/**
 * 插入流水。ignoreRegistrationConflict=true 时 ON CONFLICT DO NOTHING，
 * 用于签到发分（部分唯一索引 registration_id 兜底重复签到/补签）；
 * 冲突时返回 null，调用方据此跳过汇总增量。
 */
export async function insertLedger(
  input: NewLedgerInput,
  exec: DbExecutor = db,
  opts: { ignoreRegistrationConflict?: boolean } = {}
): Promise<PointsLedgerRow | null> {
  let query = exec
    .insert(ledgerTable)
    .values({
      userId: input.userId,
      points: input.points,
      category: input.category,
      source: input.source,
      activityId: input.activityId ?? null,
      registrationId: input.registrationId ?? null,
      donationKind: input.donationKind ?? null,
      note: input.note ?? '',
      createdBy: input.createdBy ?? null,
      reversalOf: input.reversalOf ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {})
    })
    .returning()
  if (opts.ignoreRegistrationConflict) {
    query = query.onConflictDoNothing()
  }
  const rows = await query
  return rows[0] ?? null
}

export async function getLedgerById(id: string): Promise<PointsLedgerRow | null> {
  const rows = await db.select().from(ledgerTable).where(eq(ledgerTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getReversalOf(originalId: string): Promise<PointsLedgerRow | null> {
  const rows = await db
    .select()
    .from(ledgerTable)
    .where(eq(ledgerTable.reversalOf, originalId))
    .limit(1)
  return rows[0] ?? null
}

// ===== 排行榜 =====

export interface LeaderboardRow {
  userId: string
  name: string
  image: string | null
  activityPoints: number
  donationPoints: number
  total: number
}

export async function listLeaderboard(
  dimension: PointsDimension,
  { limit, offset }: PageParams
): Promise<{ rows: LeaderboardRow[], total: number }> {
  const totalExpr = sql`${pointsTable.activityPoints} + ${pointsTable.donationPoints}`.mapWith(Number)
  const orderExpr = dimension === 'activity'
    ? pointsTable.activityPoints
    : dimension === 'donation'
      ? pointsTable.donationPoints
      : totalExpr
  const positiveWhere: SQL = dimension === 'activity'
    ? gt(pointsTable.activityPoints, 0)
    : dimension === 'donation'
      ? gt(pointsTable.donationPoints, 0)
      : gt(totalExpr, 0)

  const rows = await db
    .select({
      userId: userTable.id,
      name: userTable.name,
      image: userTable.image,
      activityPoints: pointsTable.activityPoints,
      donationPoints: pointsTable.donationPoints,
      total: totalExpr.as('total')
    })
    .from(pointsTable)
    .innerJoin(userTable, eq(pointsTable.userId, userTable.id))
    .where(and(eq(userTable.banned, false), positiveWhere))
    .orderBy(desc(orderExpr), asc(userTable.name))
    .limit(limit)
    .offset(offset)

  const totalRows = await db
    .select({ value: count() })
    .from(pointsTable)
    .innerJoin(userTable, eq(pointsTable.userId, userTable.id))
    .where(and(eq(userTable.banned, false), positiveWhere))

  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

// ===== 动态 / 明细（join 行） =====

export interface LedgerJoinRow extends PointsLedgerRow {
  userName: string
  userImage: string | null
  activityTitle: string | null
}

export interface AdminLedgerJoinRow extends LedgerJoinRow {
  userPhone: string | null
  operatorName: string | null
}

function feedFilters(category?: PointsCategory): (SQL | undefined)[] {
  return [
    category ? eq(ledgerTable.category, category) : undefined,
    ne(ledgerTable.source, 'reversal'),
    gt(ledgerTable.points, 0)
  ]
}

export async function listFeed(
  category: PointsCategory | undefined,
  { limit, offset }: PageParams
): Promise<{ rows: LedgerJoinRow[], total: number }> {
  const where = and(...feedFilters(category))
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: ledgerTable.id,
        userId: ledgerTable.userId,
        points: ledgerTable.points,
        category: ledgerTable.category,
        source: ledgerTable.source,
        activityId: ledgerTable.activityId,
        registrationId: ledgerTable.registrationId,
        donationKind: ledgerTable.donationKind,
        note: ledgerTable.note,
        createdBy: ledgerTable.createdBy,
        reversalOf: ledgerTable.reversalOf,
        createdAt: ledgerTable.createdAt,
        userName: userTable.name,
        userImage: userTable.image,
        activityTitle: activityTable.title
      })
      .from(ledgerTable)
      .innerJoin(userTable, eq(ledgerTable.userId, userTable.id))
      .leftJoin(activityTable, eq(ledgerTable.activityId, activityTable.id))
      .where(where)
      .orderBy(desc(ledgerTable.createdAt), desc(ledgerTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(ledgerTable).where(where)
  ])
  return { rows: rows as unknown as LedgerJoinRow[], total: Number(totalRows[0]?.value ?? 0) }
}

export async function listMyLedger(
  userId: string,
  category: PointsCategory | undefined,
  { limit, offset }: PageParams
): Promise<{ rows: LedgerJoinRow[], total: number }> {
  const where = and(eq(ledgerTable.userId, userId), category ? eq(ledgerTable.category, category) : undefined)
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: ledgerTable.id,
        userId: ledgerTable.userId,
        points: ledgerTable.points,
        category: ledgerTable.category,
        source: ledgerTable.source,
        activityId: ledgerTable.activityId,
        registrationId: ledgerTable.registrationId,
        donationKind: ledgerTable.donationKind,
        note: ledgerTable.note,
        createdBy: ledgerTable.createdBy,
        reversalOf: ledgerTable.reversalOf,
        createdAt: ledgerTable.createdAt,
        userName: userTable.name,
        userImage: userTable.image,
        activityTitle: activityTable.title
      })
      .from(ledgerTable)
      .innerJoin(userTable, eq(ledgerTable.userId, userTable.id))
      .leftJoin(activityTable, eq(ledgerTable.activityId, activityTable.id))
      .where(where)
      .orderBy(desc(ledgerTable.createdAt), desc(ledgerTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(ledgerTable).where(where)
  ])
  return { rows: rows as unknown as LedgerJoinRow[], total: Number(totalRows[0]?.value ?? 0) }
}

// ===== 后台审计流 =====

export async function listAllLedger(input: {
  category?: PointsCategory
  source?: PointsSource
  keyword?: string
  limit: number
  offset: number
}): Promise<{ rows: AdminLedgerJoinRow[], total: number }> {
  const operator = alias(userTable, 'operator')
  const kw = input.keyword?.trim()
  const keywordWhere: SQL | undefined = kw
    ? or(
        ilike(userTable.name, `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`),
        ilike(userTable.phoneNumber, `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`)
      )
    : undefined
  const where = and(
    input.category ? eq(ledgerTable.category, input.category) : undefined,
    input.source ? eq(ledgerTable.source, input.source) : undefined,
    keywordWhere
  )

  const selectShape = {
    id: ledgerTable.id,
    userId: ledgerTable.userId,
    points: ledgerTable.points,
    category: ledgerTable.category,
    source: ledgerTable.source,
    activityId: ledgerTable.activityId,
    registrationId: ledgerTable.registrationId,
    donationKind: ledgerTable.donationKind,
    note: ledgerTable.note,
    createdBy: ledgerTable.createdBy,
    reversalOf: ledgerTable.reversalOf,
    createdAt: ledgerTable.createdAt,
    userName: userTable.name,
    userImage: userTable.image,
    userPhone: userTable.phoneNumber,
    activityTitle: activityTable.title,
    operatorName: operator.name
  }

  const [rows, totalRows] = await Promise.all([
    db
      .select(selectShape)
      .from(ledgerTable)
      .innerJoin(userTable, eq(ledgerTable.userId, userTable.id))
      .leftJoin(activityTable, eq(ledgerTable.activityId, activityTable.id))
      .leftJoin(operator, eq(ledgerTable.createdBy, operator.id))
      .where(where)
      .orderBy(desc(ledgerTable.createdAt), desc(ledgerTable.id))
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({ value: count() })
      .from(ledgerTable)
      .innerJoin(userTable, eq(ledgerTable.userId, userTable.id))
      .where(where)
  ])
  return { rows: rows as unknown as AdminLedgerJoinRow[], total: Number(totalRows[0]?.value ?? 0) }
}

// ===== 后台活动选择器 =====

export interface ActivityPickerItem {
  id: string
  title: string
  startTime: Date
  endTime: Date
  status: string
  points: number
}

export async function listActivitiesForPicker(keyword: string | undefined): Promise<ActivityPickerItem[]> {
  const kw = keyword?.trim()
  const where = kw
    ? ilike(activityTable.title, `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`)
    : undefined
  return db
    .select({
      id: activityTable.id,
      title: activityTable.title,
      startTime: activityTable.startTime,
      endTime: activityTable.endTime,
      status: activityTable.status,
      points: activityTable.points
    })
    .from(activityTable)
    .where(where)
    .orderBy(desc(activityTable.startTime))
    .limit(30)
}
```

- [ ] **Step 2: typecheck**

Run: `cd backend; bun run typecheck`
Expected: 0 error（若报 `userTable.banned` 类型不存在，检查 auth-schema 的 user 是否有 banned additionalField——存在则通过）。

---

## Task 5: 积分视图纯函数（TDD）

**Files:**
- Create: `backend/server/utils/points-views.ts`
- Test: `backend/server/utils/points-views.test.ts`

- [ ] **Step 1: 先写失败测试**

创建 `backend/server/utils/points-views.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  buildReversalNote,
  isReversal,
  sourceLabel,
  toFeedItem,
  toLedgerView,
  type FeedJoinInput
} from './points-views'

const baseRow: FeedJoinInput = {
  id: 'l1',
  userId: 'u1',
  points: 10,
  category: 'activity',
  source: 'checkin',
  activityId: 'a1',
  registrationId: 'r1',
  donationKind: null,
  note: '',
  createdBy: null,
  reversalOf: null,
  createdAt: new Date('2026-10-14T09:00:00+08:00'),
  userName: '张三',
  userImage: null,
  activityTitle: '敬老院慰问'
}

describe('toFeedItem（全站动态：隐私裁剪）', () => {
  it('活动记录带活动标题，不含 note/registrationId 等敏感或内部字段', () => {
    const item = toFeedItem(baseRow)
    expect(item).toEqual({
      id: 'l1',
      userId: 'u1',
      userName: '张三',
      userImage: null,
      points: 10,
      category: 'activity',
      source: 'checkin',
      activityTitle: '敬老院慰问',
      donationKind: null,
      createdAt: '2026-10-14T01:00:00.000Z'
    })
    expect('note' in item).toBe(false)
    expect('registrationId' in item).toBe(false)
  })

  it('捐献记录只暴露 donationKind，绝不暴露 note', () => {
    const item = toFeedItem({
      ...baseRow,
      id: 'l2',
      category: 'donation',
      source: 'manual_donation',
      activityId: null,
      registrationId: null,
      donationKind: 'money',
      note: '捐款 1000 元',
      activityTitle: null
    })
    expect(item.donationKind).toBe('money')
    expect(item.activityTitle).toBeNull()
    expect('note' in item).toBe(false)
  })
})

describe('toLedgerView（本人明细：保留 note）', () => {
  it('活动明细带标题与备注', () => {
    const v = toLedgerView({ ...baseRow, note: '补录线下活动' })
    expect(v.note).toBe('补录线下活动')
    expect(v.activityTitle).toBe('敬老院慰问')
  })
})

describe('冲正辅助', () => {
  it('buildReversalNote 拼接原备注与原因', () => {
    expect(buildReversalNote('录错用户', '多录 20 分')).toBe('冲正：录错用户；原因：多录 20 分')
    expect(buildReversalNote('', '测试')).toBe('冲正：（原记录无备注）；原因：测试')
  })
  it('isReversal 仅识别 source=reversal', () => {
    expect(isReversal({ source: 'reversal' })).toBe(true)
    expect(isReversal({ source: 'checkin' })).toBe(false)
  })
  it('sourceLabel 中文映射齐全', () => {
    expect(sourceLabel('checkin')).toBe('签到奖励')
    expect(sourceLabel('manual_activity')).toBe('活动补录')
    expect(sourceLabel('manual_donation')).toBe('捐献录入')
    expect(sourceLabel('reversal')).toBe('冲正')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend; bun run test -- server/utils/points-views.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现纯函数文件**

创建 `backend/server/utils/points-views.ts`：

```ts
import type { PointsCategory, PointsSource } from '../database/schema'
import type {
  AdminLedgerJoinRow,
  LedgerJoinRow
} from '../database/repositories/points'

/** 动态流 join 行的结构输入（与 repository 的 LedgerJoinRow 同构）。 */
export interface FeedJoinInput {
  id: string
  userId: string
  points: number
  category: PointsCategory
  source: PointsSource
  activityId: string | null
  registrationId: string | null
  donationKind: 'money' | 'goods' | null
  note: string
  createdBy: string | null
  reversalOf: string | null
  createdAt: Date
  userName: string
  userImage: string | null
  activityTitle: string | null
}

export interface PointsFeedItem {
  id: string
  userId: string
  userName: string
  userImage: string | null
  points: number
  category: PointsCategory
  source: PointsSource
  activityTitle: string | null
  donationKind: 'money' | 'goods' | null
  createdAt: string
}

/** 全站动态：字段白名单，结构上不含 note / registrationId（捐献金额与物资名不可能泄露）。 */
export function toFeedItem(row: FeedJoinInput): PointsFeedItem {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    points: row.points,
    category: row.category,
    source: row.source,
    activityTitle: row.category === 'activity' ? row.activityTitle : null,
    donationKind: row.category === 'donation' ? row.donationKind : null,
    createdAt: row.createdAt.toISOString()
  }
}

export interface LedgerViewItem {
  id: string
  points: number
  category: PointsCategory
  source: PointsSource
  activityId: string | null
  donationKind: 'money' | 'goods' | null
  note: string
  reversalOf: string | null
  activityTitle: string | null
  createdAt: string
}

/** 本人明细：保留 note（本人有权看自己的金额/物资备注）。 */
export function toLedgerView(row: LedgerJoinRow): LedgerViewItem {
  return {
    id: row.id,
    points: row.points,
    category: row.category,
    source: row.source,
    activityId: row.activityId,
    donationKind: row.donationKind,
    note: row.note,
    reversalOf: row.reversalOf,
    activityTitle: row.activityTitle,
    createdAt: row.createdAt.toISOString()
  }
}

/** 后台审计视图：在本人明细基础上保留用户/操作人信息。 */
export function toAdminLedgerView(row: AdminLedgerJoinRow) {
  return {
    ...toLedgerView(row),
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    userPhone: row.userPhone,
    createdBy: row.createdBy,
    operatorName: row.operatorName
  }
}

export function isReversal(row: { source: string }): boolean {
  return row.source === 'reversal'
}

export function buildReversalNote(originalNote: string, reason: string): string {
  const note = originalNote.trim()
  return `冲正：${note ? note : '（原记录无备注）'}；原因：${reason.trim()}`
}

const SOURCE_LABELS: Record<PointsSource, string> = {
  checkin: '签到奖励',
  manual_activity: '活动补录',
  manual_donation: '捐献录入',
  reversal: '冲正'
}

export function sourceLabel(source: PointsSource): string {
  return SOURCE_LABELS[source]
}
```

- [ ] **Step 4: 跑测试**

Run: `cd backend; bun run test -- server/utils/points-views.test.ts`
Expected: PASS。

---

## Task 6: 积分业务服务 + 签到事务化发分

**Files:**
- Create: `backend/server/utils/points-service.ts`
- Modify: `backend/server/database/repositories/activities.ts`
- Modify: `backend/server/utils/activity-service.ts`

- [ ] **Step 1: repo 新增「条件更新签到」函数**

`server/database/repositories/activities.ts`：确认顶部已导入 `ne`（drizzle-orm），没有则加入。
在现有 `setRegistrationCheckedIn` 之后新增（保留旧函数暂不删，Task 6 Step 4 切换后删除）：

```ts
/**
 * 仅当报名行当前非 checked_in 时更新为已签到（原子条件更新）。
 * 返回到更新后的行表示「首次签到」；返回 null 表示此前已签到（幂等请求）。
 * 必须在事务内调用，与积分发放同事务。
 */
export async function setRegistrationCheckedInIfFirst(
  id: string,
  input: { checkInAt: Date, method: 'scan' | 'manual', checkedInBy: string | null },
  exec: DbExecutor
): Promise<RegistrationRow | null> {
  const rows = await exec
    .update(registrationTable)
    .set({
      status: 'checked_in',
      checkInAt: input.checkInAt,
      checkInMethod: input.method,
      checkedInBy: input.checkedInBy
    })
    .where(and(eq(registrationTable.id, id), ne(registrationTable.status, 'checked_in')))
    .returning()
  return rows[0] ?? null
}
```

- [ ] **Step 2: 创建 points-service.ts**

```ts
import { db } from '../database/client'
import { getActivityById, type DbExecutor } from '../database/repositories/activities'
import {
  getLedgerById,
  getReversalOf,
  getUserPoints,
  insertLedger,
  listActivitiesForPicker,
  listAllLedger,
  listFeed,
  listLeaderboard,
  listMyLedger,
  upsertPointsDelta,
  type PointsDimension,
  type PointsLedgerRow
} from '../database/repositories/points'
import { getUserById } from '../database/repositories/users'
import type { ManualPointsBody } from '../schemas/points'
import { createApiError } from './errors'
import {
  buildReversalNote,
  isReversal,
  sourceLabel,
  toAdminLedgerView,
  toFeedItem,
  toLedgerView
} from './points-views'

// ===== 签到自动发分 =====

/**
 * 签到事务内调用：仅当流水实际插入（registration_id 唯一索引放行）时累加汇总。
 * points=0 的活动不写流水。
 */
export async function awardCheckinPoints(
  tx: DbExecutor,
  input: { registrationId: string, userId: string, activityId: string, points: number }
): Promise<PointsLedgerRow | null> {
  if (input.points <= 0) return null
  const row = await insertLedger(
    {
      userId: input.userId,
      points: input.points,
      category: 'activity',
      source: 'checkin',
      activityId: input.activityId,
      registrationId: input.registrationId,
      createdBy: null
    },
    tx,
    { ignoreRegistrationConflict: true }
  )
  if (!row) return null // 重复签到/补签：唯一索引冲突，不重复加分
  await upsertPointsDelta(input.userId, 'activity', input.points, tx)
  return row
}

// ===== 手工录入 =====

export async function awardManualPoints(
  body: ManualPointsBody,
  operatorId: string
): Promise<PointsLedgerRow> {
  const target = await getUserById(body.userId)
  if (!target) throw createApiError('NOT_FOUND', { message: '用户不存在' })

  if (body.category === 'activity') {
    const activity = await getActivityById(body.activityId!)
    if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })
  }

  return db.transaction(async (tx) => {
    const row = await insertLedger(
      {
        userId: body.userId,
        points: body.points,
        category: body.category,
        source: body.category === 'activity' ? 'manual_activity' : 'manual_donation',
        activityId: body.category === 'activity' ? body.activityId! : null,
        donationKind: body.category === 'donation' ? body.donationKind! : null,
        note: body.note,
        createdBy: operatorId,
        createdAt: body.createdAt
      },
      tx
    )
    await upsertPointsDelta(body.userId, body.category, body.points, tx)
    return row!
  })
}

// ===== 冲正 =====

export async function reverseLedger(
  originalId: string,
  reason: string,
  operatorId: string
): Promise<PointsLedgerRow> {
  const original = await getLedgerById(originalId)
  if (!original) throw createApiError('NOT_FOUND', { message: '积分记录不存在' })
  if (isReversal(original)) {
    throw createApiError('VALIDATION_ERROR', { message: '冲正记录不能再次冲正' })
  }
  if (await getReversalOf(originalId)) {
    throw createApiError('CONFLICT', { message: '该记录已冲正' })
  }
  const summary = await getUserPoints(original.userId)
  const net = original.category === 'activity' ? summary?.activityPoints : summary?.donationPoints
  if (summary === null || (net ?? 0) < original.points) {
    throw createApiError('CONFLICT', { message: '该用户当前积分余额不足，无法冲正' })
  }

  return db.transaction(async (tx) => {
    const row = await insertLedger(
      {
        userId: original.userId,
        points: -original.points,
        category: original.category,
        source: 'reversal',
        activityId: original.activityId,
        donationKind: original.donationKind,
        note: buildReversalNote(original.note, reason),
        createdBy: operatorId,
        reversalOf: original.id
      },
      tx
    )
    await upsertPointsDelta(original.userId, original.category, -original.points, tx)
    return row!
  })
}

// ===== 读侧 =====

export async function getMyPointsOverview(userId: string) {
  const summary = await getUserPoints(userId)
  const activityPoints = summary?.activityPoints ?? 0
  const donationPoints = summary?.donationPoints ?? 0
  return { activityPoints, donationPoints, total: activityPoints + donationPoints }
}

export async function getLeaderboardView(input: {
  dimension: PointsDimension
  page: number
  pageSize: number
  viewerId: string
}) {
  const { rows, total } = await listLeaderboard(input.dimension, {
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  })
  const data = rows.map((r, i) => ({
    rank: (input.page - 1) * input.pageSize + i + 1,
    ...r,
    isMe: r.userId === input.viewerId
  }))
  return { data, total }
}

export async function getFeedView(input: {
  category?: 'activity' | 'donation'
  page: number
  pageSize: number
}) {
  const { rows, total } = await listFeed(input.category, {
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  })
  return { data: rows.map(toFeedItem), total }
}

export async function getMyLedgerView(input: {
  userId: string
  category?: 'activity' | 'donation'
  page: number
  pageSize: number
}) {
  const { rows, total } = await listMyLedger(input.userId, input.category, {
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  })
  return { data: rows.map(toLedgerView), total }
}

export async function getAdminLedgerView(input: {
  category?: 'activity' | 'donation'
  source?: 'checkin' | 'manual_activity' | 'manual_donation' | 'reversal'
  keyword?: string
  page: number
  pageSize: number
}) {
  const { rows, total } = await listAllLedger({
    category: input.category,
    source: input.source,
    keyword: input.keyword,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  })
  return { data: rows.map(toAdminLedgerView), total }
}

export { listActivitiesForPicker, sourceLabel }
```

- [ ] **Step 3: 签到两个入口事务化并发分**

`server/utils/activity-service.ts` 顶部 import 调整：
- from repositories/activities 的导入中，用 `setRegistrationCheckedInIfFirst` 替换 `setRegistrationCheckedIn`；
- 新增：`import { awardCheckinPoints } from './points-service'`。

将 `checkInToActivity` 函数整体替换为：

```ts
export async function checkInToActivity(
  activityId: string,
  userId: string,
  code: string,
  now: Date = new Date()
) {
  const activity = await getActivityById(activityId)
  if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })
  if (activity.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '活动已取消' })
  }

  const reg = await getRegistration(activityId, userId)
  if (!reg) throw createApiError('CONFLICT', { message: '请先报名再签到' })
  if (reg.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '报名已取消，请重新报名' })
  }
  if (reg.status === 'checked_in') return reg // 幂等快速返回，不开事务

  const opensAt = new Date(new Date(activity.startTime).getTime() - CHECKIN_LEAD_MS)
  if (now < opensAt) throw createApiError('CONFLICT', { message: '签到尚未开始' })
  if (now > new Date(activity.endTime)) {
    throw createApiError('CONFLICT', { message: '活动已结束，签到已关闭' })
  }
  if (!verifyCheckinCode(activityId, code, now)) {
    throw createApiError('VALIDATION_ERROR', { message: '签到码无效或已过期' })
  }

  // 签到落盘 + 积分发放同事务；条件更新保证只有首次签到发分
  return db.transaction(async (tx) => {
    const updated = await setRegistrationCheckedInIfFirst(
      reg.id,
      { checkInAt: now, method: 'scan', checkedInBy: null },
      tx
    )
    if (!updated) return reg // 并发下已被另一请求签到：幂等，不发分
    await awardCheckinPoints(tx, {
      registrationId: updated.id,
      userId: updated.userId,
      activityId,
      points: activity.points
    })
    return updated
  })
}
```

将 `manualCheckIn` 函数整体替换为：

```ts
export async function manualCheckIn(
  activityId: string,
  targetUserId: string,
  operatorId: string,
  now: Date = new Date()
) {
  const activity = await requireActivity(activityId)
  const reg = await getRegistration(activityId, targetUserId)
  if (!reg) throw createApiError('CONFLICT', { message: '该用户未报名此活动' })
  if (reg.status === 'checked_in') return reg // 幂等快速返回
  if (reg.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '该用户已取消报名' })
  }
  return db.transaction(async (tx) => {
    const updated = await setRegistrationCheckedInIfFirst(
      reg.id,
      { checkInAt: now, method: 'manual', checkedInBy: operatorId },
      tx
    )
    if (!updated) return reg
    await awardCheckinPoints(tx, {
      registrationId: updated.id,
      userId: updated.userId,
      activityId,
      points: activity.points
    })
    return updated
  })
}
```

- [ ] **Step 4: 删除旧的 setRegistrationCheckedIn**

确认全仓无其他引用（Grep `setRegistrationCheckedIn\b`，注意不要误删 `IfFirst`）后，删除 `repositories/activities.ts` 中的旧 `setRegistrationCheckedIn` 函数。

Run（在 backend 目录）:
- Grep 验证：搜索 `setRegistrationCheckedIn(` 应只剩 `setRegistrationCheckedInIfFirst` 的定义与两处调用。

- [ ] **Step 5: typecheck 与全量单测**

Run: `cd backend; bun run typecheck; bun run test`
Expected: 0 error，全部测试 PASS。

---

## Task 7: 登录用户积分端点

**Files:**
- Create:
  - `backend/server/api/points/leaderboard.get.ts`
  - `backend/server/api/points/feed.get.ts`
  - `backend/server/api/points/me.get.ts`
  - `backend/server/api/points/me/ledger.get.ts`

- [ ] **Step 1: leaderboard.get.ts**

```ts
import { leaderboardQuerySchema } from '../../schemas/points'
import { getLeaderboardView } from '../../utils/points-service'

/** 积分排行榜（登录可见）：dimension=total|activity|donation，默认 total。 */
export default defineEventHandler(async (event) => {
  const me = requireUser(event)
  const query = parseQuery(event, leaderboardQuerySchema)
  const { data, total } = await getLeaderboardView({
    dimension: query.dimension,
    page: query.page,
    pageSize: query.pageSize,
    viewerId: me.id
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
```

- [ ] **Step 2: feed.get.ts**

```ts
import { feedQuerySchema } from '../../schemas/points'
import { getFeedView } from '../../utils/points-service'

/** 全站近期积分获取动态（登录可见）；捐献记录在 service 层已强制隐去 note。 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const query = parseQuery(event, feedQuerySchema)
  const { data, total } = await getFeedView({
    category: query.category,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
```

- [ ] **Step 3: me.get.ts**

```ts
import { getMyPointsOverview } from '../../utils/points-service'

/** 我的积分总览。 */
export default defineEventHandler((event) => {
  const me = requireUser(event)
  return getMyPointsOverview(me.id).then(data => ok(data))
})
```

- [ ] **Step 4: me/ledger.get.ts**

```ts
import { myLedgerQuerySchema } from '../../../schemas/points'
import { getMyLedgerView } from '../../../utils/points-service'

/** 我的积分明细（含本人完整备注）。 */
export default defineEventHandler(async (event) => {
  const me = requireUser(event)
  const query = parseQuery(event, myLedgerQuerySchema)
  const { data, total } = await getMyLedgerView({
    userId: me.id,
    category: query.category,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
```

- [ ] **Step 5: typecheck + lint**

Run: `cd backend; bun run typecheck; bun run lint`
Expected: 0 error / 0 problem。

---

## Task 8: 管理员积分端点 + 限流

**Files:**
- Create:
  - `backend/server/api/admin/points/index.post.ts`
  - `backend/server/api/admin/points/ledger.get.ts`
  - `backend/server/api/admin/points/activities.get.ts`
  - `backend/server/api/admin/points/[id]/reverse.post.ts`
- Modify: `backend/server/utils/rate-limit.ts`

- [ ] **Step 1: 手工录入 POST**

`server/api/admin/points/index.post.ts`：

```ts
import { manualPointsBodySchema } from '../../../schemas/points'
import { awardManualPoints } from '../../../utils/points-service'

/** 管理员手工录入积分（活动补录 / 捐献录入，仅 admin）。 */
export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const body = await parseBody(event, manualPointsBodySchema)
  const row = await awardManualPoints(body, admin.id)
  setResponseStatus(event, 201)
  return ok(row, body.category === 'activity' ? '活动积分录入成功' : '捐献积分录入成功')
})
```

- [ ] **Step 2: 审计流水分页 GET**

`server/api/admin/points/ledger.get.ts`：

```ts
import { adminLedgerQuerySchema } from '../../../schemas/points'
import { getAdminLedgerView } from '../../../utils/points-service'

/** 全量积分流水（含备注/操作人，仅 admin）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const query = parseQuery(event, adminLedgerQuerySchema)
  const { data, total } = await getAdminLedgerView({
    category: query.category,
    source: query.source,
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
```

- [ ] **Step 3: 活动选择器 GET**

`server/api/admin/points/activities.get.ts`：

```ts
import { activityPickerQuerySchema } from '../../../schemas/points'
import { listActivitiesForPicker } from '../../../utils/points-service'

/** 录入活动积分时的活动下拉候选（最近 30 条，可按标题搜索，仅 admin）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const query = parseQuery(event, activityPickerQuerySchema)
  const rows = await listActivitiesForPicker(query.keyword)
  return ok(rows)
})
```

- [ ] **Step 4: 冲正 POST**

`server/api/admin/points/[id]/reverse.post.ts`：

```ts
import { ledgerIdParamsSchema, reversalBodySchema } from '../../../../schemas/points'
import { reverseLedger } from '../../../../utils/points-service'

/** 冲正一条积分流水（生成等额负流水，仅 admin）。 */
export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const params = parseParams(event, ledgerIdParamsSchema)
  const body = await parseBody(event, reversalBodySchema)
  const row = await reverseLedger(params.id, body.reason, admin.id)
  return ok(row, '冲正成功')
})
```

- [ ] **Step 5: 限流档位**

`server/utils/rate-limit.ts` 的 `isSensitiveEndpoint` 中，在管理员建用户判定之后追加：

```ts
    || (pathname === '/api/admin/users' && method === 'POST')
    || (method === 'POST' && pathname === '/api/admin/points')
    || (method === 'POST' && /^\/api\/admin\/points\/[^/]+\/reverse$/.test(pathname))
```

如该文件有对应单测断言敏感端点数量，同步补两条断言（Grep `rate-limit` 下的 test 文件；没有则跳过）。

- [ ] **Step 6: typecheck + lint + test**

Run: `cd backend; bun run typecheck; bun run lint; bun run test`
Expected: 全绿。

---

## Task 9: PC 后台积分管理页

**Files:**
- Modify: `backend/app/layouts/default.vue`
- Create: `backend/app/pages/admin/points.vue`
- Modify: `backend/app/pages/admin/activities/[id].vue`

- [ ] **Step 1: 侧边栏菜单**

`app/layouts/default.vue` 的 `navItems` 中，在「活动管理」项之后插入：

```ts
  { label: '积分管理', to: '/admin/points', icon: 'i-lucide-trophy' as unknown as Component, adminOnly: true },
```

- [ ] **Step 2: 活动详情展示参与积分**

`app/pages/admin/activities/[id].vue` 中「名额」`<div>...</div>`（约 166-175 行）之后插入：

```vue
        <div>
          <dt class="text-muted">
            参与积分
          </dt>
          <dd>{{ activity.points }} 分</dd>
        </div>
```

- [ ] **Step 3: 创建积分管理页**

创建 `backend/app/pages/admin/points.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface UserOption {
  id: string
  name: string
  phoneNumber: string | null
  email: string
}
interface ActivityOption {
  id: string
  title: string
  startTime: string
  status: string
  points: number
}
interface LedgerRow {
  id: string
  userId: string
  userName: string
  userImage: string | null
  userPhone: string | null
  points: number
  category: 'activity' | 'donation'
  source: 'checkin' | 'manual_activity' | 'manual_donation' | 'reversal'
  activityId: string | null
  activityTitle: string | null
  donationKind: 'money' | 'goods' | null
  note: string
  reversalOf: string | null
  operatorName: string | null
  createdAt: string
}
interface PagedEnvelope<T> {
  code: 'OK'
  data: T[]
  pagination: { page: number, pageSize: number, total: number, totalPages: number }
}

const toast = useToast()
const loading = ref(false)
const rows = ref<LedgerRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

const filters = ref({ category: '', source: '', keyword: '' })

const columns = [
  { accessorKey: 'createdAt', header: '时间' },
  { accessorKey: 'userName', header: '用户' },
  { accessorKey: 'category', header: '类别' },
  { accessorKey: 'source', header: '来源' },
  { accessorKey: 'points', header: '积分' },
  { accessorKey: 'target', header: '活动/类型' },
  { accessorKey: 'note', header: '备注' },
  { accessorKey: 'operatorName', header: '操作人' },
  { accessorKey: 'actions', header: '操作' }
]

const SOURCE_LABEL: Record<string, string> = {
  checkin: '签到奖励',
  manual_activity: '活动补录',
  manual_donation: '捐献录入',
  reversal: '冲正'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  loading.value = true
  try {
    const res = await $fetch<PagedEnvelope<LedgerRow>>('/api/admin/points/ledger', {
      credentials: 'include',
      query: {
        page: page.value,
        pageSize,
        ...(filters.value.category ? { category: filters.value.category } : {}),
        ...(filters.value.source ? { source: filters.value.source } : {}),
        ...(filters.value.keyword.trim() ? { keyword: filters.value.keyword.trim() } : {})
      }
    })
    rows.value = res.data
    total.value = res.pagination.total
  }
  finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  load()
}

// —— 录入弹窗 ——
const modalOpen = ref(false)
const submitting = ref(false)
const form = ref({
  category: 'donation' as 'activity' | 'donation',
  userId: '',
  points: 0,
  activityId: '',
  donationKind: 'money' as 'money' | 'goods',
  note: '',
  createdAt: ''
})
const userKeyword = ref('')
const userResults = ref<UserOption[]>([])
const activityKeyword = ref('')
const activityResults = ref<ActivityOption[]>([])
const selectedUser = ref<UserOption | null>(null)
const selectedActivity = ref<ActivityOption | null>(null)
let userSearchTimer: ReturnType<typeof setTimeout> | undefined
let activitySearchTimer: ReturnType<typeof setTimeout> | undefined

function openCreate() {
  form.value = {
    category: 'donation',
    userId: '',
    points: 0,
    activityId: '',
    donationKind: 'money',
    note: '',
    createdAt: ''
  }
  selectedUser.value = null
  selectedActivity.value = null
  userKeyword.value = ''
  userResults.value = []
  activityKeyword.value = ''
  activityResults.value = []
  modalOpen.value = true
}

function watchUserKeyword() {
  clearTimeout(userSearchTimer)
  userSearchTimer = setTimeout(searchUsers, 300)
}

async function searchUsers() {
  const kw = userKeyword.value.trim()
  if (!kw) {
    userResults.value = []
    return
  }
  const res = await $fetch<PagedEnvelope<UserOption>>('/api/admin/users', {
    credentials: 'include',
    query: { keyword: kw, page: 1, pageSize: 8 }
  })
  userResults.value = res.data
}

function watchActivityKeyword() {
  clearTimeout(activitySearchTimer)
  activitySearchTimer = setTimeout(searchActivities, 300)
}

async function searchActivities() {
  const res = await $fetch<{ code: 'OK', data: ActivityOption[] }>('/api/admin/points/activities', {
    credentials: 'include',
    query: activityKeyword.value.trim() ? { keyword: activityKeyword.value.trim() } : {}
  })
  activityResults.value = res.data
}

function pickUser(u: UserOption) {
  selectedUser.value = u
  form.value.userId = u.id
  userKeyword.value = u.phoneNumber ? `${u.name}（${u.phoneNumber}）` : u.name
  userResults.value = []
}

function pickActivity(a: ActivityOption) {
  selectedActivity.value = a
  form.value.activityId = a.id
  form.value.points = a.points
  activityKeyword.value = a.title
  activityResults.value = []
}

const formErrors = computed(() => {
  const errs: { name: string, message: string }[] = []
  if (!form.value.userId)
    errs.push({ name: 'user', message: '请选择用户' })
  if (!Number.isInteger(form.value.points) || form.value.points < 1 || form.value.points > 9999)
    errs.push({ name: 'points', message: '积分需为 1~9999 的整数' })
  if (form.value.category === 'activity' && !form.value.activityId)
    errs.push({ name: 'activity', message: '请选择活动' })
  if (form.value.note.length > 200)
    errs.push({ name: 'note', message: '备注不能超过 200 字' })
  return errs
})

async function submitForm() {
  if (formErrors.value.length) {
    toast.add({ title: formErrors.value[0]!.message, color: 'error' })
    return
  }
  submitting.value = true
  try {
    await $fetch('/api/admin/points', {
      method: 'POST',
      credentials: 'include',
      body: {
        category: form.value.category,
        userId: form.value.userId,
        points: form.value.points,
        ...(form.value.category === 'activity'
          ? { activityId: form.value.activityId }
          : { donationKind: form.value.donationKind }),
        ...(form.value.note.trim() ? { note: form.value.note.trim() } : {}),
        ...(form.value.createdAt ? { createdAt: new Date(form.value.createdAt).toISOString() } : {})
      }
    })
    toast.add({ title: '录入成功', color: 'success' })
    modalOpen.value = false
    await load()
  }
  finally {
    submitting.value = false
  }
}

// —— 冲正确认 ——
const reverseTarget = ref<LedgerRow | null>(null)
const reverseReason = ref('')
const reversing = ref(false)
const reverseOpen = ref(false)

function openReverse(row: LedgerRow) {
  reverseTarget.value = row
  reverseReason.value = ''
  reverseOpen.value = true
}

async function submitReverse() {
  if (!reverseTarget.value)
    return
  if (!reverseReason.value.trim()) {
    toast.add({ title: '请填写冲正原因', color: 'error' })
    return
  }
  reversing.value = true
  try {
    await $fetch(`/api/admin/points/${reverseTarget.value.id}/reverse`, {
      method: 'POST',
      credentials: 'include',
      body: { reason: reverseReason.value.trim() }
    })
    toast.add({ title: '冲正成功', color: 'success' })
    reverseOpen.value = false
    await load()
  }
  finally {
    reversing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <h1 class="text-xl font-semibold">
        积分管理
      </h1>
      <UButton icon="i-lucide-plus" label="录入积分" @click="openCreate" />
    </div>

    <UCard>
      <div class="flex gap-2 items-end flex-wrap">
        <label class="text-sm space-y-1">
          <span class="text-muted">类别</span>
          <USelect v-model="filters.category" :items="[{ label: '全部', value: '' }, { label: '活动积分', value: 'activity' }, { label: '捐献积分', value: 'donation' }]" value-key="value" class="w-32" />
        </label>
        <label class="text-sm space-y-1">
          <span class="text-muted">来源</span>
          <USelect v-model="filters.source" :items="[{ label: '全部', value: '' }, { label: '签到奖励', value: 'checkin' }, { label: '活动补录', value: 'manual_activity' }, { label: '捐献录入', value: 'manual_donation' }, { label: '冲正', value: 'reversal' }]" value-key="value" class="w-36" />
        </label>
        <UInput v-model="filters.keyword" placeholder="用户姓名/手机号" class="w-52" />
        <UButton label="筛选" variant="soft" @click="applyFilters" />
      </div>
    </UCard>

    <UCard>
      <UTable :data="rows" :columns="columns" :loading="loading">
        <template #createdAt-cell="{ row }">
          {{ formatTime(row.original.createdAt) }}
        </template>
        <template #category-cell="{ row }">
          <UBadge :color="row.original.category === 'activity' ? 'success' : 'warning'" variant="subtle">
            {{ row.original.category === 'activity' ? '活动' : '捐献' }}
          </UBadge>
        </template>
        <template #source-cell="{ row }">
          {{ SOURCE_LABEL[row.original.source] }}
        </template>
        <template #points-cell="{ row }">
          <span :class="row.original.points < 0 ? 'text-error font-medium' : 'text-success font-medium'">
            {{ row.original.points > 0 ? '+' : '' }}{{ row.original.points }}
          </span>
        </template>
        <template #target-cell="{ row }">
          <span v-if="row.original.activityTitle">{{ row.original.activityTitle }}</span>
          <span v-else-if="row.original.donationKind === 'money'">捐款</span>
          <span v-else-if="row.original.donationKind === 'goods'">物资</span>
          <span v-else class="text-muted">—</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="row.original.source !== 'reversal' && !row.original.reversalOf"
            label="冲正"
            color="error"
            variant="ghost"
            size="xs"
            @click="openReverse(row.original)"
          />
          <span v-else class="text-muted text-xs">
            {{ row.original.source === 'reversal' ? '冲正记录' : '已冲正' }}
          </span>
        </template>
      </UTable>
      <div class="mt-4 flex justify-end">
        <UPagination v-model:page="page" :total="total" :items-per-page="pageSize" @update:page="load" />
      </div>
    </UCard>

    <!-- 录入弹窗：正文必须放 #body -->
    <UModal v-model:open="modalOpen" title="录入积分">
      <template #body>
        <div class="p-4 space-y-4">
          <UFormField label="积分类别" name="category">
            <URadioGroup v-model="form.category" :items="[{ label: '捐献积分', value: 'donation' }, { label: '活动积分', value: 'activity' }]" value-key="value" />
          </UFormField>

          <UFormField label="用户（姓名/手机号搜索）" name="user" :error="formErrors.find(e => e.name === 'user')?.message">
            <div class="relative">
              <UInput v-model="userKeyword" placeholder="输入姓名或手机号搜索" class="w-full" @input="watchUserKeyword" />
              <div v-if="userResults.length" class="absolute z-10 mt-1 w-full rounded-md border border-default bg-overlay shadow-lg">
                <button v-for="u in userResults" :key="u.id" type="button" class="w-full px-3 py-2 text-left text-sm hover:bg-elevated" @click="pickUser(u)">
                  {{ u.name }}<span v-if="u.phoneNumber" class="text-muted ml-2">{{ u.phoneNumber }}</span>
                </button>
              </div>
            </div>
          </UFormField>

          <template v-if="form.category === 'activity'">
            <UFormField label="活动（选中后自动带出配置积分，可修改）" name="activity" :error="formErrors.find(e => e.name === 'activity')?.message">
              <div class="relative">
                <UInput v-model="activityKeyword" placeholder="输入活动标题搜索" class="w-full" @input="watchActivityKeyword" @focus="searchActivities" />
                <div v-if="activityResults.length" class="absolute z-10 mt-1 w-full rounded-md border border-default bg-overlay shadow-lg">
                  <button v-for="a in activityResults" :key="a.id" type="button" class="w-full px-3 py-2 text-left text-sm hover:bg-elevated" @click="pickActivity(a)">
                    {{ a.title }}
                    <span class="text-muted ml-2">{{ new Date(a.startTime).toLocaleDateString('zh-CN') }} · {{ a.points }} 分{{ a.status === 'cancelled' ? ' · 已取消' : '' }}</span>
                  </button>
                </div>
              </div>
            </UFormField>
          </template>
          <UFormField v-else label="捐献类型">
            <URadioGroup v-model="form.donationKind" :items="[{ label: '捐款', value: 'money' }, { label: '物资', value: 'goods' }]" value-key="value" />
          </UFormField>

          <UFormField label="积分值（1~9999）" name="points" :error="formErrors.find(e => e.name === 'points')?.message">
            <UInput v-model.number="form.points" type="number" :min="1" :max="9999" class="w-full" />
          </UFormField>
          <UFormField label="备注（金额/物资名称等，仅后台与本人可见）" name="note">
            <UTextarea v-model="form.note" :rows="2" maxlength="200" class="w-full" />
          </UFormField>
          <UFormField label="录入时间（留空为当前时间，可补录历史）">
            <UInput v-model="form.createdAt" type="datetime-local" class="w-full" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton label="取消" color="neutral" variant="ghost" @click="modalOpen = false" />
            <UButton label="提交" :loading="submitting" @click="submitForm" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- 冲正弹窗 -->
    <UModal v-model:open="reverseOpen" title="冲正确认">
      <template #body>
        <div class="p-4 space-y-4" v-if="reverseTarget">
          <p class="text-sm">
            将为 <b>{{ reverseTarget.userName }}</b> 的
            {{ reverseTarget.category === 'activity' ? '活动' : '捐献' }}积分
            <b :class="reverseTarget.points < 0 ? 'text-error' : 'text-success'">
              {{ reverseTarget.points > 0 ? '+' : '' }}{{ reverseTarget.points }}
            </b>
            生成等额扣减，操作不可撤销。
          </p>
          <UFormField label="冲正原因（必填）">
            <UTextarea v-model="reverseReason" :rows="2" maxlength="200" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton label="取消" color="neutral" variant="ghost" @click="reverseOpen = false" />
            <UButton label="确认冲正" color="error" :loading="reversing" @click="submitReverse" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 4: 验证**

Run: `cd backend; bun run typecheck; bun run lint`
Expected: 0 error/problem。
启动后端 `bun run dev`，admin 登录后台确认：侧栏出现「积分管理」；录入弹窗两类切换、用户/活动搜索、冲正二次确认可用（联调在 Task 11 后与前端一并做）。

---

## Task 10: 前端 API 层与活动类型增量

**Files:**
- Create: `frontend/src/api/points.ts`
- Modify: `frontend/src/api/activity.ts`

- [ ] **Step 1: 创建 src/api/points.ts**

```ts
import type { ApiEnvelope } from '@/http/alova'
import { http } from '@/http/alova'

export type PointsDimension = 'total' | 'activity' | 'donation'
export type PointsCategory = 'activity' | 'donation'
export type PointsSource = 'checkin' | 'manual_activity' | 'manual_donation' | 'reversal'
export type DonationKind = 'money' | 'goods'

export interface PointsOverview {
  activityPoints: number
  donationPoints: number
  total: number
}

export interface LeaderboardRow {
  rank: number
  userId: string
  name: string
  image: string | null
  activityPoints: number
  donationPoints: number
  total: number
  isMe: boolean
}

export interface PointsFeedItem {
  id: string
  userId: string
  userName: string
  userImage: string | null
  points: number
  category: PointsCategory
  source: PointsSource
  activityTitle: string | null
  donationKind: DonationKind | null
  createdAt: string
}

export interface LedgerItem {
  id: string
  points: number
  category: PointsCategory
  source: PointsSource
  activityId: string | null
  donationKind: DonationKind | null
  note: string
  reversalOf: string | null
  activityTitle: string | null
  createdAt: string
}

export type PaginationMeta = NonNullable<ApiEnvelope<unknown>['pagination']>
export interface Paged<T> {
  data: T[]
  pagination: PaginationMeta
}

/** 我的积分总览。 */
export function getMyPoints(): Promise<PointsOverview> {
  return http.Get('/points/me') as unknown as Promise<PointsOverview>
}

/** 排行榜（登录可见）。 */
export function getLeaderboard(
  dimension: PointsDimension,
  page: number,
  pageSize = 20,
): Promise<Paged<LeaderboardRow>> {
  return http.Get('/points/leaderboard', {
    params: { dimension, page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<LeaderboardRow>>
}

/** 全站近期积分动态（捐献记录不含金额/物资/备注）。 */
export function getPointsFeed(
  page: number,
  category?: PointsCategory,
  pageSize = 20,
): Promise<Paged<PointsFeedItem>> {
  return http.Get('/points/feed', {
    params: { page, pageSize, ...(category ? { category } : {}) },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<PointsFeedItem>>
}

/** 我的积分明细（含本人备注）。 */
export function getMyLedger(
  page: number,
  category?: PointsCategory,
  pageSize = 20,
): Promise<Paged<LedgerItem>> {
  return http.Get('/points/me/ledger', {
    params: { page, pageSize, ...(category ? { category } : {}) },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<LedgerItem>>
}
```

注意：全局 alova 已配置 `cacheFor: { GET: 0 }`，此处无需再处理缓存。

- [ ] **Step 2: activity.ts 增加 points**

`src/api/activity.ts`：
- `ActivityView` 接口中 `capacity: number | null` 之后加 `points: number`；
- `ActivityPayload` 接口中 `capacity?: number | null` 之后加 `points: number`。

- [ ] **Step 3: type-check**

Run: `cd frontend; bun run type-check`
Expected: edit.vue 因 buildPayload 未提供 points 可能报错——Task 11 修复；如该步即报错，先继续 Task 11 再统一跑门禁。

---

## Task 11: 前端活动表单与详情接入积分

**Files:**
- Modify: `frontend/src/pages/activity/edit.vue`
- Modify: `frontend/src/pages/activity/detail.vue`

- [ ] **Step 1: edit.vue 表单状态**

`form` ref 中 `capacityText: '',` 之后加 `pointsText: '0',`；
`preffill` 中 `form.value.capacityText = ...` 一行之后加：

```ts
    form.value.pointsText = String(a.points ?? 0)
```

- [ ] **Step 2: edit.vue 校验与提交**

`validate()` 中人数上限校验块之后加：

```ts
  const points = Number(f.pointsText)
  if (!Number.isInteger(points) || points < 0 || points > 9999)
    return '参与积分需为 0~9999 的整数'
```

`buildPayload()` 函数体开头（`const f = form.value` 之后）加：

```ts
  const points = Number(f.pointsText) || 0
```

并在返回对象中 `capacity: f.capacityText.trim() === '' ? null : Number(f.capacityText),` 一行之后加：

```ts
    points,
```

- [ ] **Step 3: edit.vue 模板加输入行**

在「人数上限」`<view class="flex items-center border-t border-line px-4 py-3.5">...</view>` 整块之后插入：

```vue
      <view class="flex items-center border-t border-line px-4 py-3.5">
        <text class="text-4 text-sub">参与积分</text>
        <input
          v-model="form.pointsText"
          type="number"
          placeholder="签到可得积分，0 表示不计分"
          class="ml-auto h-32px w-220px rounded-2 bg-hover px-3 text-right text-4 text-ink"
        >
      </view>
```

- [ ] **Step 4: detail.vue 展示积分提示**

在模板中「已报名 / 已签到」统计行所在 `<view>`（含 `已报名 {{ detail.registeredCount }} 人` 与 `已签到 {{ detail.checkedInCount }} 人`，约 350-355 行）之后、同级位置插入：

```vue
            <view v-if="detail.points > 0" class="mt-2 flex items-center text-3.5 text-primary-soft-text">
              <view class="i-carbon-trophy mr-1 text-14px" />
              签到可得 {{ detail.points }} 积分
            </view>
```

- [ ] **Step 5: 验证**

Run: `cd frontend; bun run type-check; bun run lint`
Expected: 0 error。`bun run dev:h5` 手动确认：发布/编辑活动可见积分输入；活动详情积分提示仅 >0 显示。

---

## Task 12: 前端排行榜页、明细页、我的入口

**Files:**
- Create: `frontend/src/pages/points/index.vue`
- Create: `frontend/src/pages/points/ledger.vue`
- Modify: `frontend/src/pages/me/me.vue`

- [ ] **Step 1: 创建排行榜 + 动态页**

创建 `frontend/src/pages/points/index.vue`：

```vue
<script lang="ts" setup>
import {
  getLeaderboard,
  getPointsFeed,
  getMyPoints,
  type LeaderboardRow,
  type PointsDimension,
  type PointsFeedItem,
  type PointsOverview,
} from '@/api/points'
import { resolveMediaUrl } from '@/api/profile'

definePage({
  style: { navigationBarTitleText: '积分排行' },
})

const tabs: { label: string, value: PointsDimension }[] = [
  { label: '总榜', value: 'total' },
  { label: '活动榜', value: 'activity' },
  { label: '捐献榜', value: 'donation' },
]
const dimension = ref<PointsDimension>('total')
const overview = ref<PointsOverview>({ activityPoints: 0, donationPoints: 0, total: 0 })

const ranks = ref<LeaderboardRow[]>([])
const rankTotal = ref(0)
const rankPage = ref(1)
const rankLoading = ref(false)

const feed = ref<PointsFeedItem[]>([])
const feedTotal = ref(0)
const feedPage = ref(1)
const feedLoading = ref(false)
const pageSize = 20

function avatar(url: string | null) {
  return resolveMediaUrl(url) || '/static/images/default-avatar.png'
}

function scoreText(row: LeaderboardRow) {
  if (dimension.value === 'activity')
    return `${row.activityPoints}`
  if (dimension.value === 'donation')
    return `${row.donationPoints}`
  return `${row.total}`
}

async function loadOverview() {
  try {
    overview.value = await getMyPoints()
  }
  catch { /* 拦截器已提示 */ }
}

async function loadRanks(reset = false) {
  if (rankLoading.value)
    return
  if (reset) {
    rankPage.value = 1
    ranks.value = []
  }
  rankLoading.value = true
  try {
    const res = await getLeaderboard(dimension.value, rankPage.value, pageSize)
    ranks.value = reset ? res.data : [...ranks.value, ...res.data]
    rankTotal.value = res.pagination.total
  }
  finally {
    rankLoading.value = false
  }
}

function switchTab(d: PointsDimension) {
  if (dimension.value === d)
    return
  dimension.value = d
  loadRanks(true)
}

function feedText(item: PointsFeedItem) {
  if (item.category === 'activity') {
    return item.source === 'manual_activity'
      ? `活动奖励「${item.activityTitle ?? ''}」`
      : `参加活动「${item.activityTitle ?? ''}」`
  }
  return item.donationKind === 'money' ? '爱心捐款' : '物资捐献'
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1)
    return '刚刚'
  if (min < 60)
    return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24)
    return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30)
    return `${d} 天前`
  return new Date(iso).toLocaleDateString()
}

async function loadFeed(reset = false) {
  if (feedLoading.value)
    return
  if (reset) {
    feedPage.value = 1
    feed.value = []
  }
  feedLoading.value = true
  try {
    const res = await getPointsFeed(feedPage.value)
    feed.value = reset ? res.data : [...feed.value, ...res.data]
    feedTotal.value = res.pagination.total
  }
  finally {
    feedLoading.value = false
  }
}

function moreRanks() {
  if (ranks.value.length < rankTotal.value) {
    rankPage.value += 1
    loadRanks()
  }
}
function moreFeed() {
  if (feed.value.length < feedTotal.value) {
    feedPage.value += 1
    loadFeed()
  }
}

onMounted(() => {
  loadOverview()
  loadRanks(true)
  loadFeed(true)
})
</script>

<template>
  <view class="min-h-screen bg-page px-3 pt-3 pb-6">
    <!-- 我的积分卡 -->
    <view class="rounded-3 bg-primary p-4 text-white shadow-sm">
      <text class="text-4 opacity-90">我的积分</text>
      <view class="mt-2 flex items-end">
        <text class="text-9 font-semibold">{{ overview.total }}</text>
        <text class="mb-1 ml-1 text-3.5 opacity-80">总分</text>
      </view>
      <view class="mt-3 flex text-3.5">
        <view class="flex-1">
          活动积分 <text class="font-semibold">{{ overview.activityPoints }}</text>
        </view>
        <view class="flex-1">
          捐献积分 <text class="font-semibold">{{ overview.donationPoints }}</text>
        </view>
      </view>
    </view>

    <!-- 榜单维度切换 -->
    <view class="mt-3 flex rounded-3 bg-card p-1 shadow-sm">
      <view
        v-for="t in tabs" :key="t.value"
        class="flex-1 rounded-2 py-2 text-center text-4"
        :class="dimension === t.value ? 'bg-primary text-white font-medium' : 'text-sub'"
        @click="switchTab(t.value)"
      >
        {{ t.label }}
      </view>
    </view>

    <!-- 前三名（纯样式奖牌，不用 emoji） -->
    <view v-if="ranks.length" class="mt-3 flex items-end justify-around rounded-3 bg-card py-4 shadow-sm">
      <template v-for="idx in [1, 0, 2]" :key="ranks[idx]?.userId ?? idx">
        <view v-if="ranks[idx]" class="flex flex-col items-center" :class="idx === 0 ? 'order-2' : idx === 1 ? 'order-1' : 'order-3'">
          <view class="relative">
            <image :src="avatar(ranks[idx]!.image)" class="rounded-full bg-hover" :class="idx === 0 ? 'h-16 w-16' : 'h-12 w-12'" />
            <view
              class="absolute -bottom-1 -left-1 h-5 min-w-5 center rounded-full border-2 border-card px-1 text-3 text-white font-semibold"
              :class="idx === 0 ? 'bg-primary' : 'bg-muted'"
            >
              {{ idx + 1 }}
            </view>
          </view>
          <text class="mt-1 max-w-24 truncate text-3.5 text-ink">{{ ranks[idx]!.name }}</text>
          <text class="text-4 font-semibold text-primary-soft-text">{{ scoreText(ranks[idx]!) }}</text>
        </view>
      </template>
    </view>

    <!-- 榜单列表 -->
    <view class="mt-3 overflow-hidden rounded-3 bg-card shadow-sm">
      <view
        v-for="row in ranks" :key="row.userId"
        class="flex items-center px-4 py-3"
        :class="[row.rank > 1 ? 'border-t border-line' : '', row.isMe ? 'bg-primary-soft' : '']"
      >
        <text class="w-8 text-4 text-muted">{{ row.rank }}</text>
        <image :src="avatar(row.image)" class="h-9 w-9 rounded-full bg-hover" />
        <text class="ml-3 flex-1 truncate text-4 text-ink">
          {{ row.name }}
          <text v-if="row.isMe" class="text-primary-soft-text ml-1 text-3">（我）</text>
        </text>
        <text class="text-4 font-semibold text-primary-soft-text">{{ scoreText(row) }}</text>
      </view>
      <view v-if="ranks.length < rankTotal" class="py-3 text-center text-3.5 text-muted" @click="moreRanks">
        {{ rankLoading ? '加载中…' : '加载更多' }}
      </view>
      <view v-else-if="!ranks.length" class="py-8 text-center text-4 text-muted">
        暂无积分记录
      </view>
    </view>

    <!-- 近期动态（捐献不显示金额/物资/备注） -->
    <view class="mt-4 rounded-3 bg-card shadow-sm">
      <view class="px-4 pt-3 text-4 text-ink font-medium">
        近期积分动态
      </view>
      <view
        v-for="item in feed" :key="item.id"
        class="flex items-center border-t border-line px-4 py-3"
      >
        <image :src="avatar(item.userImage)" class="h-9 w-9 rounded-full bg-hover" />
        <view class="ml-3 flex-1">
          <text class="text-4 text-ink">{{ item.userName }}</text>
          <text class="ml-1 text-3.5 text-muted">{{ feedText(item) }}</text>
          <view class="mt-0.5 text-3 text-muted">
            {{ timeAgo(item.createdAt) }}
          </view>
        </view>
        <text class="text-4 font-semibold text-primary-soft-text">+{{ item.points }}</text>
      </view>
      <view v-if="feed.length < feedTotal" class="py-3 text-center text-3.5 text-muted" @click="moreFeed">
        {{ feedLoading ? '加载中…' : '加载更多' }}
      </view>
      <view v-else-if="!feed.length" class="py-8 text-center text-4 text-muted">
        暂无动态
      </view>
    </view>
  </view>
</template>
```

注意：项目无 success 色 token（见 `src/style/themes.scss`），正向积分统一使用 `text-primary-soft-text`，负向使用 `text-danger`，不得硬编码色值。

- [ ] **Step 2: 创建我的明细页**

创建 `frontend/src/pages/points/ledger.vue`：

```vue
<script lang="ts" setup">
import { getMyLedger, type LedgerItem, type PointsCategory } from '@/api/points'

definePage({
  style: { navigationBarTitleText: '我的积分' },
})

const tabs: { label: string, value: PointsCategory | '' }[] = [
  { label: '全部', value: '' },
  { label: '活动', value: 'activity' },
  { label: '捐献', value: 'donation' },
]
const category = ref<PointsCategory | ''>('')
const rows = ref<LedgerItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const pageSize = 20

const sourceLabel: Record<string, string> = {
  checkin: '签到奖励',
  manual_activity: '活动补录',
  manual_donation: '捐献录入',
  reversal: '冲正',
}

function titleOf(item: LedgerItem) {
  if (item.activityTitle)
    return item.activityTitle
  if (item.donationKind === 'money')
    return '爱心捐款'
  if (item.donationKind === 'goods')
    return '物资捐献'
  return sourceLabel[item.source] ?? '积分变动'
}

async function load(reset = false) {
  if (loading.value)
    return
  if (reset) {
    page.value = 1
    rows.value = []
  }
  loading.value = true
  try {
    const res = await getMyLedger(page.value, category.value || undefined, pageSize)
    rows.value = reset ? res.data : [...rows.value, ...res.data]
    total.value = res.pagination.total
  }
  finally {
    loading.value = false
  }
}

function switchTab(c: PointsCategory | '') {
  if (category.value === c)
    return
  category.value = c
  load(true)
}

function more() {
  if (rows.value.length < total.value) {
    page.value += 1
    load()
  }
}

onMounted(() => load(true))
</script>

<template>
  <view class="min-h-screen bg-page px-3 pt-3 pb-6">
    <view class="flex rounded-3 bg-card p-1 shadow-sm">
      <view
        v-for="t in tabs" :key="t.value"
        class="flex-1 rounded-2 py-2 text-center text-4"
        :class="category === t.value ? 'bg-primary text-white font-medium' : 'text-sub'"
        @click="switchTab(t.value)"
      >
        {{ t.label }}
      </view>
    </view>

    <view class="mt-3 overflow-hidden rounded-3 bg-card shadow-sm">
      <view
        v-for="(item, i) in rows" :key="item.id"
        class="px-4 py-3" :class="i > 0 ? 'border-t border-line' : ''"
      >
        <view class="flex items-center">
          <text class="flex-1 text-4 text-ink">{{ titleOf(item) }}</text>
          <text class="text-4 font-semibold" :class="item.points < 0 ? 'text-danger' : 'text-primary-soft-text'">
            {{ item.points > 0 ? '+' : '' }}{{ item.points }}
          </text>
        </view>
        <view class="mt-1 flex items-center text-3 text-muted">
          <text>{{ sourceLabel[item.source] }}</text>
          <text class="ml-2">{{ new Date(item.createdAt).toLocaleString() }}</text>
        </view>
        <text v-if="item.note" class="mt-1 block text-3.5 text-sub">
          {{ item.note }}
        </text>
      </view>
      <view v-if="rows.length < total" class="py-3 text-center text-3.5 text-muted" @click="more">
        {{ loading ? '加载中…' : '加载更多' }}
      </view>
      <view v-else-if="!rows.length" class="py-8 text-center text-4 text-muted">
        暂无积分记录
      </view>
    </view>
  </view>
</template>
```

色值口径与排行榜页一致：正向 `text-primary-soft-text`、负向 `text-danger`（均为主题 token，浅/深 × 品牌自动跟随）。

- [ ] **Step 3: me.vue 加入口与积分摘要**

`src/pages/me/me.vue`：

1. script 顶部 import 区加：
```ts
import { getMyPoints, type PointsOverview } from '@/api/points'
```
2. `const loggingOut = ref(false)` 之后加：
```ts
const pointsOverview = ref<PointsOverview | null>(null)

async function loadPoints() {
  if (!auth.isLoggedIn)
    return
  try {
    pointsOverview.value = await getMyPoints()
  }
  catch {
    pointsOverview.value = null
  }
}
```
3. 菜单第一组（含「活动报名」的数组）中在「活动报名」项之后插入两项：
```ts
    { key: 'points-rank', label: '积分排行', icon: 'i-carbon-trophy', url: '/pages/points/index' },
    { key: 'points-ledger', label: '我的积分明细', icon: 'i-carbon-receipt', url: '/pages/points/ledger' },
```
4. 文件顶部图标扫描注释（`// i-carbon-calendar ...`）补上 `i-carbon-trophy` 与 `i-carbon-receipt`：
```ts
// i-carbon-calendar i-carbon-star i-carbon-notification i-carbon-trophy i-carbon-receipt
```
5. 资料卡 `<view class="flex items-center rounded-3 bg-card ...">...</view>` 之后插入积分摘要卡（仅登录可见，点击进明细）：
```vue
    <view
      v-if="auth.isLoggedIn"
      class="mt-3 flex items-center rounded-3 bg-card p-4 shadow-sm"
      hover-class="bg-hover"
      @click="uni.navigateTo({ url: '/pages/points/ledger' })"
    >
      <view class="flex-1">
        <text class="text-3.5 text-muted">我的积分</text>
        <view class="mt-1 text-6 font-semibold text-primary-soft-text">
          {{ pointsOverview?.total ?? 0 }}
        </view>
      </view>
      <view class="text-right text-3.5 text-muted">
        <view>活动 {{ pointsOverview?.activityPoints ?? 0 }}</view>
        <view class="mt-1">捐献 {{ pointsOverview?.donationPoints ?? 0 }}</view>
      </view>
      <view class="i-carbon-chevron-right ml-3 text-5 text-muted" />
    </view>
```
6. 在已有生命周期里触发加载：若页面没有 `onShow`，在 script 中加（auto-import 可用）：
```ts
onShow(() => {
  void loadPoints()
})
```

- [ ] **Step 4: 前端门禁**

Run: `cd frontend; bun run type-check; bun run lint; bun run test:run`
Expected: 全绿（若 type-check 报 TS2688 缺 async-component 类型，按 AGENTS.md §10 放占位文件）。

---

## Task 13: 全量门禁与端到端手工验收

**Files:** 无新增（验证任务）

- [ ] **Step 1: 后端全部门禁**

Run: `cd backend; bun run typecheck; bun run lint; bun run test`
Expected: 0 error / 0 problem / 全部测试 PASS。

- [ ] **Step 2: 前端全部门禁**

Run: `cd frontend; bun run type-check; bun run lint; bun run test:run`
Expected: 全绿。

- [ ] **Step 3: 端到端手工验收（两终端：后端 9999、前端 3333）**

按序执行并确认：

1. admin 后台创建/编辑一个活动，设「参与积分 = 10」；另建一个 0 分活动。
2. 普通用户 H5 报名 10 分活动 → 活动前 15 分钟内扫码/输码签到：
   - `/api/points/me` 返回 `activityPoints >= 10`；
   - 排行榜总榜/活动榜出现该用户；全站动态出现「参加活动「标题」 +10」，**无备注字段**；
   - 我的明细可见「签到奖励 +10」。
3. 同一用户对同活动再次签到、管理员再次补签：均幂等，积分**不重复增加**，`points_ledger` 中该 registration 只有一条积分行（SQL 核查）。
4. 0 分活动签到：成功签到但 `points_ledger` 无新增、积分不变。
5. admin 后台「积分管理」：
   - 录入一笔捐款（points=20，备注含金额）→ 用户捐献积分 +20；动态只显示「爱心捐款 +20」；本人明细可见金额备注；
   - 录入一笔物资积分；录入一笔活动补录（选活动、改积分值）；
   - 对其中一笔点「冲正」填原因 → 出现 -20 流水，排行榜净额回落；该原流水按钮变「已冲正」；冲正记录不可再冲正（尝试返回 422）。
6. 权限：未登录访问 `/api/points/leaderboard` 返回 401；普通用户 POST `/api/admin/points` 返回 403。
7. 限流：连续 11 次 POST `/api/admin/points` 返回 429（等约 65 秒恢复）。
8. 页面检查：排行榜浅/深主题下颜色均跟随主题变量；明细页、我的页积分卡无布局错乱；活动详情 0 分活动不显示积分提示。

- [ ] **Step 4: 交付总结**

汇总变更文件、迁移文件（`drizzle/000X_*.sql`）与验收结果；如用户要求提交，再按功能边界组织 commit。
