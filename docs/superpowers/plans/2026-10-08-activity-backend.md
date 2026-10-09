# 活动发布/报名/扫码签到 — 后端工程 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成活动业务的后端能力：两张数据表、`activity_admin` 角色、参与者/组织者/PC 后台全部 API、无状态滚动签到码，以及 Nuxt 管理后台的两页活动管理界面。

**Architecture:** Drizzle 两表（activity / activity_registration）+ 纯函数工具（滚动码 HMAC、Zod schema）+ 数据访问仓储（`repositories/activities.ts`）+ 业务服务（`utils/activity-service.ts`，抛统一 createApiError）+ 薄处理器。业务 API 挂 `/api/activities/**`（公开 GET 走方法级放行表，组织者接口用 `requireAnyRole`），PC 接口挂 `/api/admin/activities/**`（仅 admin）复用同一服务。

**Tech Stack:** Nuxt 4 / Nitro、Drizzle ORM 0.45（postgres.js）、Zod 4、Better Auth 1.7（Cookie 会话）、Vitest 5、Nuxt UI v4（后台页）、Bun 1.4.0。

**配套设计文档：** `docs/superpowers/specs/2026-10-08-activity-checkin-design.md`

**提交约定：** 仓库 AGENTS.md §11 规定不自动创建 commit。每个任务末的「检查点」步骤默认**只验证不提交**；仅当用户已明确要求提交时，才执行其中给出的 git 命令。

---

## 文件结构总览

**新建（后端 server）**

- `server/database/repositories/activities.ts` — 活动/报名数据访问（查询、统计、事务由 service 组合）
- `server/utils/checkin-code.ts` — 无状态滚动签到码纯函数
- `server/utils/checkin-code.test.ts` — 滚动码单测
- `server/utils/activity-service.ts` — 业务编排与统一错误（发布/编辑/取消/报名/取消报名/签到/补签/序列化）
- `server/schemas/activity.ts` — Zod 入参 schema 与时间关系纯函数
- `server/schemas/activity.test.ts` — schema/时间规则单测
- 处理器 17 个：
  - `server/api/activities/index.get.ts`、`index.post.ts`
  - `server/api/activities/[id].get.ts`、`[id].put.ts`
  - `server/api/activities/[id]/cancel.post.ts`、`register.post.ts`、`cancel-registration.post.ts`、`check-in.post.ts`、`check-in-code.get.ts`、`registrations.get.ts`、`manual-check-in.post.ts`
  - `server/api/activities/mine/registrations.get.ts`
  - `server/api/admin/activities/index.get.ts`、`[id].get.ts`、`[id]/cancel.post.ts`、`[id]/registrations.get.ts`、`[id]/manual-check-in.post.ts`
- 迁移产物：`drizzle/000X_*.sql`（生成并执行，不手改）

**修改（后端 server）**

- `server/database/schema.ts` — 两张新表 + 状态常量 + ActivityLocation 类型
- `server/database/seed.ts` — ROLES 增加 activity_admin
- `server/utils/auth.ts` — ACTIVITY_ADMIN_ROLE / ACTIVITY_ORGANIZER_ROLES 常量
- `server/utils/auth-context.ts` — requireAnyRole
- `server/utils/path.ts` + `path.test.ts` — isPublicRequest 方法级公开表
- `server/middleware/20.auth.ts` — 改用 isPublicRequest
- `server/middleware/10.rate-limit.ts` — 四个活动敏感端点
- `server/api/admin/users/[id].delete.ts` — restrict FK 违反 → 409

**新建/修改（Nuxt 管理后台）**

- 新建 `app/pages/admin/activities/index.vue`、`app/pages/admin/activities/[id].vue`
- 修改 `app/layouts/default.vue` — 侧边栏「活动管理」入口

**任务顺序：** 1 → 9 严格顺序（后者依赖前者的类型与函数）。所有命令在 `backend/` 目录执行，PowerShell 用 `;` 串联。

---

## Task 1: 数据模型、迁移与种子角色

**Files:**
- Modify: `server/database/schema.ts`
- Modify: `server/database/seed.ts`
- Generate: `drizzle/000X_*.sql`

- [ ] **Step 1: 在 schema.ts 追加两张表与常量**

在 `server/database/schema.ts` 顶部 import 中补充 `unique`，并在文件末尾「Better Auth 四张表」导出语句**之前**追加：

```ts
// ===== 活动业务 =====

export const ACTIVITY_STATUSES = ['published', 'cancelled'] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export const REGISTRATION_STATUSES = ['registered', 'cancelled', 'checked_in'] as const
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number]

export const CHECK_IN_METHODS = ['scan', 'manual'] as const
export type CheckInMethod = (typeof CHECK_IN_METHODS)[number]

/** 活动标准化位置（GCJ-02 经纬度；手动降级时经纬度为 null）。 */
export interface ActivityLocation {
  name: string
  address: string
  latitude: number | null
  longitude: number | null
}

export const activity = pgTable('activity', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  coverUrl: text('cover_url'),
  location: jsonb('location').$type<ActivityLocation>().notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  registerDeadline: timestamp('register_deadline', { withTimezone: true }),
  capacity: integer('capacity'),
  status: text('status').notNull().default('published'),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
})

export const activityRegistration = pgTable(
  'activity_registration',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    activityId: text('activity_id')
      .notNull()
      .references(() => activity.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('registered'),
    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkInMethod: text('check_in_method'),
    checkedInBy: text('checked_in_by').references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true })
  },
  t => [unique('activity_registration_activity_user_unique').on(t.activityId, t.userId)]
)
```

同时把顶部 import 改为：

```ts
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique
} from 'drizzle-orm/pg-core'
```

- [ ] **Step 2: 种子角色追加 activity_admin**

修改 `server/database/seed.ts` 的 ROLES 常量：

```ts
const ROLES = [
  { name: 'admin', description: '管理员' },
  { name: 'activity_admin', description: '活动管理员' },
  { name: 'user', description: '普通用户' }
] as const
```

- [ ] **Step 3: 生成迁移并检查 SQL**

Run:

```powershell
bun run db:generate
```

Expected: `drizzle/` 下新增一个 `000X_*.sql`，内容包含 `create table "activity"` 与 `create table "activity_registration"`，含唯一索引 `activity_registration_activity_user_unique`；外键引用 `"user" [id]`（on delete restrict/cascade 各就其位）。若生成内容包含意外表，停止并核对 schema 改动。

- [ ] **Step 4: 执行迁移与种子**

前置：本地 postgres 容器运行中、`backend/.env` 已配置。

Run:

```powershell
bun run db:migrate; bun run db:seed
```

Expected: 迁移成功；种子输出含 `已创建角色：activity_admin（活动管理员）`（首次）或无报错（已存在）。

- [ ] **Step 5: 检查点（typecheck）**

Run: `bun run typecheck`
Expected: 0 error。

Git（仅当用户已明确要求提交）：

```bash
git add backend/server/database/schema.ts backend/server/database/seed.ts backend/drizzle
git commit -m "feat(backend): activity tables and activity_admin role"
```

---

## Task 2: 授权常量、方法级公开路径与限流

**Files:**
- Modify: `server/utils/auth.ts`
- Modify: `server/utils/auth-context.ts`
- Modify: `server/utils/path.ts`
- Test: `server/utils/path.test.ts`
- Modify: `server/middleware/20.auth.ts`
- Modify: `server/middleware/10.rate-limit.ts`

- [ ] **Step 1: auth.ts 增加角色常量**

在 `server/utils/auth.ts` 的 `export const DEFAULT_USER_ROLE = 'user'` 下一行追加：

```ts
/** 活动组织者角色：activity_admin 或 admin 均可组织活动。 */
export const ACTIVITY_ADMIN_ROLE = 'activity_admin'
export const ACTIVITY_ORGANIZER_ROLES = [ADMIN_ROLE, ACTIVITY_ADMIN_ROLE]
```

- [ ] **Step 2: auth-context.ts 增加 requireAnyRole**

在 `server/utils/auth-context.ts` 末尾追加：

```ts
/**
 * 要求当前用户具备给定角色中的任意一个，否则 403。
 * 用于非 /api/admin 前缀的业务授权（如活动组织者接口）。
 */
export function requireAnyRole(
  event: Parameters<typeof requireUser>[0],
  roles: string[]
): SessionUser {
  const userRow = requireUser(event)
  const owned = getRoleNames(event)
  if (!roles.some(name => owned.includes(name))) throw createApiError('FORBIDDEN')
  return userRow
}
```

- [ ] **Step 3: 先写 isPublicRequest 失败测试**

在 `server/utils/path.test.ts` 顶部 import 改为：

```ts
import { isPublicPath, isPublicRequest } from './path'
```

文件末尾追加：

```ts
describe('isPublicRequest', () => {
  it('allows guest GET on activity collection and detail', () => {
    expect(isPublicRequest('/api/activities', 'GET')).toBe(true)
    expect(isPublicRequest('/api/activities/550e8400-e29b-41d4-a716-446655440000', 'GET')).toBe(true)
  })

  it('keeps deeper activity paths authenticated even for GET', () => {
    expect(isPublicRequest('/api/activities/mine/registrations', 'GET')).toBe(false)
    expect(isPublicRequest('/api/activities/x/registrations', 'GET')).toBe(false)
    expect(isPublicRequest('/api/activities/x/check-in-code', 'GET')).toBe(false)
  })

  it('keeps activity write methods authenticated', () => {
    expect(isPublicRequest('/api/activities', 'POST')).toBe(false)
    expect(isPublicRequest('/api/activities/x', 'PUT')).toBe(false)
    expect(isPublicRequest('/api/activities/x/register', 'POST')).toBe(false)
  })

  it('still honors prefix-based public paths for any method', () => {
    expect(isPublicRequest('/api/health', 'GET')).toBe(true)
    expect(isPublicRequest('/api/auth/sign-in/email', 'POST')).toBe(true)
  })
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `bunx vitest run server/utils/path.test.ts`
Expected: FAIL（`isPublicRequest is not a function` / 导入不存在）。

- [ ] **Step 5: 实现 isPublicRequest**

在 `server/utils/path.ts` 末尾追加（不改动既有 isPublicPath）：

```ts
/**
 * 方法 + 路径 级别的公开放行。
 * 活动列表/详情对游客可读，但写方法与深层路径（mine、registrations 等）仍须登录。
 * 详情规则只匹配单段 id，避免裸前缀误伤深层路径。
 */
const PUBLIC_GET_PATTERNS = [
  /^\/api\/activities$/,
  /^\/api\/activities\/[^/]+$/
]

export function isPublicRequest(pathname: string, method: string): boolean {
  if (isPublicPath(pathname)) return true
  if (method.toUpperCase() === 'GET') {
    return PUBLIC_GET_PATTERNS.some(re => re.test(pathname))
  }
  return false
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `bunx vitest run server/utils/path.test.ts`
Expected: PASS（既有 isPublicPath 用例 + 新增 isPublicRequest 用例全绿）。

- [ ] **Step 7: 认证中间件改用 isPublicRequest**

修改 `server/middleware/20.auth.ts`：

- import 行 `import { isPublicPath } from '../utils/path'` 改为 `import { isPublicRequest } from '../utils/path'`
- 判断行 `if (isPublicPath(pathname)) {` 改为 `if (isPublicRequest(pathname, event.method)) {`

- [ ] **Step 8: 限流追加四个活动端点**

在 `server/middleware/10.rate-limit.ts` 的 `isSensitiveEndpoint` 内，`|| (pathname === '/api/admin/users' && method === 'POST')` 之后追加：

```ts
    || (method === 'POST'
      && /^\/api\/activities\/[^/]+\/(register|check-in|manual-check-in)$/.test(pathname))
    || (method === 'GET' && /^\/api\/activities\/[^/]+\/check-in-code$/.test(pathname))
```

- [ ] **Step 9: 检查点**

Run: `bun run typecheck; bunx vitest run`
Expected: 0 type error；全部单测通过。

Git（仅当用户已明确要求提交）：

```bash
git add backend/server/utils/auth.ts backend/server/utils/auth-context.ts backend/server/utils/path.ts backend/server/utils/path.test.ts backend/server/middleware/20.auth.ts backend/server/middleware/10.rate-limit.ts
git commit -m "feat(backend): organizer roles, method-aware public paths, activity rate limits"
```

---

## Task 3: 滚动签到码纯函数（TDD）

**Files:**
- Create: `server/utils/checkin-code.ts`
- Test: `server/utils/checkin-code.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `server/utils/checkin-code.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { codeForWindow, getCheckinWindow, getCurrentCheckinCode, verifyCheckinCode } from './checkin-code'

const SECRET = 'test-secret-at-least-32-characters-long!!'
const AID_A = 'activity-aaaaaaaa'
const AID_B = 'activity-bbbbbbbb'
const T0 = Date.UTC(2026, 9, 8, 10, 0, 0) // 恰好整分钟

describe('checkin-code', () => {
  it('derives 60s windows', () => {
    expect(getCheckinWindow(T0)).toBe(getCheckinWindow(T0 + 59_999))
    expect(getCheckinWindow(T0 + 60_000)).toBe(getCheckinWindow(T0) + 1)
  })

  it('always yields a 6 digit zero-padded code', () => {
    expect(codeForWindow(AID_A, getCheckinWindow(T0), SECRET)).toMatch(/^\d{6}$/)
  })

  it('is deterministic for the same activity and window', () => {
    const w = getCheckinWindow(T0)
    expect(codeForWindow(AID_A, w, SECRET)).toBe(codeForWindow(AID_A, w, SECRET))
  })

  it('codes are not interchangeable across activities', () => {
    const w = getCheckinWindow(T0)
    expect(codeForWindow(AID_A, w, SECRET)).not.toBe(codeForWindow(AID_B, w, SECRET))
  })

  it('accepts the current window code', () => {
    const code = codeForWindow(AID_A, getCheckinWindow(T0 + 30_000), SECRET)
    expect(verifyCheckinCode(AID_A, code, new Date(T0 + 30_000), SECRET)).toBe(true)
  })

  it('accepts the previous window code (clock/operation tolerance)', () => {
    const prev = codeForWindow(AID_A, getCheckinWindow(T0), SECRET)
    expect(verifyCheckinCode(AID_A, prev, new Date(T0 + 5_000), SECRET)).toBe(true)
  })

  it('rejects codes older than the previous window', () => {
    const old = codeForWindow(AID_A, getCheckinWindow(T0) - 1, SECRET)
    expect(verifyCheckinCode(AID_A, old, new Date(T0 + 5_000), SECRET)).toBe(false)
  })

  it('rejects malformed codes and foreign activity codes', () => {
    expect(verifyCheckinCode(AID_A, 'abcdef', new Date(T0), SECRET)).toBe(false)
    expect(verifyCheckinCode(AID_A, '12345', new Date(T0), SECRET)).toBe(false)
    const foreign = codeForWindow(AID_B, getCheckinWindow(T0), SECRET)
    expect(verifyCheckinCode(AID_A, foreign, new Date(T0), SECRET)).toBe(false)
  })

  it('exposes expiresAt as the start of the next window', () => {
    const { expiresAt } = getCurrentCheckinCode(AID_A, new Date(T0 + 12_345), SECRET)
    expect(expiresAt.getTime()).toBe(T0 + 60_000)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bunx vitest run server/utils/checkin-code.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `server/utils/checkin-code.ts`：

```ts
import { createHmac } from 'node:crypto'
import { getEnv } from './env'

/** 滚动码窗口长度（毫秒）。 */
export const CHECKIN_WINDOW_MS = 60_000
const CODE_MOD = 1_000_000

/** 当前时间所属窗口序号。 */
export function getCheckinWindow(nowMs: number): number {
  return Math.floor(nowMs / CHECKIN_WINDOW_MS)
}

/**
 * 计算某活动在某窗口的 6 位码（HOTP 式截断，避免直接截 hex 的数值偏斜）。
 * secret 仅测试时显式注入；运行时取 BETTER_AUTH_SECRET。
 */
export function codeForWindow(
  activityId: string,
  window: number,
  secret: string = getEnv().BETTER_AUTH_SECRET
): string {
  const digest = createHmac('sha256', secret)
    .update(`activity-checkin:${activityId}:${window}`)
    .digest()
  const num = digest.readUInt32BE(0)
  return String(num % CODE_MOD).padStart(6, '0')
}

/** 当前窗口码与该窗口到期时间（下一窗口起点）。 */
export function getCurrentCheckinCode(
  activityId: string,
  now: Date = new Date(),
  secret?: string
): { code: string, expiresAt: Date } {
  const w = getCheckinWindow(now.getTime())
  const code = secret ? codeForWindow(activityId, w, secret) : codeForWindow(activityId, w)
  return { code, expiresAt: new Date((w + 1) * CHECKIN_WINDOW_MS) }
}

/**
 * 校验签到码：接受当前窗口与上一窗口（容忍 ≤ ~2 分钟时钟差/出示延迟）。
 */
export function verifyCheckinCode(
  activityId: string,
  code: string,
  now: Date = new Date(),
  secret?: string
): boolean {
  if (!/^\d{6}$/.test(code)) return false
  const w = getCheckinWindow(now.getTime())
  const calc = (win: number) =>
    secret ? codeForWindow(activityId, win, secret) : codeForWindow(activityId, win)
  return calc(w) === code || calc(w - 1) === code
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bunx vitest run server/utils/checkin-code.test.ts`
Expected: PASS（9 个用例）。

- [ ] **Step 5: 检查点**

Run: `bun run typecheck; bun run lint`
Expected: 0 error / 0 problem。

Git（仅当用户已明确要求提交）：

```bash
git add backend/server/utils/checkin-code.ts backend/server/utils/checkin-code.test.ts
git commit -m "feat(backend): stateless rolling check-in code util"
```

---

## Task 4: 活动 Zod schema 与时间规则（TDD）

**Files:**
- Create: `server/schemas/activity.ts`
- Test: `server/schemas/activity.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `server/schemas/activity.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  activityCreateBodySchema,
  activityListQuerySchema,
  activityLocationSchema,
  checkInBodySchema,
  collectTimeIssues,
  manualCheckInBodySchema
} from './activity'

const loc = { name: '中山公园', address: '厦门市思明区公园南路', latitude: 24.4776, longitude: 118.0894 }
const baseBody = {
  title: '秋日助学走访',
  description: '走访困境学生家庭',
  location: loc,
  startTime: '2026-11-01T09:00:00+08:00',
  endTime: '2026-11-01T12:00:00+08:00',
  registerDeadline: '2026-10-31T18:00:00+08:00',
  capacity: 30
}

describe('activityLocationSchema', () => {
  it('accepts a full location', () => {
    expect(activityLocationSchema.parse(loc)).toEqual(loc)
  })

  it('defaults missing coordinates to null (manual address fallback)', () => {
    const parsed = activityLocationSchema.parse({ name: '村委会', address: '某村' })
    expect(parsed.latitude).toBeNull()
    expect(parsed.longitude).toBeNull()
  })

  it('rejects when only one coordinate is present', () => {
    expect(activityLocationSchema.safeParse({ ...loc, longitude: null }).success).toBe(false)
  })

  it('rejects blank name/address and out-of-range coordinates', () => {
    expect(activityLocationSchema.safeParse({ name: ' ', address: 'a' }).success).toBe(false)
    expect(activityLocationSchema.safeParse({ ...loc, latitude: 90 }).success).toBe(false)
    expect(activityLocationSchema.safeParse({ ...loc, longitude: 200 }).success).toBe(false)
  })
})

describe('activityCreateBodySchema', () => {
  it('accepts a valid body', () => {
    const parsed = activityCreateBodySchema.parse(baseBody)
    expect(parsed.startTime).toBeInstanceOf(Date)
    expect(parsed.description).toBe('走访困境学生家庭')
  })

  it('defaults description and allows null deadline/capacity', () => {
    const parsed = activityCreateBodySchema.parse({
      title: '小型茶话会',
      location: loc,
      startTime: baseBody.startTime,
      endTime: baseBody.endTime,
      registerDeadline: null,
      capacity: null
    })
    expect(parsed.description).toBe('')
    expect(parsed.registerDeadline).toBeNull()
    expect(parsed.capacity).toBeNull()
  })

  it('rejects end <= start and deadline after start', () => {
    expect(activityCreateBodySchema.safeParse({ ...baseBody, endTime: baseBody.startTime }).success).toBe(false)
    expect(
      activityCreateBodySchema.safeParse({ ...baseBody, registerDeadline: '2026-11-02T00:00:00+08:00' }).success
    ).toBe(false)
  })

  it('rejects bad title length and non-positive capacity', () => {
    expect(activityCreateBodySchema.safeParse({ ...baseBody, title: 'x' }).success).toBe(false)
    expect(activityCreateBodySchema.safeParse({ ...baseBody, capacity: 0 }).success).toBe(false)
  })

  it('rejects unknown keys', () => {
    expect(activityCreateBodySchema.safeParse({ ...baseBody, hacker: 1 }).success).toBe(false)
  })
})

describe('collectTimeIssues', () => {
  const start = new Date('2026-11-01T09:00:00+08:00')
  const end = new Date('2026-11-01T12:00:00+08:00')
  it('returns no issues for valid times', () => {
    expect(collectTimeIssues({ startTime: start, endTime: end, registerDeadline: null })).toEqual([])
  })
  it('flags endTime and deadline paths', () => {
    const issues = collectTimeIssues({
      startTime: start,
      endTime: start,
      registerDeadline: new Date('2026-11-01T10:00:00+08:00')
    })
    expect(issues.map(i => i.path)).toEqual(['endTime', 'registerDeadline'])
  })
})

describe('other activity schemas', () => {
  it('checkInBodySchema only accepts 6 digits', () => {
    expect(checkInBodySchema.safeParse({ code: '042137' }).success).toBe(true)
    expect(checkInBodySchema.safeParse({ code: '42137' }).success).toBe(false)
    expect(checkInBodySchema.safeParse({ code: 'abcdef' }).success).toBe(false)
  })

  it('manualCheckInBodySchema requires a user id', () => {
    expect(manualCheckInBodySchema.safeParse({ userId: 'u1' }).success).toBe(true)
    expect(manualCheckInBodySchema.safeParse({}).success).toBe(false)
  })

  it('activityListQuerySchema defaults state and coerces page', () => {
    const q = activityListQuerySchema.parse({ page: '2', pageSize: '10' })
    expect(q.state).toBe('active')
    expect(q.page).toBe(2)
    expect(activityListQuerySchema.parse({ state: 'past' }).state).toBe('past')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bunx vitest run server/schemas/activity.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 schema**

创建 `server/schemas/activity.ts`：

```ts
import { z } from 'zod'
import { keywordQuerySchema, pageQuerySchema } from '../utils/pagination'

export interface TimeIssue {
  path: 'startTime' | 'endTime' | 'registerDeadline'
  message: string
}

/** 合并后的时间关系校验（创建与“编辑时从库中补齐缺省值”共用）。 */
export function collectTimeIssues(input: {
  startTime: Date
  endTime: Date
  registerDeadline: Date | null
}): TimeIssue[] {
  const issues: TimeIssue[] = []
  if (input.endTime <= input.startTime) {
    issues.push({ path: 'endTime', message: '结束时间必须晚于开始时间' })
  }
  if (input.registerDeadline && input.registerDeadline > input.startTime) {
    issues.push({ path: 'registerDeadline', message: '报名截止时间不能晚于活动开始时间' })
  }
  return issues
}

/** ISO 字符串 → Date（非法值在 transform 阶段发 issue）。 */
const isoDate = z.string().trim().min(1).transform((value, ctx) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '时间格式不正确' })
    return z.NEVER
  }
  return d
})

export const activityLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().min(1).max(200),
    latitude: z.number().gt(0).lte(72).nullable().default(null),
    longitude: z.number().gt(60).lte(140).nullable().default(null)
  })
  .strict()
  .superRefine((data, ctx) => {
    if ((data.latitude === null) !== (data.longitude === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latitude'],
        message: '经纬度必须同时提供或同时为空'
      })
    }
  })

export const activityCreateBodySchema = z
  .object({
    title: z.string().trim().min(2).max(50),
    description: z.string().max(2000).default(''),
    coverUrl: z.string().url().max(500).nullable().optional(),
    location: activityLocationSchema,
    startTime: isoDate,
    endTime: isoDate,
    registerDeadline: isoDate.nullable().optional(),
    capacity: z.number().int().min(1).max(99999).nullable().optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    for (const issue of collectTimeIssues({
      startTime: data.startTime,
      endTime: data.endTime,
      registerDeadline: data.registerDeadline ?? null
    })) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message })
    }
  })

export const activityUpdateBodySchema = z
  .object({
    title: z.string().trim().min(2).max(50).optional(),
    description: z.string().max(2000).optional(),
    coverUrl: z.string().url().max(500).nullable().optional(),
    location: activityLocationSchema.optional(),
    startTime: isoDate.optional(),
    endTime: isoDate.optional(),
    registerDeadline: isoDate.nullable().optional(),
    capacity: z.number().int().min(1).max(99999).nullable().optional()
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, { message: '至少提供一个待更新字段' })

export type ActivityCreateBody = z.infer<typeof activityCreateBodySchema>
export type ActivityUpdateBody = z.infer<typeof activityUpdateBodySchema>

export const activityListQuerySchema = pageQuerySchema.merge(keywordQuerySchema).extend({
  state: z.enum(['active', 'past', 'cancelled']).default('active')
})

export const activityIdParamSchema = z.object({
  id: z.string().uuid()
})

export const checkInBodySchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, '请输入 6 位数字签到码')
  })
  .strict()

export const manualCheckInBodySchema = z
  .object({
    userId: z.string().min(1).max(64)
  })
  .strict()
```

- [ ] **Step 4: 运行确认通过**

Run: `bunx vitest run server/schemas/activity.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 检查点**

Run: `bun run typecheck; bun run lint`
Expected: 0 error / 0 problem。

Git（仅当用户已明确要求提交）：

```bash
git add backend/server/schemas/activity.ts backend/server/schemas/activity.test.ts
git commit -m "feat(backend): activity zod schemas and time relation rules"
```

---

## Task 5: 活动数据访问仓储

**Files:**
- Create: `server/database/repositories/activities.ts`

- [ ] **Step 1: 实现仓储（完整文件）**

```ts
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import { db } from '../client'
import {
  activity as activityTable,
  activityRegistration as registrationTable,
  user as userTable,
  type activity,
  type activityRegistration,
  type ActivityLocation,
  type ActivityStatus
} from '../schema'

export type ActivityRow = typeof activity.$inferSelect
export type NewActivityRow = typeof activity.$inferInsert
export type RegistrationRow = typeof activityRegistration.$inferSelect
export type ActivityStateFilter = 'active' | 'past' | 'cancelled'

export interface ActivityListParams {
  state: ActivityStateFilter
  keyword?: string
  limit: number
  offset: number
  now: Date
}

export interface NewActivityInput {
  title: string
  description: string
  coverUrl: string | null
  location: ActivityLocation
  startTime: Date
  endTime: Date
  registerDeadline: Date | null
  capacity: number | null
  createdBy: string
}

export interface RegistrationWithUser extends RegistrationRow {
  userName: string
  userPhone: string | null
  userImage: string | null
}

export interface MyRegistrationItem {
  registration: RegistrationRow
  activity: ActivityRow
}

export interface ActivityStat {
  registeredCount: number
  checkedInCount: number
}

const EMPTY_STAT: ActivityStat = { registeredCount: 0, checkedInCount: 0 }

function keywordFilter(keyword?: string): SQL | undefined {
  const kw = keyword?.trim()
  if (!kw) return undefined
  const pattern = `%${kw.replace(/[\\%_]/g, m => `\\${m}`)}%`
  return or(
    ilike(activityTable.title, pattern),
    sql`${activityTable.location}->>'name' ILIKE ${pattern}`
  )
}

function stateWhere(state: ActivityStateFilter, now: Date): SQL {
  if (state === 'active') {
    return and(eq(activityTable.status, 'published'), gte(activityTable.endTime, now))
  }
  if (state === 'past') {
    return and(eq(activityTable.status, 'published'), lt(activityTable.endTime, now))
  }
  return eq(activityTable.status, 'cancelled')
}

export async function listActivities(
  params: ActivityListParams
): Promise<{ rows: ActivityRow[], total: number }> {
  const filters: (SQL | undefined)[] = [stateWhere(params.state, params.now), keywordFilter(params.keyword)]
  const where = and(...filters)
  const order = params.state === 'active' ? asc(activityTable.startTime) : desc(activityTable.startTime)

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(activityTable)
      .where(where)
      .orderBy(order)
      .limit(params.limit)
      .offset(params.offset),
    db.select({ value: count() }).from(activityTable).where(where)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

export async function getActivityById(id: string): Promise<ActivityRow | null> {
  const rows = await db.select().from(activityTable).where(eq(activityTable.id, id)).limit(1)
  return rows[0] ?? null
}

export async function insertActivity(input: NewActivityInput): Promise<ActivityRow> {
  const rows = await db
    .insert(activityTable)
    .values({
      title: input.title,
      description: input.description,
      coverUrl: input.coverUrl,
      location: input.location,
      startTime: input.startTime,
      endTime: input.endTime,
      registerDeadline: input.registerDeadline,
      capacity: input.capacity,
      status: 'published',
      createdBy: input.createdBy
    })
    .returning()
  return rows[0]!
}

export async function patchActivity(
  id: string,
  data: Partial<Omit<NewActivityRow, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>
): Promise<ActivityRow | null> {
  const rows = await db.update(activityTable).set(data).where(eq(activityTable.id, id)).returning()
  return rows[0] ?? null
}

export async function setActivityStatus(id: string, status: ActivityStatus): Promise<ActivityRow | null> {
  const rows = await db
    .update(activityTable)
    .set({ status })
    .where(eq(activityTable.id, id))
    .returning()
  return rows[0] ?? null
}

export async function getRegistration(
  activityId: string,
  userId: string
): Promise<RegistrationRow | null> {
  const rows = await db
    .select()
    .from(registrationTable)
    .where(
      and(eq(registrationTable.activityId, activityId), eq(registrationTable.userId, userId))
    )
    .limit(1)
  return rows[0] ?? null
}

export async function insertRegistration(activityId: string, userId: string): Promise<RegistrationRow> {
  const rows = await db
    .insert(registrationTable)
    .values({ activityId, userId, status: 'registered' })
    .returning()
  return rows[0]!
}

export async function reviveRegistration(id: string): Promise<RegistrationRow | null> {
  const rows = await db
    .update(registrationTable)
    .set({ status: 'registered', cancelledAt: null })
    .where(eq(registrationTable.id, id))
    .returning()
  return rows[0] ?? null
}

export async function setRegistrationCancelled(
  id: string,
  cancelledAt: Date
): Promise<RegistrationRow | null> {
  const rows = await db
    .update(registrationTable)
    .set({ status: 'cancelled', cancelledAt })
    .where(eq(registrationTable.id, id))
    .returning()
  return rows[0] ?? null
}

export async function setRegistrationCheckedIn(
  id: string,
  input: { checkInAt: Date, method: 'scan' | 'manual', checkedInBy: string | null }
): Promise<RegistrationRow | null> {
  const rows = await db
    .update(registrationTable)
    .set({
      status: 'checked_in',
      checkInAt: input.checkInAt,
      checkInMethod: input.method,
      checkedInBy: input.checkedInBy
    })
    .where(eq(registrationTable.id, id))
    .returning()
  return rows[0] ?? null
}

/**
 * 单活动报名统计（registeredCount 口径 = registered + checked_in）。
 */
export async function getActivityStat(activityId: string): Promise<ActivityStat> {
  const rows = await db
    .select({ status: registrationTable.status, value: count() })
    .from(registrationTable)
    .where(eq(registrationTable.activityId, activityId))
    .groupBy(registrationTable.status)

  let registeredCount = 0
  let checkedInCount = 0
  for (const row of rows) {
    if (row.status === 'registered' || row.status === 'checked_in') {
      registeredCount += Number(row.value)
    }
    if (row.status === 'checked_in') checkedInCount += Number(row.value)
  }
  return { registeredCount, checkedInCount }
}

/** 批量统计，避免列表 N+1。 */
export async function getActivityStatsMap(activityIds: string[]): Promise<Map<string, ActivityStat>> {
  const map = new Map<string, ActivityStat>()
  if (activityIds.length === 0) return map
  const rows = await db
    .select({
      activityId: registrationTable.activityId,
      status: registrationTable.status,
      value: count()
    })
    .from(registrationTable)
    .where(inArray(registrationTable.activityId, activityIds))
    .groupBy(registrationTable.activityId, registrationTable.status)

  for (const row of rows) {
    const stat = map.get(row.activityId) ?? { ...EMPTY_STAT }
    if (row.status === 'registered' || row.status === 'checked_in') {
      stat.registeredCount += Number(row.value)
    }
    if (row.status === 'checked_in') stat.checkedInCount += Number(row.value)
    map.set(row.activityId, stat)
  }
  return map
}

/** 报名/签到名单（含用户展示字段，仅组织者/管理员接口调用）。 */
export async function listRegistrationsWithUsers(
  activityId: string,
  limit: number,
  offset: number
): Promise<{ rows: RegistrationWithUser[], total: number }> {
  const where = eq(registrationTable.activityId, activityId)
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: registrationTable.id,
        activityId: registrationTable.activityId,
        userId: registrationTable.userId,
        status: registrationTable.status,
        checkInAt: registrationTable.checkInAt,
        checkInMethod: registrationTable.checkInMethod,
        checkedInBy: registrationTable.checkedInBy,
        createdAt: registrationTable.createdAt,
        cancelledAt: registrationTable.cancelledAt,
        userName: userTable.name,
        userPhone: userTable.phoneNumber,
        userImage: userTable.image
      })
      .from(registrationTable)
      .innerJoin(userTable, eq(registrationTable.userId, userTable.id))
      .where(where)
      .orderBy(desc(registrationTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(registrationTable).where(where)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

/** 我的报名（含活动行）。 */
export async function listMyRegistrations(
  userId: string,
  limit: number,
  offset: number
): Promise<{ rows: MyRegistrationItem[], total: number }> {
  const where = eq(registrationTable.userId, userId)
  const [rows, totalRows] = await Promise.all([
    db
      .select({ registration: registrationTable, activity: activityTable })
      .from(registrationTable)
      .innerJoin(activityTable, eq(registrationTable.activityId, activityTable.id))
      .where(where)
      .orderBy(desc(registrationTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(registrationTable).where(where)
  ])
  return {
    rows: rows.map(r => ({ registration: r.registration, activity: r.activity })),
    total: Number(totalRows[0]?.value ?? 0)
  }
}
```

- [ ] **Step 2: 检查点**

Run: `bun run typecheck; bun run lint`
Expected: 0 error / 0 problem（本步无单测，仓储在 Task 7 经 API 冒烟验证）。

Git（仅当用户已明确要求提交）：

```bash
git add backend/server/database/repositories/activities.ts
git commit -m "feat(backend): activity repository"
```

---

## Task 6: 活动业务服务层

**Files:**
- Create: `server/utils/activity-service.ts`

- [ ] **Step 1: 实现服务（完整文件）**

```ts
import { db } from '../database/client'
import {
  getActivityById,
  getActivityStat,
  getActivityStatsMap,
  getRegistration,
  insertActivity,
  insertRegistration,
  listActivities,
  listMyRegistrations,
  listRegistrationsWithUsers,
  patchActivity,
  reviveRegistration,
  setActivityStatus,
  setRegistrationCancelled,
  setRegistrationCheckedIn,
  type ActivityRow,
  type ActivityStateFilter,
  type RegistrationRow
} from '../database/repositories/activities'
import type { ActivityCreateBody, ActivityUpdateBody } from '../schemas/activity'
import { collectTimeIssues } from '../schemas/activity'
import { getCurrentCheckinCode, verifyCheckinCode } from './checkin-code'

/** 签到开放提前量：活动开始前 15 分钟。 */
const CHECKIN_LEAD_MS = 15 * 60_000

export type ActivityViewState = 'published' | 'cancelled' | 'ongoing' | 'upcoming' | 'ended'

function deriveState(activity: ActivityRow, now: Date): ActivityViewState {
  if (activity.status === 'cancelled') return 'cancelled'
  if (now < new Date(activity.startTime)) return 'upcoming'
  if (now > new Date(activity.endTime)) return 'ended'
  return 'ongoing'
}

function remaining(capacity: number | null, registeredCount: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - registeredCount)
}

function effectiveDeadline(activity: ActivityRow): Date {
  return activity.registerDeadline ? new Date(activity.registerDeadline) : new Date(activity.startTime)
}

function toActivityView(
  activity: ActivityRow,
  stat: { registeredCount: number, checkedInCount: number },
  now: Date,
  myRegistration: RegistrationRow | null
) {
  return {
    id: activity.id,
    title: activity.title,
    description: activity.description,
    coverUrl: activity.coverUrl,
    location: activity.location,
    startTime: activity.startTime,
    endTime: activity.endTime,
    registerDeadline: activity.registerDeadline,
    capacity: activity.capacity,
    status: activity.status,
    state: deriveState(activity, now),
    createdBy: activity.createdBy,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    registeredCount: stat.registeredCount,
    checkedInCount: stat.checkedInCount,
    remaining: remaining(activity.capacity, stat.registeredCount),
    myRegistration
  }
}

async function requireActivity(id: string): Promise<ActivityRow> {
  const activity = await getActivityById(id)
  if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })
  return activity
}

// ===== 查询 =====

export async function listActivityView(input: {
  state: ActivityStateFilter
  keyword?: string
  page: number
  pageSize: number
}) {
  const now = new Date()
  const { rows, total } = await listActivities({
    state: input.state,
    keyword: input.keyword,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
    now
  })
  const statsMap = await getActivityStatsMap(rows.map(r => r.id))
  const data = rows.map(a =>
    toActivityView(a, statsMap.get(a.id) ?? { registeredCount: 0, checkedInCount: 0 }, now, null)
  )
  return { data, total }
}

export async function getActivityDetail(
  id: string,
  viewerId: string | null,
  now: Date = new Date()
) {
  const activity = await requireActivity(id)
  const stat = await getActivityStat(id)
  const myRegistration = viewerId ? await getRegistration(id, viewerId) : null
  return toActivityView(activity, stat, now, myRegistration)
}

// ===== 组织者写操作 =====

export async function publishActivity(input: ActivityCreateBody, userId: string) {
  return insertActivity({
    title: input.title,
    description: input.description,
    coverUrl: input.coverUrl ?? null,
    location: input.location,
    startTime: input.startTime,
    endTime: input.endTime,
    registerDeadline: input.registerDeadline ?? null,
    capacity: input.capacity ?? null,
    createdBy: userId
  })
}

export async function editActivity(id: string, patch: ActivityUpdateBody) {
  const existing = await requireActivity(id)
  if (existing.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '活动已取消，不能编辑' })
  }

  // 缺省字段从库中补齐后统一校验时间关系
  const issues = collectTimeIssues({
    startTime: patch.startTime ?? new Date(existing.startTime),
    endTime: patch.endTime ?? new Date(existing.endTime),
    registerDeadline:
      patch.registerDeadline === undefined
        ? (existing.registerDeadline ? new Date(existing.registerDeadline) : null)
        : patch.registerDeadline
  })
  if (issues.length) {
    throw createApiError('VALIDATION_ERROR', {
      issues: issues.map(i => ({ path: i.path, message: i.message }))
    })
  }

  if (patch.capacity !== undefined && patch.capacity !== null) {
    const { registeredCount } = await getActivityStat(id)
    if (patch.capacity < registeredCount) {
      throw createApiError('CONFLICT', {
        message: `人数上限不能低于已报名人数（${registeredCount}）`
      })
    }
  }

  const updated = await patchActivity(id, {
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.description !== undefined && { description: patch.description }),
    ...(patch.coverUrl !== undefined && { coverUrl: patch.coverUrl }),
    ...(patch.location !== undefined && { location: patch.location }),
    ...(patch.startTime !== undefined && { startTime: patch.startTime }),
    ...(patch.endTime !== undefined && { endTime: patch.endTime }),
    ...(patch.registerDeadline !== undefined && { registerDeadline: patch.registerDeadline }),
    ...(patch.capacity !== undefined && { capacity: patch.capacity })
  })
  if (!updated) throw createApiError('NOT_FOUND', { message: '活动不存在' })
  return updated
}

export async function cancelActivity(id: string) {
  const existing = await requireActivity(id)
  if (existing.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '活动已取消' })
  }
  const updated = await setActivityStatus(id, 'cancelled')
  return updated!
}

export async function getOrganizerCheckInCode(id: string) {
  await requireActivity(id)
  const { code, expiresAt } = getCurrentCheckinCode(id)
  return { code, expiresAt: expiresAt.toISOString() }
}

export async function getRegistrationListView(id: string, page: number, pageSize: number) {
  await requireActivity(id)
  const [{ rows, total }, stat] = await Promise.all([
    listRegistrationsWithUsers(id, pageSize, (page - 1) * pageSize),
    getActivityStat(id)
  ])
  const activity = (await getActivityById(id))!
  return {
    rows,
    total,
    stats: {
      registeredCount: stat.registeredCount,
      checkedInCount: stat.checkedInCount,
      capacity: activity.capacity,
      remaining: remaining(activity.capacity, stat.registeredCount)
    }
  }
}

// ===== 参与者操作 =====

export async function registerToActivity(activityId: string, userId: string, now: Date = new Date()) {
  return db.transaction(async () => {
    const activity = await getActivityById(activityId)
    if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })
    if (activity.status === 'cancelled') {
      throw createApiError('CONFLICT', { message: '活动已取消，无法报名' })
    }
    if (now > effectiveDeadline(activity)) {
      throw createApiError('CONFLICT', { message: '报名已截止' })
    }

    const reg = await getRegistration(activityId, userId)
    if (reg) {
      if (reg.status === 'cancelled') {
        // 复活前重新校验容量
        if (activity.capacity !== null) {
          const { registeredCount } = await getActivityStat(activityId)
          if (registeredCount >= activity.capacity) {
            throw createApiError('CONFLICT', { message: '名额已满' })
          }
        }
        return (await reviveRegistration(reg.id))!
      }
      return reg // registered / checked_in 幂等
    }

    if (activity.capacity !== null) {
      const { registeredCount } = await getActivityStat(activityId)
      if (registeredCount >= activity.capacity) {
        throw createApiError('CONFLICT', { message: '名额已满' })
      }
    }
    return insertRegistration(activityId, userId)
  })
}

export async function cancelMyRegistration(
  activityId: string,
  userId: string,
  now: Date = new Date()
) {
  const activity = await getActivityById(activityId)
  if (!activity) throw createApiError('NOT_FOUND', { message: '活动不存在' })

  const reg = await getRegistration(activityId, userId)
  if (!reg) throw createApiError('NOT_FOUND', { message: '未找到报名记录' })
  if (reg.status === 'checked_in') {
    throw createApiError('CONFLICT', { message: '已签到，无法取消报名' })
  }
  if (reg.status === 'cancelled') return reg // 幂等
  if (now >= new Date(activity.startTime)) {
    throw createApiError('CONFLICT', { message: '活动已开始，无法取消' })
  }
  return (await setRegistrationCancelled(reg.id, now))!
}

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
  if (reg.status === 'checked_in') return reg // 幂等

  const opensAt = new Date(new Date(activity.startTime).getTime() - CHECKIN_LEAD_MS)
  if (now < opensAt) throw createApiError('CONFLICT', { message: '签到尚未开始' })
  if (now > new Date(activity.endTime)) {
    throw createApiError('CONFLICT', { message: '活动已结束，签到已关闭' })
  }
  if (!verifyCheckinCode(activityId, code, now)) {
    throw createApiError('VALIDATION_ERROR', { message: '签到码无效或已过期' })
  }

  return (await setRegistrationCheckedIn(reg.id, {
    checkInAt: now,
    method: 'scan',
    checkedInBy: null
  }))!
}

export async function manualCheckIn(
  activityId: string,
  targetUserId: string,
  operatorId: string
) {
  await requireActivity(activityId)
  const reg = await getRegistration(activityId, targetUserId)
  if (!reg) throw createApiError('CONFLICT', { message: '该用户未报名此活动' })
  if (reg.status === 'checked_in') return reg // 幂等
  if (reg.status === 'cancelled') {
    throw createApiError('CONFLICT', { message: '该用户已取消报名' })
  }
  return (await setRegistrationCheckedIn(reg.id, {
    checkInAt: new Date(),
    method: 'manual',
    checkedInBy: operatorId
  }))!
}

export async function listMineView(userId: string, page: number, pageSize: number) {
  const { rows, total } = await listMyRegistrations(userId, pageSize, (page - 1) * pageSize)
  const now = new Date()
  const data = rows.map(({ registration, activity }) => ({
    registration,
    activity: toActivityView(
      activity,
      { registeredCount: 0, checkedInCount: 0 },
      now,
      registration
    )
  }))
  return { data, total }
}
```

说明：处理器依赖的 Nitro 自动导入在 `server/utils/*.ts` 普通模块中同样生效；为消除歧义，本文件顶部显式 `import { createApiError } from './errors'`（在 Step 1 代码开头、`import { db }` 之前补上这一行）。

- [ ] **Step 2: 检查点**

Run: `bun run typecheck; bun run lint`
Expected: 0 error / 0 problem。若 lint 提示未使用的导入（如 db），核对事务确实使用 `db.transaction`，勿删。

Git（仅当用户已明确要求提交）：

```bash
git add backend/server/utils/activity-service.ts
git commit -m "feat(backend): activity service layer"
```

---

## Task 7: 参与者 + 组织者 API 处理器

**Files:**
- Create: `server/api/activities/index.get.ts`
- Create: `server/api/activities/index.post.ts`
- Create: `server/api/activities/[id].get.ts`
- Create: `server/api/activities/[id].put.ts`
- Create: `server/api/activities/[id]/cancel.post.ts`
- Create: `server/api/activities/[id]/register.post.ts`
- Create: `server/api/activities/[id]/cancel-registration.post.ts`
- Create: `server/api/activities/[id]/check-in.post.ts`
- Create: `server/api/activities/[id]/check-in-code.get.ts`
- Create: `server/api/activities/[id]/registrations.get.ts`
- Create: `server/api/activities/[id]/manual-check-in.post.ts`
- Create: `server/api/activities/mine/registrations.get.ts`

处理器中 `defineEventHandler / ok / paginated / buildPaginationMeta / parseBody / parseQuery / parseParams / createApiError / requireUser / getAuthUser / requireAnyRole / ACTIVITY_ORGANIZER_ROLES` 与 service/schema 导出均由 Nitro 自动导入（与既有处理器风格一致，不写 import）。

- [ ] **Step 1: 列表（公开）** — `index.get.ts`

```ts
/** 活动分页列表（游客可读）。 */
export default defineEventHandler(async (event) => {
  const query = parseQuery(event, activityListQuerySchema)
  const { data, total } = await listActivityView({
    state: query.state,
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
```

- [ ] **Step 2: 发布（组织者）** — `index.post.ts`

```ts
/** 发布活动（activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  const organizer = requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const body = await parseBody(event, activityCreateBodySchema)
  const activity = await publishActivity(body, organizer.id)
  setResponseStatus(event, 201)
  return ok(activity, '活动发布成功')
})
```

- [ ] **Step 3: 详情（公开，登录附带 myRegistration）** — `[id].get.ts`

```ts
/** 活动详情（游客可读；登录时附带我的报名记录）。 */
export default defineEventHandler(async (event) => {
  const { id } = parseParams(event, activityIdParamSchema)
  const viewer = getAuthUser(event)
  const detail = await getActivityDetail(id, viewer?.id ?? null)
  return ok(detail)
})
```

- [ ] **Step 4: 编辑（组织者）** — `[id].put.ts`

```ts
/** 编辑活动（activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  const body = await parseBody(event, activityUpdateBodySchema)
  const activity = await editActivity(id, body)
  return ok(activity, '活动已更新')
})
```

- [ ] **Step 5: 取消活动** — `[id]/cancel.post.ts`

```ts
/** 取消活动（终态，activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  const activity = await cancelActivity(id)
  return ok(activity, '活动已取消')
})
```

- [ ] **Step 6: 报名** — `[id]/register.post.ts`

```ts
/** 报名活动（登录用户；满员/截止/取消 → 409，重复报名幂等）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const registration = await registerToActivity(id, user.id)
  setResponseStatus(event, 201)
  return ok(registration, '报名成功')
})
```

- [ ] **Step 7: 取消报名** — `[id]/cancel-registration.post.ts`

```ts
/** 取消报名（活动开始前；登录用户）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const registration = await cancelMyRegistration(id, user.id)
  return ok(registration, '已取消报名')
})
```

- [ ] **Step 8: 自助签到** — `[id]/check-in.post.ts`

```ts
/** 扫码/输码自助签到（登录用户）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const { code } = await parseBody(event, checkInBodySchema)
  const registration = await checkInToActivity(id, user.id, code)
  return ok(registration, '签到成功')
})
```

- [ ] **Step 9: 出示滚动码（组织者）** — `[id]/check-in-code.get.ts`

```ts
/** 获取当前窗口签到码（activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  return ok(await getOrganizerCheckInCode(id))
})
```

- [ ] **Step 10: 报名名单（组织者）** — `[id]/registrations.get.ts`

```ts
/** 活动报名/签到名单与统计（activity_admin 或 admin；含完整手机号）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  const query = parseQuery(event, pageQuerySchema)
  const { rows, total, stats } = await getRegistrationListView(id, query.page, query.pageSize)
  const envelope = paginated(
    rows,
    buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize })
  )
  return { ...envelope, stats }
})
```

注意：`pageQuerySchema` 已自动导入（server/utils/pagination 导出）。若 typecheck 不识别，在文件顶部补 `import { pageQuerySchema } from '../../../utils/pagination'`。

- [ ] **Step 11: 手动补签（组织者）** — `[id]/manual-check-in.post.ts`

```ts
/** 管理员现场手动补签（activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  const operator = requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  const { userId } = await parseBody(event, manualCheckInBodySchema)
  const registration = await manualCheckIn(id, userId, operator.id)
  return ok(registration, '补签成功')
})
```

- [ ] **Step 12: 我的报名** — `mine/registrations.get.ts`

```ts
/** 我的报名列表（登录用户）。 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const query = parseQuery(event, pageQuerySchema)
  const { data, total } = await listMineView(user.id, query.page, query.pageSize)
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
```

若该文件 typecheck 不识别 `pageQuerySchema`，同 Step 10 补显式 import（路径 `../../../utils/pagination`）。

- [ ] **Step 13: typecheck/lint 与公开接口冒烟**

Run: `bun run typecheck; bun run lint`
Expected: 0 error / 0 problem。

启动服务（另开终端）：`bun run dev`，然后冒烟（不需要登录的两个 GET）：

```powershell
bun -e "const r = await fetch('http://localhost:9999/api/activities'); console.log(r.status, await r.text())"
```

Expected: 200，输出含 `"code":"OK"`、`"data":[]` 与 pagination（无数据时为空数组）。

未登录访问写接口：

```powershell
bun -e "const r = await fetch('http://localhost:9999/api/activities/x/register',{method:'POST'}); console.log(r.status)"
```

Expected: 401。

- [ ] **Step 14: 检查点**

停止 dev server（或保留供 Task 8 继续）。

Git（仅当用户已明确要求提交）：

```bash
git add backend/server/api/activities
git commit -m "feat(backend): participant and organizer activity APIs"
```

---

## Task 8: PC admin 薄 API + 删用户 FK 守卫

**Files:**
- Create: `server/api/admin/activities/index.get.ts`
- Create: `server/api/admin/activities/[id].get.ts`
- Create: `server/api/admin/activities/[id]/cancel.post.ts`
- Create: `server/api/admin/activities/[id]/registrations.get.ts`
- Create: `server/api/admin/activities/[id]/manual-check-in.post.ts`
- Modify: `server/api/admin/users/[id].delete.ts`

`/api/admin/**` 已被认证中间件限定 admin 角色，处理器内仍调用 `requireAdmin` 与既有风格保持一致；复用 Task 6 的同一批 service 函数。

- [ ] **Step 1: admin 活动列表** — `admin/activities/index.get.ts`

```ts
/** 活动分页列表（admin 后台）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const query = parseQuery(event, activityListQuerySchema)
  const { data, total } = await listActivityView({
    state: query.state,
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
```

- [ ] **Step 2: admin 活动详情** — `admin/activities/[id].get.ts`

```ts
/** 活动详情（admin 后台）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const { id } = parseParams(event, activityIdParamSchema)
  return ok(await getActivityDetail(id, null))
})
```

- [ ] **Step 3: admin 取消活动** — `admin/activities/[id]/cancel.post.ts`

```ts
/** 取消活动（admin 后台）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const { id } = parseParams(event, activityIdParamSchema)
  return ok(await cancelActivity(id), '活动已取消')
})
```

- [ ] **Step 4: admin 名单** — `admin/activities/[id]/registrations.get.ts`

```ts
/** 活动报名/签到名单与统计（admin 后台）。 */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const query = parseQuery(event, pageQuerySchema)
  const { rows, total, stats } = await getRegistrationListView(id, query.page, query.pageSize)
  const envelope = paginated(
    rows,
    buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize })
  )
  return { ...envelope, stats }
})
```

- [ ] **Step 5: admin 补签** — `admin/activities/[id]/manual-check-in.post.ts`

```ts
/** 手动补签（admin 后台）。 */
export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const { id } = parseParams(event, activityIdParamSchema)
  const { userId } = await parseBody(event, manualCheckInBodySchema)
  return ok(await manualCheckIn(id, userId, admin.id), '补签成功')
})
```

- [ ] **Step 6: 删用户捕获 restrict FK 违反**

把 `server/api/admin/users/[id].delete.ts` 中的 `await deleteUserById(id)` 替换为带捕获的版本，完整文件：

```ts
import { deleteUserById, getUserById } from '../../../database/repositories/users'
import { userIdParamSchema } from '../../../schemas/users'

/** 删除用户（admin，含自我保护：不能删除自己）。 */
export default defineEventHandler(async (event) => {
  const current = requireAdmin(event)
  const { id } = parseParams(event, userIdParamSchema)

  const target = await getUserById(id)
  if (!target) throw createApiError('NOT_FOUND', { message: '用户不存在' })
  if (target.id === current.id) {
    throw createApiError('FORBIDDEN', { message: '不能删除当前登录的自己' })
  }

  try {
    await deleteUserById(id)
  } catch (err) {
    // 23503 = foreign_key_violation：发布过活动或执行过补签的用户留痕需要保留
    if ((err as { code?: string } | null)?.code === '23503') {
      throw createApiError('CONFLICT', {
        message: '该用户存在活动关联记录，请改用停用账号'
      })
    }
    throw err
  }
  return ok({ id }, '用户已删除')
})
```

- [ ] **Step 7: 检查点**

Run: `bun run typecheck; bun run lint; bun run test`
Expected: 0 error / 0 problem；全部单测通过。

Git（仅当用户已明确要求提交）：

```bash
git add backend/server/api/admin/activities backend/server/api/admin/users/[id].delete.ts
git commit -m "feat(backend): admin activity APIs and FK-safe user deletion"
```

---

## Task 9: Nuxt 管理后台活动页面

**Files:**
- Create: `app/pages/admin/activities/index.vue`
- Create: `app/pages/admin/activities/[id].vue`
- Modify: `app/layouts/default.vue`

- [ ] **Step 1: 活动管理列表页** — `app/pages/admin/activities/index.vue`

```vue
<script setup lang="ts">
interface ActivityRow {
  id: string
  title: string
  location: { name: string, address: string, latitude: number | null, longitude: number | null }
  startTime: string
  endTime: string
  status: 'published' | 'cancelled'
  state: 'upcoming' | 'ongoing' | 'ended' | 'cancelled'
  capacity: number | null
  registeredCount: number
  checkedInCount: number
  remaining: number | null
}
interface ListResponse {
  code: 'OK'
  data: ActivityRow[]
  pagination: { page: number, pageSize: number, total: number, totalPages: number }
}

const toast = useToast()
const route = useRoute()
const router = useRouter()

const rows = ref<ActivityRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(false)
const searchInput = ref('')
const keyword = ref('')
const state = ref<'active' | 'past' | 'cancelled'>('active')

const stateItems = [
  { label: '未开始/进行中', value: 'active' },
  { label: '已结束', value: 'past' },
  { label: '已取消', value: 'cancelled' }
]

async function load() {
  loading.value = true
  try {
    const res = await $fetch<ListResponse>('/api/admin/activities', {
      credentials: 'include',
      query: {
        page: page.value,
        pageSize,
        state: state.value,
        ...(keyword.value ? { keyword: keyword.value } : {})
      }
    })
    rows.value = res.data
    total.value = res.pagination.total
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载活动列表失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (val) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    keyword.value = val.trim()
    page.value = 1
    load()
  }, 300)
})
watch([page, state], () => load())

const columns = [
  { accessorKey: 'title', header: '活动' },
  { accessorKey: 'startTime', header: '开始时间' },
  { accessorKey: 'location', header: '地点' },
  { accessorKey: 'state', header: '状态' },
  { accessorKey: 'registeredCount', header: '报名/上限' },
  { accessorKey: 'checkedInCount', header: '已签到' },
  { id: 'actions', header: '操作' }
]

const STATE_LABEL: Record<ActivityRow['state'], string> = {
  upcoming: '未开始',
  ongoing: '进行中',
  ended: '已结束',
  cancelled: '已取消'
}

function stateColor(s: ActivityRow['state']): string {
  if (s === 'ongoing') return 'success'
  if (s === 'cancelled' || s === 'ended') return 'neutral'
  return 'primary'
}

function capacityText(row: ActivityRow): string {
  return row.capacity === null ? `${row.registeredCount} / 不限` : `${row.registeredCount} / ${row.capacity}`
}

function openDetail(id: string) {
  router.push(`/admin/activities/${id}`)
}

// 取消确认
const cancelOpen = ref(false)
const cancelTarget = ref<ActivityRow | null>(null)
const cancelSubmitting = ref(false)

function askCancel(row: ActivityRow) {
  cancelTarget.value = row
  cancelOpen.value = true
}

async function onCancel() {
  if (!cancelTarget.value) return
  cancelSubmitting.value = true
  try {
    await $fetch(`/api/admin/activities/${cancelTarget.value.id}/cancel`, {
      method: 'POST',
      credentials: 'include'
    })
    toast.add({ title: '活动已取消', color: 'success' })
    cancelOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    cancelSubmitting.value = false
  }
}

onMounted(() => {
  if (route.query.state === 'cancelled') state.value = 'cancelled'
  load()
})
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-semibold">
        活动管理
      </h1>
      <p class="text-sm text-muted mt-1">
        共 {{ total }} 个活动
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <USelect
        v-model="state"
        :items="stateItems"
        class="w-40"
      />
      <UInput
        v-model="searchInput"
        placeholder="搜索标题 / 地点"
        icon="i-lucide-search"
        class="w-56 sm:w-64"
        clearable
      />
    </div>

    <UCard>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
      >
        <template #startTime-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDateTime(row.original.startTime) }}</span>
        </template>

        <template #location-cell="{ row }">
          <span class="text-sm">{{ row.original.location.name }}</span>
        </template>

        <template #state-cell="{ row }">
          <UBadge
            :color="(stateColor(row.original.state) as 'primary' | 'success' | 'neutral')"
            variant="subtle"
            size="sm"
          >
            {{ STATE_LABEL[row.original.state] }}
          </UBadge>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-eye"
              label="查看/名单"
              @click="openDetail(row.original.id)"
            />
            <UButton
              v-if="row.original.status === 'published'"
              color="error"
              variant="ghost"
              size="xs"
              icon="i-lucide-ban"
              label="取消活动"
              @click="askCancel(row.original)"
            />
          </div>
        </template>

        <template #empty>
          <div class="py-10 text-center text-sm text-muted">
            暂无活动数据
          </div>
        </template>
      </UTable>

      <div
        v-if="total > pageSize"
        class="flex justify-center mt-4"
      >
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="pageSize"
        />
      </div>
    </UCard>

    <UModal
      v-model:open="cancelOpen"
      title="取消活动"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            确定取消活动
            <span class="font-medium">{{ cancelTarget?.title }}</span>
            吗？取消后活动不能再报名或签到，此操作不可恢复。
          </p>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              label="再想想"
              @click="cancelOpen = false"
            />
            <UButton
              color="error"
              label="确认取消"
              :loading="cancelSubmitting"
              @click="onCancel"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 2: 活动详情 + 报名名单页** — `app/pages/admin/activities/[id].vue`

```vue
<script setup lang="ts">
interface ActivityDetail {
  id: string
  title: string
  description: string
  coverUrl: string | null
  location: { name: string, address: string, latitude: number | null, longitude: number | null }
  startTime: string
  endTime: string
  registerDeadline: string | null
  capacity: number | null
  status: 'published' | 'cancelled'
  state: 'upcoming' | 'ongoing' | 'ended' | 'cancelled'
  registeredCount: number
  checkedInCount: number
  remaining: number | null
}
interface RegistrationRow {
  id: string
  userId: string
  userName: string
  userPhone: string | null
  userImage: string | null
  status: 'registered' | 'cancelled' | 'checked_in'
  checkInAt: string | null
  checkInMethod: 'scan' | 'manual' | null
  createdAt: string
}
interface DetailResponse { code: 'OK', data: ActivityDetail }
interface ListResponse {
  code: 'OK'
  data: RegistrationRow[]
  pagination: { page: number, pageSize: number, total: number, totalPages: number }
  stats: { registeredCount: number, checkedInCount: number, capacity: number | null, remaining: number | null }
}

const route = useRoute()
const toast = useToast()
const activityId = String(route.params.id)

const activity = ref<ActivityDetail | null>(null)
const rows = ref<RegistrationRow[]>([])
const total = ref(0)
const stats = ref({ registeredCount: 0, checkedInCount: 0, capacity: null as number | null, remaining: null as number | null })
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const checkInUserId = ref<string | null>(null)

async function loadActivity() {
  try {
    const res = await $fetch<DetailResponse>(`/api/admin/activities/${activityId}`, {
      credentials: 'include'
    })
    activity.value = res.data
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载活动失败'), color: 'error' })
  }
}

async function loadRegistrations() {
  loading.value = true
  try {
    const res = await $fetch<ListResponse>(`/api/admin/activities/${activityId}/registrations`, {
      credentials: 'include',
      query: { page: page.value, pageSize }
    })
    rows.value = res.data
    total.value = res.pagination.total
    stats.value = res.stats
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载名单失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(page, () => loadRegistrations())

const columns = [
  { accessorKey: 'userName', header: '昵称' },
  { accessorKey: 'userPhone', header: '手机号' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'checkInMethod', header: '签到方式' },
  { accessorKey: 'checkInAt', header: '签到时间' },
  { accessorKey: 'createdAt', header: '报名时间' },
  { id: 'actions', header: '操作' }
]

const STATUS_LABEL: Record<RegistrationRow['status'], string> = {
  registered: '已报名',
  cancelled: '已取消',
  checked_in: '已签到'
}

function statusColor(s: RegistrationRow['status']): string {
  if (s === 'checked_in') return 'success'
  if (s === 'cancelled') return 'neutral'
  return 'primary'
}

async function manualCheckIn(row: RegistrationRow) {
  checkInUserId.value = row.userId
  try {
    await $fetch(`/api/admin/activities/${activityId}/manual-check-in`, {
      method: 'POST',
      credentials: 'include',
      body: { userId: row.userId }
    })
    toast.add({ title: `已为 ${row.userName} 补签`, color: 'success' })
    await loadRegistrations()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    checkInUserId.value = null
  }
}

onMounted(async () => {
  await loadActivity()
  await loadRegistrations()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <NuxtLink
          to="/admin/activities"
          class="text-sm text-primary hover:underline"
        >
          ← 返回活动列表
        </NuxtLink>
        <h1 class="text-xl font-semibold mt-1">
          {{ activity?.title ?? '活动详情' }}
        </h1>
      </div>
    </div>

    <UCard v-if="activity">
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
        <div>
          <dt class="text-muted">
            开始时间
          </dt>
          <dd>{{ formatDateTime(activity.startTime) }}</dd>
        </div>
        <div>
          <dt class="text-muted">
            结束时间
          </dt>
          <dd>{{ formatDateTime(activity.endTime) }}</dd>
        </div>
        <div>
          <dt class="text-muted">
            地点
          </dt>
          <dd>{{ activity.location.name }}（{{ activity.location.address }}）</dd>
        </div>
        <div>
          <dt class="text-muted">
            报名截止
          </dt>
          <dd>{{ formatDateTime(activity.registerDeadline) }}</dd>
        </div>
        <div>
          <dt class="text-muted">
            名额
          </dt>
          <dd>
            已报 {{ stats.registeredCount }} /
            {{ stats.capacity === null ? '不限' : `上限 ${stats.capacity}` }}，
            已签到 {{ stats.checkedInCount }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            状态
          </dt>
          <dd>{{ activity.status === 'cancelled' ? '已取消' : '进行中/未开始' }}</dd>
        </div>
      </dl>
      <p
        v-if="activity.description"
        class="text-sm mt-4 whitespace-pre-line text-muted"
      >
        {{ activity.description }}
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-base font-medium">
          报名 / 签到名单（{{ total }}）
        </h2>
      </template>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
      >
        <template #userPhone-cell="{ row }">
          {{ row.original.userPhone || '—' }}
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="(statusColor(row.original.status) as 'primary' | 'success' | 'neutral')"
            variant="subtle"
            size="sm"
          >
            {{ STATUS_LABEL[row.original.status] }}
          </UBadge>
        </template>
        <template #checkInMethod-cell="{ row }">
          <span v-if="row.original.checkInMethod === 'manual'">管理员补签</span>
          <span v-else-if="row.original.checkInMethod === 'scan'">扫码签到</span>
          <span v-else class="text-muted">—</span>
        </template>
        <template #checkInAt-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDateTime(row.original.checkInAt) }}</span>
        </template>
        <template #createdAt-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDateTime(row.original.createdAt) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="row.original.status === 'registered'"
            color="primary"
            variant="ghost"
            size="xs"
            icon="i-lucide-check-check"
            label="补签"
            :loading="checkInUserId === row.original.userId"
            @click="manualCheckIn(row.original)"
          />
          <span v-else class="text-muted text-xs">—</span>
        </template>
        <template #empty>
          <div class="py-10 text-center text-sm text-muted">
            暂无报名记录
          </div>
        </template>
      </UTable>

      <div
        v-if="total > pageSize"
        class="flex justify-center mt-4"
      >
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="pageSize"
        />
      </div>
    </UCard>
  </div>
</template>
```

- [ ] **Step 3: 侧边栏入口**

在 `app/layouts/default.vue` 的 `navItems` 中，「用户管理」项之后插入：

```ts
  { label: '活动管理', to: '/admin/activities', icon: 'i-lucide-calendar-days' as unknown as Component, adminOnly: true },
```

- [ ] **Step 4: 检查点**

Run: `bun run typecheck; bun run lint`
Expected: 0 error / 0 problem。若 USelect 的 v-model 类型报错，按 Nuxt UI v4 当前类型用 `:model-value` + `@update:model-value` 等价改写（先以 typecheck 结果为准）。

Git（仅当用户已明确要求提交）：

```bash
git add backend/app/pages/admin/activities backend/app/layouts/default.vue
git commit -m "feat(backend): admin activities console pages"
```

---

## Task 10: 全量门禁、接口全链路冒烟与文档同步

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: 全量门禁**

在 `backend/` 执行：

```powershell
bun run typecheck; bun run lint; bun run test
```

Expected: 0 error / 0 problem / 全部测试通过（含新增 path、checkin-code、activity schema 三组用例）。

- [ ] **Step 2: 登录态全链路冒烟（两个账号）**

前置：db:seed 已建初始 admin；用该管理员在后台「用户管理」里准备第二个用户并授予 `activity_admin`（或直接给另一账号勾 admin 用于测试）。启动 `bun run dev`，用临时 Bun 脚本带 cookie jar 跑通：发布 → 列表 → 报名（另一会话）→ 出示码 → 签到 → 名单 → 补签。

新建临时文件 `backend\tmp-smoke.mjs`（用完即删）：

```js
const BASE = 'http://localhost:9999'

function jar() {
  let cookie = ''
  return {
    save(res) {
      const set = res.headers.getSetCookie?.() ?? []
      const picked = set.map(s => s.split(';')[0]).filter(Boolean)
      if (picked.length) cookie = picked.join('; ')
    },
    header: () => ({ 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) })
  }
}

const admin = jar()
const user = jar()

async function call(j, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: j.header(), body: body ? JSON.stringify(body) : undefined })
  j.save(res)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  console.log(method, path, res.status, typeof json === 'object' && json ? JSON.stringify(json).slice(0, 300) : json)
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`)
  return json
}

// 1. 两个会话登录（替换为实际账号密码）
await call(admin, 'POST', '/api/auth/sign-in/email', { email: process.env.ADMIN_EMAIL!, password: process.env.ADMIN_PASSWORD! })
await call(user, 'POST', '/api/auth/sign-in/email', { email: process.env.USER2_EMAIL!, password: process.env.USER2_PASSWORD! })

// 2. admin 发布活动（开始时间=1 小时后，结束=3 小时后）
const start = new Date(Date.now() + 3600_000)
const end = new Date(Date.now() + 3 * 3600_000)
const created = await call(admin, 'POST', '/api/activities', {
  title: '冒烟测试活动',
  description: '全链路验证',
  location: { name: '测试点', address: '测试地址', latitude: 24.4776, longitude: 118.0894 },
  startTime: start.toISOString(),
  endTime: end.toISOString(),
  capacity: 20
})
const id = created.data.id

// 3. 用户报名
await call(user, 'POST', `/api/activities/${id}/register`)

// 4. 开放签到窗：直接用管理员签到码（注意：此刻在开始前 15 分钟之外会 409；
//    冒烟时把活动开始时间设为 5 分钟后，或仅验证码接口 + 期望的窗外 409）
const codeRes = await call(admin, 'GET', `/api/activities/${id}/check-in-code`)
console.log('code payload =', codeRes.data)

// 5. 名单与统计
await call(admin, 'GET', `/api/activities/${id}/registrations?page=1&pageSize=20`)
console.log('SMOKE DONE')
```

运行（PowerShell，先设当前进程环境变量）：

```powershell
$env:ADMIN_EMAIL="你的管理员邮箱"; $env:ADMIN_PASSWORD="密码"; $env:USER2_EMAIL="第二账号"; $env:USER2_PASSWORD="密码"; bun tmp-smoke.mjs
```

Expected: 所有调用 2xx；名单接口返回该用户 status=registered。签到时间窗若在窗外，签到调用返回 **409「签到尚未开始」即符合预期**；窗内验证：再发一个开始时间 5 分钟后的活动，用 `codeRes.data.code` 调 `/check-in`，应返回 status=checked_in、checkInMethod=scan。

冒烟结束删除临时文件：`Remove-Item tmp-smoke.mjs`。

- [ ] **Step 3: 后台页面浏览器走查**

登录 `http://localhost:9999/login` → 侧边栏出现「活动管理」→ 列表能筛选/搜索 → 进入详情看到活动信息与名单 → 对 registered 用户「补签」成功、按钮消失、状态变已签到 → 「取消活动」二次确认后列表中该活动进入「已取消」分段。

- [ ] **Step 4: 同步 AGENTS.md**

在根 `AGENTS.md`：

1. §7.2「认证与授权」小节末尾追加一条：

```markdown
- 活动组织者角色为 `activity_admin`（或 `admin`）；业务活动接口挂 `/api/activities/**`，
  其中 GET 列表/详情经 `isPublicRequest(pathname, method)` 对游客公开，组织者接口在处理器内
  `requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)`；PC 后台活动接口仍在 `/api/admin/activities/**`（仅 admin）。
```

2. §3 目录结构的 `server/api/` 注释中，在 `me.get.ts health.get.ts` 一行下补充活动模块概述：

```markdown
│  │  ├─ activities/          # 活动：公开列表/详情 + 报名/签到（登录）+ 组织者管理（activity_admin/admin）
│  │  ├─ admin/activities/    # PC 后台活动管理（仅 admin）
```

- [ ] **Step 5: 最终门禁**

Run: `bun run typecheck; bun run lint; bun run test`
Expected: 全绿。后端计划完成，可进入前端计划（`2026-10-08-activity-frontend.md`）。

Git（仅当用户已明确要求提交）：

```bash
git add AGENTS.md
git commit -m "docs: activity backend conventions"
```
