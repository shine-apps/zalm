# 我的关注（关注活动与用户）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把前端「我的收藏」占位入口改造成「我的关注」，支持关注活动详情页与他人主页，并提供单页双 tab 的关注列表页（前后端全链路）。

**Architecture:** 后端采用**单表多态**（`follow` 表，`target_type` + `target_id`），`user_id` 挂真实外键级联删除，`target_id` 无外键、靠查询时 `inner join` 目标表过滤孤儿记录。写操作为资源嵌套路径（`POST/DELETE /api/activities/[id]/follow`、`POST/DELETE /api/users/[id]/follow`），读操作为 `GET /api/follows?type=`。详情接口沿用 `myRegistration` 的「软会话」模式附带 `isFollowed`。前端新增 `api/follow.ts` 与新页面 `pages/follow/index.vue`，并在活动详情底栏、他人主页顶部加关注按钮（乐观更新 + 失败回滚）。

**Tech Stack:** backend = Nuxt 4.5 + Drizzle ORM 0.45 + PostgreSQL 18 + Zod 4 + Vitest 5；frontend = uniapp/Vue 3.4 + wot-ui v2 + alova 3 + UnoCSS。包管理器统一 **Bun 1.4.0**。

## 约定（执行前必读）

- Windows PowerShell **不支持 `&&`**，串联用 `;`。
- **本计划不含 git commit 步骤**（仓库规则：仅用户明确要求时提交）。每个 Task 末尾的验证命令即检查点。
- 后端 `server/api/**` 内的 `defineEventHandler` / `ok` / `paginated` / `parseQuery` / `parseBody` / `parseParams` / `createApiError` / `requireUser` / `getAuthUser` / `setResponseStatus` 以及 `server/utils/*.ts` 的具名导出（如 `getActivityDetail`、`isFollowing`）均为 **Nuxt 自动导入**，不要手写 import。`server/schemas/*`、`server/database/repositories/*` 必须显式 import。
- 迁移文件名必须带语义名：`bun run db:generate -- --name add_follows`（禁止省略 `--name`）。
- 前端生成物（`src/pages.json`、`src/manifest.json`、`src/types/*.d.ts`）**不要手改**；新页面用 `definePage({...})` 声明即可（easycom 规则 `^wd-(.*)` 已覆盖）。
- 前端颜色只用主题变量（`bg-card` / `text-ink` / `text-muted` / `bg-primary` / `border-line-strong` / `bg-primary-soft` / `text-primary-soft-text` / `bg-danger-soft` / `text-danger`），不硬编码色值。
- 已核对的可用的 Carbon 图标类：`i-carbon-star`、`i-carbon-star-filled`、`i-carbon-user-follow`、`i-carbon-calendar`、`i-carbon-user-avatar`、`i-carbon-time`、`i-carbon-location`。

## File Structure

**backend 新增**

| 文件 | 职责 |
|------|------|
| `server/schemas/follow.ts` | 关注入参校验（targetType 枚举、id 参数、分页查询） |
| `server/schemas/follow.test.ts` | 上述 schema 的纯函数单测 |
| `server/database/repositories/follows.ts` | follow 表数据访问（幂等增删、状态查询、双类型分页 join） |
| `server/utils/follow-service.ts` | 关注业务编排（404/422 判定、幂等结果、列表分发） |
| `server/api/activities/[id]/follow.post.ts` | 关注活动 |
| `server/api/activities/[id]/follow.delete.ts` | 取关活动 |
| `server/api/users/[id]/follow.post.ts` | 关注用户 |
| `server/api/users/[id]/follow.delete.ts` | 取关用户 |
| `server/api/follows.get.ts` | 我关注的活动/用户分页列表 |

**backend 修改**

| 文件 | 改动 |
|------|------|
| `server/database/schema.ts` | 新增 `FOLLOW_TARGET_TYPES` / `FollowTargetType` / `follow` 表 |
| `server/utils/rate-limit.ts` | 新增 `follow` 限流档与 `isFollowEndpoint` |
| `server/utils/rate-limit.test.ts` | 覆盖 follow 档判定 |
| `server/utils/env.ts` | 新增 `RATE_LIMIT_FOLLOW_MAX`（默认 30） |
| `server/middleware/10.rate-limit.ts` | `maxByTier` 增加 `follow` |
| `server/utils/path.test.ts` | 关注写端点需登录、用户主页 GET 公开的回归用例 |
| `server/middleware/20.auth.ts` | `isSoftSessionPath` 登记 `/api/users/**` |
| `server/utils/activity-service.ts` | `toActivityView` 增加 `isFollowed`；`getActivityDetail` 查询关注状态 |
| `server/api/users/[id].get.ts` | 返回 `isFollowed` |
| `backend/.env.example` | 补充 `RATE_LIMIT_FOLLOW_MAX=30` |
| `backend/drizzle/0001_add_follows.sql`（生成物） | follow 表迁移 |

**frontend 新增**

| 文件 | 职责 |
|------|------|
| `src/api/follow.ts` | 关注 API 与类型（写操作 + 两个分页读） |
| `src/pages/follow/index.vue` | 我的关注（活动/用户双 tab） |

**frontend 修改**

| 文件 | 改动 |
|------|------|
| `src/api/activity.ts` | `ActivityView` 增加 `isFollowed` |
| `src/api/users.ts` | `PublicUserProfile` 增加 `isFollowed` |
| `src/utils/home.test.ts` | 活动工厂补 `isFollowed: false`（类型必需字段） |
| `src/pages/me/me.vue` | 「我的收藏」→「我的关注」+ 图标扫描注释 |
| `src/pages/activity/detail.vue` | 底栏关注按钮（乐观更新） |
| `src/pages/user-home/index.vue` | 他人主页顶部关注按钮（乐观更新） |

---

## Task 1: follow 表与迁移

**Files:**
- Modify: `backend/server/database/schema.ts`（在 `// Better Auth 四张表` 之前插入）
- Create: `backend/drizzle/0001_add_follows.sql`（由 drizzle-kit 生成）

- [ ] **Step 1: 在 schema.ts 末尾（Better Auth 导出之前）插入 follow 表**

在 `schema.ts` 第 359 行 `)` 之后、第 361 行 `// Better Auth 四张表` 之前插入：

```ts
// ===== 关注（单表多态收藏夹） =====

/** 可关注的目标类型；值域由 TS 常量 + Zod 入参双层守住（DB 无枚举约束）。 */
export const FOLLOW_TARGET_TYPES = ['activity', 'user'] as const
export type FollowTargetType = (typeof FOLLOW_TARGET_TYPES)[number]

/**
 * 关注关系（仅收藏夹语义：无粉丝数、无通知、无 feed）。
 * - user_id 为关注者，挂真实外键：用户注销 → 其关注自动清理；
 * - target_id 多态无外键：活动被删/目标用户注销产生的孤儿记录，
 *   由列表查询 inner join 目标表自然过滤，不做异步清理任务。
 */
export const follow = pgTable(
  'follow',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    targetType: text('target_type').$type<FollowTargetType>().notNull(),
    targetId: text('target_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    unique('follow_user_target_unique').on(t.userId, t.targetType, t.targetId),
    index('follow_user_type_idx').on(t.userId, t.targetType)
  ]
)
```

- [ ] **Step 2: 生成迁移（必须带语义名）**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\backend
bun run db:generate -- --name add_follows
```

预期：`backend/drizzle/` 下新增 `0001_add_follows.sql`，内容含 `CREATE TABLE "follow"`、`follow_user_target_unique` 唯一索引、`follow_user_type_idx` 普通索引、指向 `user.id` 的 `ON DELETE cascade` 外键。

- [ ] **Step 3: 执行迁移**

```powershell
bun run db:migrate
```

预期：输出迁移已应用（无报错）；数据库中可查到 `follow` 表。

---

## Task 2: 限流新增 follow 档（30/min）

**Files:**
- Modify: `backend/server/utils/rate-limit.ts`
- Test: `backend/server/utils/rate-limit.test.ts`
- Modify: `backend/server/utils/env.ts`
- Modify: `backend/server/middleware/10.rate-limit.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: 先写失败测试**

把 `rate-limit.test.ts` 第 2 行的 import 改为：

```ts
import { getRateLimitTier, isAnalyticsEndpoint, isFollowEndpoint, isSensitiveEndpoint } from './rate-limit'
```

在 `describe('getRateLimitTier', () => {` 之前插入：

```ts
describe('isFollowEndpoint', () => {
  it('classifies follow writes on activities and users', () => {
    expect(isFollowEndpoint('/api/activities/abc/follow', 'POST')).toBe(true)
    expect(isFollowEndpoint('/api/activities/abc/follow', 'DELETE')).toBe(true)
    expect(isFollowEndpoint('/api/users/u1/follow', 'POST')).toBe(true)
    expect(isFollowEndpoint('/api/users/u1/follow', 'DELETE')).toBe(true)
  })

  it('ignores reads and sibling paths', () => {
    expect(isFollowEndpoint('/api/activities/abc/follow', 'GET')).toBe(false)
    expect(isFollowEndpoint('/api/follows', 'GET')).toBe(false)
    expect(isFollowEndpoint('/api/activities/abc/followers', 'POST')).toBe(false)
    expect(isFollowEndpoint('/api/users/u1/follow/x', 'POST')).toBe(false)
    expect(isFollowEndpoint('/api/users/u1/points', 'POST')).toBe(false)
  })
})
```

在 `describe('getRateLimitTier', () => {` 内追加一个用例：

```ts
  it('routes follow writes to the follow tier', () => {
    expect(getRateLimitTier('/api/activities/abc/follow', 'POST')).toBe('follow')
    expect(getRateLimitTier('/api/users/u1/follow', 'DELETE')).toBe('follow')
    expect(getRateLimitTier('/api/follows', 'GET')).toBe('global')
  })
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\backend
bun run test -- server/utils/rate-limit.test.ts
```

预期：FAIL（`isFollowEndpoint` 未导出）。

- [ ] **Step 3: 实现 follow 档**

`rate-limit.ts` 头部注释的档位列表补一行 `follow`，并把类型与函数改为：

```ts
export type RateLimitTier = 'global' | 'sensitive' | 'follow' | 'analytics'
```

在 `isAnalyticsEndpoint` 之后新增：

```ts
/**
 * 关注/取关写端点（活动、用户两类资源）。
 * 独立档位（默认 30/min）：介于报名等敏感档 10/min 与全局 300/min 之间，
 * 既要挡住脚本刷库，又不能影响正常浏览时的连续关注操作。
 */
export function isFollowEndpoint(pathname: string, method: string): boolean {
  const m = method.toUpperCase()
  if (m !== 'POST' && m !== 'DELETE') return false
  return /^\/api\/(activities|users)\/[^/]+\/follow$/.test(pathname)
}
```

`getRateLimitTier` 改为：

```ts
export function getRateLimitTier(pathname: string, method: string): RateLimitTier {
  if (isSensitiveEndpoint(pathname, method))
    return 'sensitive'
  if (isFollowEndpoint(pathname, method))
    return 'follow'
  if (isAnalyticsEndpoint(pathname, method))
    return 'analytics'
  return 'global'
}
```

- [ ] **Step 4: 环境变量与中间件映射**

`env.ts` 在 `RATE_LIMIT_SENSITIVE_MAX` 之后插入：

```ts
  // 关注/取关写操作（POST/DELETE /api/{activities|users}/:id/follow）
  RATE_LIMIT_FOLLOW_MAX: z.coerce.number().int().positive().default(30),
```

`middleware/10.rate-limit.ts` 的 `maxByTier` 改为：

```ts
  const maxByTier = {
    sensitive: env.RATE_LIMIT_SENSITIVE_MAX,
    follow: env.RATE_LIMIT_FOLLOW_MAX,
    analytics: env.RATE_LIMIT_ANALYTICS_MAX,
    global: env.RATE_LIMIT_GLOBAL_MAX
  } as const
```

同文件顶部注释的档位说明补一行：

```
 * - 关注/取关（POST/DELETE .../follow）：RATE_LIMIT_FOLLOW_MAX（默认 30）
```

`.env.example` 在 `RATE_LIMIT_SENSITIVE_MAX=10` 之后插入：

```
# 关注/取关写操作（默认 30）
RATE_LIMIT_FOLLOW_MAX=30
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
bun run test -- server/utils/rate-limit.test.ts
```

预期：PASS（全部用例绿）。

---

## Task 3: 关注入参 schema

**Files:**
- Create: `backend/server/schemas/follow.test.ts`
- Create: `backend/server/schemas/follow.ts`

- [ ] **Step 1: 先写测试**

创建 `backend/server/schemas/follow.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { followTargetIdParamSchema, followsQuerySchema } from './follow'

describe('followsQuerySchema', () => {
  it('requires a known target type', () => {
    expect(followsQuerySchema.safeParse({ type: 'activity' }).success).toBe(true)
    expect(followsQuerySchema.safeParse({ type: 'user' }).success).toBe(true)
    expect(followsQuerySchema.safeParse({ type: 'post' }).success).toBe(false)
    expect(followsQuerySchema.safeParse({}).success).toBe(false)
  })

  it('applies pagination defaults and bounds', () => {
    const parsed = followsQuerySchema.parse({ type: 'activity' })
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
    expect(followsQuerySchema.safeParse({ type: 'activity', page: 0 }).success).toBe(false)
    expect(followsQuerySchema.safeParse({ type: 'activity', pageSize: 101 }).success).toBe(false)
  })
})

describe('followTargetIdParamSchema', () => {
  it('accepts non-uuid Better Auth user ids', () => {
    expect(followTargetIdParamSchema.safeParse({ id: 'kZ8xQ2mN3p' }).success).toBe(true)
  })

  it('rejects blank and over-long ids', () => {
    expect(followTargetIdParamSchema.safeParse({ id: '   ' }).success).toBe(false)
    expect(followTargetIdParamSchema.safeParse({ id: '' }).success).toBe(false)
    expect(followTargetIdParamSchema.safeParse({ id: 'x'.repeat(65) }).success).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\backend
bun run test -- server/schemas/follow.test.ts
```

预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 schema**

创建 `backend/server/schemas/follow.ts`：

```ts
import { z } from 'zod'
import { FOLLOW_TARGET_TYPES } from '../database/schema'
import { pageQuerySchema } from '../utils/pagination'

/** 关注目标类型：活动 / 用户。 */
export const followTargetTypeSchema = z.enum(FOLLOW_TARGET_TYPES)

/** GET /api/follows：目标类型必填 + 通用分页参数。 */
export const followsQuerySchema = pageQuerySchema.extend({
  type: followTargetTypeSchema
})

/**
 * 用户维度路由参数：Better Auth 用户 id 非 uuid，按现有 manualCheckInBodySchema
 * 口径放宽为 1..64 字符（活动维度仍用 activityIdParamSchema 的 uuid 校验）。
 */
export const followTargetIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64)
})

export type FollowTargetTypeValue = z.infer<typeof followTargetTypeSchema>
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
bun run test -- server/schemas/follow.test.ts
```

预期：PASS。

---

## Task 4: follows repository

**Files:**
- Create: `backend/server/database/repositories/follows.ts`

- [ ] **Step 1: 实现 repository**

创建 `backend/server/database/repositories/follows.ts`：

```ts
import { and, count, desc, eq } from 'drizzle-orm'
import { db } from '../client'
import {
  activity as activityTable,
  follow as followTable,
  user as userTable,
  type ActivityLocation,
  type ActivityStatus,
  type FollowTargetType
} from '../schema'
import type { DbExecutor } from './activities'

export type FollowRow = typeof followTable.$inferSelect

/** 我关注的活动卡片（列表投影，不含敏感/冗余字段）。 */
export interface FollowedActivityCard {
  activityId: string
  title: string
  coverUrl: string | null
  startTime: Date
  location: ActivityLocation
  status: ActivityStatus
}

/** 我关注的用户卡片。 */
export interface FollowedUserCard {
  userId: string
  name: string
  image: string | null
}

/** 关注（幂等）：重复关注不报错，保留首次关注时间。 */
export async function insertFollow(
  userId: string,
  targetType: FollowTargetType,
  targetId: string,
  exec: DbExecutor = db
): Promise<void> {
  await exec
    .insert(followTable)
    .values({ userId, targetType, targetId })
    .onConflictDoNothing()
}

/** 取关（幂等）：未关注时静默无操作。 */
export async function deleteFollow(
  userId: string,
  targetType: FollowTargetType,
  targetId: string,
  exec: DbExecutor = db
): Promise<void> {
  await exec
    .delete(followTable)
    .where(
      and(
        eq(followTable.userId, userId),
        eq(followTable.targetType, targetType),
        eq(followTable.targetId, targetId)
      )
    )
}

/** 是否已关注（详情接口附带状态位）。 */
export async function isFollowing(
  userId: string,
  targetType: FollowTargetType,
  targetId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: followTable.id })
    .from(followTable)
    .where(
      and(
        eq(followTable.userId, userId),
        eq(followTable.targetType, targetType),
        eq(followTable.targetId, targetId)
      )
    )
    .limit(1)
  return rows.length > 0
}

/**
 * 我关注的活动（按关注时间倒序）。
 * inner join activity 自然过滤已删除活动产生的孤儿关注记录。
 */
export async function listFollowedActivities(
  userId: string,
  limit: number,
  offset: number
): Promise<{ rows: FollowedActivityCard[], total: number }> {
  const where = and(
    eq(followTable.userId, userId),
    eq(followTable.targetType, 'activity')
  )
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        activityId: activityTable.id,
        title: activityTable.title,
        coverUrl: activityTable.coverUrl,
        startTime: activityTable.startTime,
        location: activityTable.location,
        status: activityTable.status
      })
      .from(followTable)
      .innerJoin(activityTable, eq(activityTable.id, followTable.targetId))
      .where(where)
      .orderBy(desc(followTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(followTable)
      .innerJoin(activityTable, eq(activityTable.id, followTable.targetId))
      .where(where)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}

/**
 * 我关注的用户（按关注时间倒序）。
 * inner join user + banned=false 过滤已注销/已封禁目标。
 */
export async function listFollowedUsers(
  userId: string,
  limit: number,
  offset: number
): Promise<{ rows: FollowedUserCard[], total: number }> {
  const where = and(
    eq(followTable.userId, userId),
    eq(followTable.targetType, 'user'),
    eq(userTable.banned, false)
  )
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        userId: userTable.id,
        name: userTable.name,
        image: userTable.image
      })
      .from(followTable)
      .innerJoin(userTable, eq(userTable.id, followTable.targetId))
      .where(where)
      .orderBy(desc(followTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(followTable)
      .innerJoin(userTable, eq(userTable.id, followTable.targetId))
      .where(where)
  ])
  return { rows, total: Number(totalRows[0]?.value ?? 0) }
}
```

> 说明：仓库现有测试设施只有纯函数单测（`vitest.config.ts` 的 `include: ['server/**/*.test.ts']`，无 DB 集成测试基座），因此本 Task 不新增 DB 测试；正确性由 Task 8 的 typecheck + 手工联调 + 现有工具层单测共同保障。

- [ ] **Step 2: 类型检查该层能通过编译**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\backend
bun run typecheck
```

预期：0 error（若后续 Task 尚未完成，允许仅有「未使用文件」之外的其他既有告警；本步主要确认 follows.ts 无类型错误）。

---

## Task 5: follow service

**Files:**
- Create: `backend/server/utils/follow-service.ts`

- [ ] **Step 1: 实现 service**

创建 `backend/server/utils/follow-service.ts`：

```ts
import { getActivityById } from '../database/repositories/activities'
import {
  deleteFollow,
  insertFollow,
  listFollowedActivities,
  listFollowedUsers
} from '../database/repositories/follows'
import { getUserById } from '../database/repositories/users'
import type { FollowTargetTypeValue } from '../schemas/follow'
import { createApiError } from './errors'

/** 关注活动：活动不存在 404；重复关注幂等。 */
export async function followActivity(activityId: string, userId: string) {
  const activity = await getActivityById(activityId)
  if (!activity)
    throw createApiError('NOT_FOUND', { message: '活动不存在' })
  await insertFollow(userId, 'activity', activityId)
  return { followed: true }
}

/** 取关活动：幂等，未关注也返回成功。 */
export async function unfollowActivity(activityId: string, userId: string) {
  await deleteFollow(userId, 'activity', activityId)
  return { followed: false }
}

/** 关注用户：不能关注自己（422）；目标不存在/封禁 404；重复幂等。 */
export async function followUser(targetUserId: string, viewerId: string) {
  if (targetUserId === viewerId)
    throw createApiError('VALIDATION_ERROR', { message: '不能关注自己' })
  const target = await getUserById(targetUserId)
  if (!target || target.banned)
    throw createApiError('NOT_FOUND', { message: '用户不存在' })
  await insertFollow(viewerId, 'user', targetUserId)
  return { followed: true }
}

/** 取关用户：幂等。 */
export async function unfollowUser(targetUserId: string, viewerId: string) {
  await deleteFollow(viewerId, 'user', targetUserId)
  return { followed: false }
}

/** 我关注的列表分发（活动/用户各自投影与 join 过滤）。 */
export async function listMyFollows(
  userId: string,
  type: FollowTargetTypeValue,
  page: number,
  pageSize: number
) {
  const limit = pageSize
  const offset = (page - 1) * pageSize
  if (type === 'activity')
    return listFollowedActivities(userId, limit, offset)
  return listFollowedUsers(userId, limit, offset)
}
```

- [ ] **Step 2: `bun run typecheck`**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\backend
bun run typecheck
```

预期：0 error。

---

## Task 6: 5 个关注路由

**Files:**
- Create: `backend/server/api/activities/[id]/follow.post.ts`
- Create: `backend/server/api/activities/[id]/follow.delete.ts`
- Create: `backend/server/api/users/[id]/follow.post.ts`
- Create: `backend/server/api/users/[id]/follow.delete.ts`
- Create: `backend/server/api/follows.get.ts`

- [ ] **Step 1: 活动关注/取关**

`backend/server/api/activities/[id]/follow.post.ts`：

```ts
import { activityIdParamSchema } from '../../../schemas/activity'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  return ok(await followActivity(id, user.id), '已关注')
})
```

`backend/server/api/activities/[id]/follow.delete.ts`：

```ts
import { activityIdParamSchema } from '../../../schemas/activity'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, activityIdParamSchema)
  return ok(await unfollowActivity(id, user.id), '已取消关注')
})
```

- [ ] **Step 2: 用户关注/取关**

`backend/server/api/users/[id]/follow.post.ts`：

```ts
import { followTargetIdParamSchema } from '../../../schemas/follow'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, followTargetIdParamSchema)
  return ok(await followUser(id, user.id), '已关注')
})
```

`backend/server/api/users/[id]/follow.delete.ts`：

```ts
import { followTargetIdParamSchema } from '../../../schemas/follow'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { id } = parseParams(event, followTargetIdParamSchema)
  return ok(await unfollowUser(id, user.id), '已取消关注')
})
```

- [ ] **Step 3: 我的关注列表**

`backend/server/api/follows.get.ts`：

```ts
import { followsQuerySchema } from '../schemas/follow'
import { buildPaginationMeta } from '../utils/pagination'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { type, page, pageSize } = parseQuery(event, followsQuerySchema)
  const { data, total } = await listMyFollows(user.id, type, page, pageSize)
  return paginated(data, buildPaginationMeta(total, { page, pageSize }))
})
```

- [ ] **Step 4:（可选）手工冒烟**

若后端 dev 已在运行（`bun run dev`，`http://localhost:9999`），用临时 Bun 脚本（fetch + 手动 cookie jar，用完删除）验证：未登录 `POST /api/activities/<id>/follow` → 401；登录后同请求 → `{code:'OK',data:{followed:true}}`；`GET /api/follows?type=activity` → `data` 为数组且带 `pagination`。未启动服务时跳过本步，改由 Task 14 的端到端验收覆盖。

- [ ] **Step 5: `bun run typecheck`**

```powershell
bun run typecheck
```

预期：0 error。

---

## Task 7: 详情附带 isFollowed + 软会话 + 路径回归测试

**Files:**
- Modify: `backend/server/utils/activity-service.ts`
- Modify: `backend/server/api/users/[id].get.ts`
- Modify: `backend/server/middleware/20.auth.ts`
- Modify: `backend/server/utils/path.test.ts`

- [ ] **Step 1: 先补路径回归测试**

在 `path.test.ts` 的 `describe('isPublicRequest', () => {` 内追加：

```ts
  it('allows guest GET on the public user profile', () => {
    expect(isPublicRequest('/api/users/u1', 'GET')).toBe(true)
  })

  it('keeps follow endpoints authenticated', () => {
    expect(isPublicRequest('/api/users/u1/follow', 'POST')).toBe(false)
    expect(isPublicRequest('/api/users/u1/follow', 'DELETE')).toBe(false)
    expect(isPublicRequest('/api/activities/x/follow', 'POST')).toBe(false)
    expect(isPublicRequest('/api/activities/x/follow', 'DELETE')).toBe(false)
    expect(isPublicRequest('/api/follows', 'GET')).toBe(false)
  })
```

运行（应 PASS，因为现有规则已满足）：

```powershell
cd d:\projects\zhongailianmeng\zalm-code\backend
bun run test -- server/utils/path.test.ts
```

- [ ] **Step 2: `toActivityView` 增加 isFollowed**

`activity-service.ts` 顶部 import 区新增：

```ts
import { isFollowing } from '../database/repositories/follows'
```

`toActivityView` 签名改为（新增第 6 个参数并带默认值，避免影响其余 3 处调用）：

```ts
export function toActivityView(
  activity: ActivityRow,
  stat: { registeredCount: number, checkedInCount: number },
  now: Date,
  myRegistration: RegistrationRow | null,
  media: ActivityMediaItemView[] = [],
  isFollowed = false
) {
```

在该函数返回对象末尾把 `media` 一行改为：

```ts
    myRegistration,
    media,
    isFollowed
```

- [ ] **Step 3: `getActivityDetail` 查询关注状态**

把 `getActivityDetail` 函数体改为：

```ts
export async function getActivityDetail(
  id: string,
  viewerId: string | null,
  now: Date = new Date()
) {
  const activity = await requireActivity(id)
  const [stat, mediaRows, isFollowed] = await Promise.all([
    getActivityStat(id),
    listActivityMedia(id),
    viewerId ? isFollowing(viewerId, 'activity', id) : Promise.resolve(false)
  ])
  const myRegistration = viewerId ? await getRegistration(id, viewerId) : null
  return toActivityView(activity, stat, now, myRegistration, mediaRows.map(toActivityMediaView), isFollowed)
}
```

- [ ] **Step 4: 用户主页返回 isFollowed**

`api/users/[id].get.ts` 全文改为：

```ts
import { isFollowing } from '../../database/repositories/follows'
import { getUserById } from '../../database/repositories/users'
import { getUserRoleNames } from '../../utils/auth'

/**
 * 公开用户资料（隐私安全白名单字段）。
 * 不含 email/phone/banned 等敏感字段；已封禁用户对游客不可见（返回 404），
 * 游客 isFollowed 恒为 false，登录者附带与查看者的关注关系。
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createApiError('VALIDATION_ERROR', { message: '缺少用户 id' })

  const user = await getUserById(id)
  if (!user || user.banned)
    throw createApiError('NOT_FOUND', { message: '用户不存在' })

  const viewer = getAuthUser(event)
  const [roles, isFollowed] = await Promise.all([
    getUserRoleNames(user.id).catch(() => []),
    viewer ? isFollowing(viewer.id, 'user', user.id) : Promise.resolve(false)
  ])

  return ok({
    id: user.id,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt,
    roles,
    isFollowed
  })
})
```

- [ ] **Step 5: 软会话登记 `/api/users/**`**

`middleware/20.auth.ts` 的 `isSoftSessionPath` 改为：

```ts
function isSoftSessionPath(pathname: string, method: string): boolean {
  if (pathname === '/api/activities' || pathname.startsWith('/api/activities/')) {
    return true
  }
  // 用户主页公开可读，登录者需拿到 isFollowed
  if (pathname.startsWith('/api/users/')) {
    return true
  }
  return method.toUpperCase() === 'POST' && pathname === '/api/share/events'
}
```

同时把该函数上方注释的第 16 行改为：

```
 * - /api/users/**：公开用户主页附带 isFollowed；
```

- [ ] **Step 6: 验证**

```powershell
bun run test -- server/utils/path.test.ts server/utils/rate-limit.test.ts server/schemas/follow.test.ts
bun run typecheck
```

预期：全部测试 PASS、typecheck 0 error。

---

## Task 8: 后端质量门禁

**Files:** 无（仅验证）

- [ ] **Step 1: 三道门禁全绿**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\backend
bun run typecheck
bun run lint
bun run test
```

预期：typecheck 0 error；lint 0 problem（必要时先 `bunx eslint . --fix`）；test 全部 PASS。

---

## Task 9: 前端 API 模块与类型扩展

**Files:**
- Create: `frontend/src/api/follow.ts`
- Modify: `frontend/src/api/activity.ts`
- Modify: `frontend/src/api/users.ts`
- Modify: `frontend/src/utils/home.test.ts`

- [ ] **Step 1: 新建 api/follow.ts**

```ts
import { http } from '@/http/alova'
import type { ActivityLocation, ActivityStatus } from './activity'
import type { PaginationMeta } from './points'

/** 我关注的活动卡片（后端 inner join 后裁剪的字段）。 */
export interface FollowedActivityCard {
  activityId: string
  title: string
  coverUrl: string | null
  startTime: string
  location: ActivityLocation
  status: ActivityStatus
}

/** 我关注的用户卡片。 */
export interface FollowedUserCard {
  userId: string
  name: string
  image: string | null
}

export interface Paged<T> {
  data: T[]
  pagination: PaginationMeta
}

/** 关注/取关统一返回当前状态（幂等，重复操作不报 409）。 */
export interface FollowToggleResult {
  followed: boolean
}

export function followActivity(id: string): Promise<FollowToggleResult> {
  return http.Post(`/activities/${id}/follow`) as unknown as Promise<FollowToggleResult>
}

export function unfollowActivity(id: string): Promise<FollowToggleResult> {
  return http.Delete(`/activities/${id}/follow`) as unknown as Promise<FollowToggleResult>
}

export function followUser(id: string): Promise<FollowToggleResult> {
  return http.Post(`/users/${id}/follow`) as unknown as Promise<FollowToggleResult>
}

export function unfollowUser(id: string): Promise<FollowToggleResult> {
  return http.Delete(`/users/${id}/follow`) as unknown as Promise<FollowToggleResult>
}

/** 我关注的活动（分页）。 */
export function getFollowedActivities(
  page: number,
  pageSize = 10,
): Promise<Paged<FollowedActivityCard>> {
  return http.Get('/follows', {
    params: { type: 'activity', page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<FollowedActivityCard>>
}

/** 我关注的用户（分页）。 */
export function getFollowedUsers(
  page: number,
  pageSize = 10,
): Promise<Paged<FollowedUserCard>> {
  return http.Get('/follows', {
    params: { type: 'user', page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<FollowedUserCard>>
}
```

- [ ] **Step 2: ActivityView 增加 isFollowed**

`api/activity.ts` 的 `ActivityView` 接口，把末尾两行：

```ts
  myRegistration: RegistrationRow | null
  media: ActivityMediaItem[]
}
```

改为：

```ts
  myRegistration: RegistrationRow | null
  media: ActivityMediaItem[]
  /** 当前查看者是否已关注（游客恒为 false）。 */
  isFollowed: boolean
}
```

同时把该接口上方注释第 57 行改为：

```
/** 活动详情/列表项（后端 toActivityView）。列表与详情同构，游客 myRegistration=null、isFollowed=false。 */
```

- [ ] **Step 3: PublicUserProfile 增加 isFollowed**

`api/users.ts`：

```ts
/** 公开用户资料（隐私安全字段：id, name, image, createdAt, roles, isFollowed）。 */
export interface PublicUserProfile {
  id: string
  name: string
  image: string | null
  createdAt: string
  roles: string[]
  /** 当前查看者是否已关注该用户（游客恒为 false）。 */
  isFollowed: boolean
}
```

- [ ] **Step 4: 修活动测试工厂的必需字段**

`utils/home.test.ts` 的 `activity()` 工厂，在 `media: [],` 下一行加：

```ts
    isFollowed: false,
```

- [ ] **Step 5: 验证**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\frontend
bun run type-check
```

预期：0 error（`home.test.ts` 的类型缺口已补）。

---

## Task 10: me.vue 菜单改造

**Files:**
- Modify: `frontend/src/pages/me/me.vue`

- [ ] **Step 1: 图标扫描注释补 user-follow**

第 16 行改为：

```ts
// i-carbon-calendar i-carbon-star i-carbon-star-filled i-carbon-user-follow i-carbon-notification i-carbon-trophy i-carbon-receipt
```

- [ ] **Step 2: 替换占位菜单项**

第 107 行：

```ts
    { key: 'favorites', label: '我的收藏', icon: 'i-carbon-star' },
```

改为：

```ts
    { key: 'follows', label: '我的关注', icon: 'i-carbon-user-follow', url: '/pages/follow/index' },
```

> `handleMenuTap` 已有登录校验（未登录 toast「请先登录」）与 `navigateTo` 分支，无需改动。

- [ ] **Step 3: 验证**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\frontend
bun run lint
```

预期：0 problem。

---

## Task 11: 我的关注页（活动/用户双 tab）

**Files:**
- Create: `frontend/src/pages/follow/index.vue`

- [ ] **Step 1: 创建页面**

> 采用与 `pages/points/index.vue` 一致的**自绘 tab 栏**（`flex rounded-3 bg-card p-1` + 选中 `bg-primary text-white`）。原因：全仓库无 `wd-tabs` 使用先例，且当前 `node_modules` 未安装该组件，无法核对 API；自绘可保持「单页双 tab」效果且零组件风险。

```vue
<script lang="ts" setup>
import type { FollowedActivityCard, FollowedUserCard } from '@/api/follow'
import {
  getFollowedActivities,
  getFollowedUsers,
  unfollowActivity,
  unfollowUser,
} from '@/api/follow'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { formatDateTime } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'
import { usePagedList } from '@/utils/use-paged-list'

definePage({
  style: {
    navigationBarTitleText: '我的关注',
  },
})

type FollowTab = 'activity' | 'user'

const TABS: { value: FollowTab, label: string }[] = [
  { value: 'activity', label: '活动' },
  { value: 'user', label: '用户' },
]
const PAGE_SIZE = 10

const auth = useAuthStore()
const activeTab = ref<FollowTab>('activity')
const removingId = ref('')

const {
  items: activityItems,
  loading: activityLoading,
  finished: activityFinished,
  empty: activityEmpty,
  reload: reloadActivities,
  loadMore: loadMoreActivities,
} = usePagedList<FollowedActivityCard>(
  async (page) => {
    const res = await getFollowedActivities(page, PAGE_SIZE)
    return { data: res.data, total: res.pagination.total }
  },
  PAGE_SIZE,
)

const {
  items: userItems,
  loading: userLoading,
  finished: userFinished,
  empty: userEmpty,
  reload: reloadUsers,
  loadMore: loadMoreUsers,
} = usePagedList<FollowedUserCard>(
  async (page) => {
    const res = await getFollowedUsers(page, PAGE_SIZE)
    return { data: res.data, total: res.pagination.total }
  },
  PAGE_SIZE,
)

onShow(() => {
  if (!auth.isLoggedIn) {
    toLoginPage()
    return
  }
  void reloadActivities()
  void reloadUsers()
})

onReachBottom(() => {
  if (activeTab.value === 'activity')
    void loadMoreActivities()
  else
    void loadMoreUsers()
})

function switchTab(value: FollowTab) {
  activeTab.value = value
}

function openActivity(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

function openUser(id: string) {
  uni.navigateTo({ url: `/pages/user-home/index?userId=${id}` })
}

async function removeActivity(id: string) {
  if (removingId.value)
    return
  removingId.value = id
  try {
    await unfollowActivity(id)
    uni.showToast({ title: '已取消关注', icon: 'none' })
    await reloadActivities()
  }
  catch {
    // 错误提示已由请求拦截器统一 toast
  }
  finally {
    removingId.value = ''
  }
}

async function removeUser(id: string) {
  if (removingId.value)
    return
  removingId.value = id
  try {
    await unfollowUser(id)
    uni.showToast({ title: '已取消关注', icon: 'none' })
    await reloadUsers()
  }
  catch {
    // 错误提示已由请求拦截器统一 toast
  }
  finally {
    removingId.value = ''
  }
}
</script>

<template>
  <view class="min-h-screen bg-page px-3 pb-6 pt-3">
    <!-- 双 tab -->
    <view class="flex rounded-3 bg-card p-1 shadow-sm">
      <view
        v-for="t in TABS"
        :key="t.value"
        class="flex-1 rounded-2 py-2 text-center text-4"
        :class="activeTab === t.value ? 'bg-primary text-white font-medium' : 'text-sub'"
        @click="switchTab(t.value)"
      >
        {{ t.label }}
      </view>
    </view>

    <!-- 活动 tab -->
    <view v-if="activeTab === 'activity'" class="pt-3">
      <view
        v-for="a in activityItems"
        :key="a.activityId"
        class="mb-3 overflow-hidden rounded-3 bg-card shadow-sm"
        @click="openActivity(a.activityId)"
      >
        <view class="flex">
          <image
            v-if="a.coverUrl"
            :src="resolveMediaUrl(a.coverUrl)"
            mode="aspectFill"
            class="h-100px w-120px shrink-0 bg-hover"
          />
          <view class="flex-1 p-3">
            <view class="flex items-center">
              <text class="text-4 text-ink font-medium" style="max-width: 320rpx">
                {{ a.title }}
              </text>
              <text
                v-if="a.status === 'cancelled'"
                class="ml-2 shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-3 text-danger"
              >
                已取消
              </text>
            </view>
            <view class="mt-2 flex items-center text-3 text-sub">
              <view class="i-carbon-time mr-1 text-16px text-muted" />
              <text class="ml-1">{{ formatDateTime(a.startTime) }}</text>
            </view>
            <view class="mt-1 flex items-center text-3 text-sub">
              <view class="i-carbon-location mr-1 text-16px text-muted" />
              <text class="ml-1 max-w-300px truncate">{{ a.location.name }}</text>
            </view>
          </view>
          <view
            class="mr-3 mt-3 h-30px w-30px flex shrink-0 items-center justify-center rounded-full bg-hover"
            @click.stop="removeActivity(a.activityId)"
          >
            <view class="i-carbon-star-filled text-4 text-primary" />
          </view>
        </view>
      </view>

      <view
        v-if="activityLoading && !activityItems.length"
        class="py-10 text-center text-3.5 text-muted"
      >
        加载中…
      </view>
      <view v-else-if="activityEmpty" class="flex flex-col items-center py-20">
        <view class="i-carbon-calendar text-48px text-muted" />
        <text class="mt-3 text-3.5 text-muted">暂无关注的活动</text>
      </view>
      <view v-else-if="activityFinished" class="py-6 text-center text-3 text-muted">
        没有更多了
      </view>
    </view>

    <!-- 用户 tab -->
    <view v-else class="pt-3">
      <view
        v-for="u in userItems"
        :key="u.userId"
        class="mb-3 flex items-center rounded-3 bg-card px-4 py-3 shadow-sm"
        @click="openUser(u.userId)"
      >
        <image
          :src="resolveMediaUrl(u.image) || '/static/images/default-avatar.png'"
          class="h-12 w-12 rounded-full bg-hover"
        />
        <text class="ml-3 flex-1 truncate text-4 text-ink">{{ u.name || '-' }}</text>
        <view
          class="h-30px w-30px flex shrink-0 items-center justify-center rounded-full bg-hover"
          @click.stop="removeUser(u.userId)"
        >
          <view class="i-carbon-star-filled text-4 text-primary" />
        </view>
      </view>

      <view
        v-if="userLoading && !userItems.length"
        class="py-10 text-center text-3.5 text-muted"
      >
        加载中…
      </view>
      <view v-else-if="userEmpty" class="flex flex-col items-center py-20">
        <view class="i-carbon-user-avatar text-48px text-muted" />
        <text class="mt-3 text-3.5 text-muted">暂无关注的用户</text>
      </view>
      <view v-else-if="userFinished" class="py-6 text-center text-3 text-muted">
        没有更多了
      </view>
    </view>
  </view>
</template>
```

- [ ] **Step 2: 验证**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\frontend
bun run type-check
bun run lint
```

预期：0 error / 0 problem。

---

## Task 12: 活动详情底栏关注按钮

**Files:**
- Modify: `frontend/src/pages/activity/detail.vue`

- [ ] **Step 1: import 与状态**

在 `import { createTemplateFromActivity } from '@/api/activity-template'` 之后插入：

```ts
import { followActivity, unfollowActivity } from '@/api/follow'
```

在 `const acting = ref(false)` 之后插入：

```ts
const following = ref(false)
const followActing = ref(false)
```

- [ ] **Step 2: load() 同步关注状态**

把 `load()` 的 try 块改为：

```ts
  try {
    detail.value = await getActivity(activityId.value)
    following.value = detail.value.isFollowed
  }
```

- [ ] **Step 3: 新增切换函数（放在 `ensureLogin` 之后）**

```ts
/** 关注/取关：乐观更新，失败回滚；游客先引导登录。 */
async function toggleFollow() {
  const current = detail.value
  if (!current || followActing.value)
    return
  if (!ensureLogin())
    return
  const next = !following.value
  following.value = next
  followActing.value = true
  try {
    const res = next
      ? await followActivity(current.id)
      : await unfollowActivity(current.id)
    following.value = res.followed
    current.isFollowed = res.followed
    uni.showToast({ title: res.followed ? '已关注' : '已取消关注', icon: 'none' })
  }
  catch {
    // 回滚（错误 toast 由拦截器负责）
    following.value = !next
    current.isFollowed = !next
  }
  finally {
    followActing.value = false
  }
}
```

- [ ] **Step 4: 模板插入按钮**

在分享按钮 `</view>`（第 588 行）之后、`<!-- 游客 -->` 之前插入：

```html
      <!-- 关注入口（游客点击引导登录） -->
      <view
        class="mr-2 h-44px w-44px flex shrink-0 flex-col items-center justify-center border rounded-2"
        :class="following
          ? 'border-primary bg-primary-soft text-primary-soft-text'
          : 'border-line-strong text-sub'"
        @click="toggleFollow"
      >
        <view class="text-18px" :class="following ? 'i-carbon-star-filled' : 'i-carbon-star'" />
        <text class="mt-0.5 text-2.5">{{ following ? '已关注' : '关注' }}</text>
      </view>
```

- [ ] **Step 5: 验证**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\frontend
bun run type-check
bun run lint
```

预期：0 error / 0 problem。

---

## Task 13: 他人主页关注按钮

**Files:**
- Modify: `frontend/src/pages/user-home/index.vue`

- [ ] **Step 1: import 与状态**

在 `import { listMyRegistrations } from '@/api/activity'` 之后插入：

```ts
import { followUser, unfollowUser } from '@/api/follow'
```

在 `import type { PublicUserProfile } from '@/api/users'` 之后插入：

```ts
import { toLoginPage } from '@/utils/toLoginPage'
```

在 `const profileError = ref(false)` 之后插入：

```ts
const following = ref(false)
const followActing = ref(false)
```

- [ ] **Step 2: self 模式构造对象补字段**

`loadProfile` 中 self 分支的对象补一行：

```ts
      profileUser.value = {
        id: auth.user.id,
        name: auth.user.name,
        image: auth.user.image ?? null,
        createdAt: auth.user.createdAt,
        roles: auth.user.roles,
        isFollowed: false,
      }
```

- [ ] **Step 3: loadProfile 末尾同步关注状态**

在 `loadProfile` 的 `finally` 之前（`profileLoading.value = false` 之前）插入：

```ts
    following.value = profileUser.value?.isFollowed ?? false
```

并把 self 分支下方注释补一句：`// 自己模式不展示关注按钮，isFollowed 恒为 false`。

- [ ] **Step 4: 新增切换函数（放在 `loadProfile` 之后）**

```ts
/** 关注/取关他人：乐观更新，失败回滚；游客先引导登录。 */
async function toggleFollow() {
  const id = targetUserId.value
  if (isOwnProfile.value || !id || followActing.value)
    return
  if (!auth.isLoggedIn) {
    toLoginPage()
    return
  }
  const next = !following.value
  following.value = next
  followActing.value = true
  try {
    const res = next
      ? await followUser(id)
      : await unfollowUser(id)
    following.value = res.followed
    uni.showToast({ title: res.followed ? '已关注' : '已取消关注', icon: 'none' })
  }
  catch {
    // 回滚（错误 toast 由拦截器负责）
    following.value = !next
  }
  finally {
    followActing.value = false
  }
}
```

- [ ] **Step 5: 模板插入按钮**

把基本信息卡右上角（第 248-253 行）的分享按钮块：

```html
          <view
            class="h-8 w-8 flex shrink-0 items-center justify-center rounded-full bg-hover text-muted"
            @click="openShare"
          >
            <view class="i-carbon-share text-4" />
          </view>
```

替换为：

```html
          <view class="flex shrink-0 items-center">
            <view
              v-if="!isOwnProfile"
              class="mr-2 h-8 flex items-center rounded-full px-3 text-3.5"
              :class="following ? 'bg-hover text-sub' : 'bg-primary text-white'"
              @click="toggleFollow"
            >
              {{ following ? '已关注' : '关注' }}
            </view>
            <view
              class="h-8 w-8 flex items-center justify-center rounded-full bg-hover text-muted"
              @click="openShare"
            >
              <view class="i-carbon-share text-4" />
            </view>
          </view>
```

- [ ] **Step 6: 验证**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\frontend
bun run type-check
bun run lint
```

预期：0 error / 0 problem。

---

## Task 14: 前端质量门禁与端到端自查

**Files:** 无（仅验证）

- [ ] **Step 1: 三道门禁全绿**

```powershell
cd d:\projects\zhongailianmeng\zalm-code\frontend
bun run type-check
bun run lint
bun run test:run
```

预期：type-check 0 error；lint 0 problem（可 `bun run lint:fix`）；vitest 全 PASS。

- [ ] **Step 2: H5 手工验收清单**

启动双端（`backend: bun run dev` / `frontend: bun run dev:h5`，H5 地址 `http://localhost:3333/h5/`，hash 路由）：

1. 「我的」→「我的关注」→ 进入双 tab 页；未登录时被引导到登录页（`toLoginPage`）。
2. 活动详情底栏出现「关注」按钮（空心星）→ 点击变「已关注」（实心星，主题色）；退出重进详情页状态保持。
3. 再次点击变为「关注」，`GET /api/follows?type=activity` 不再含该活动。
4. 他人主页（积分榜点他人头像进入）顶部出现「关注」→ 点击变「已关注」灰底；自己主页不显示该按钮。
5. 「我的关注」活动 tab 卡片点击进详情；右侧星标点击后卡片消失并 toast「已取消关注」。
6. 用户 tab 卡片点击进 `/pages/user-home/index?userId=...`；取关后卡片消失。
7. 游客在活动详情点击「关注」跳登录页，不出现裸 401 toast。

---

## Self-Review 检查表（计划完成后核对）

- [x] 规格 §3 数据模型（单表多态、唯一索引、user_id 级联）→ Task 1
- [x] 规格 §4.1 四个写端点（404/422/幂等）→ Task 5 + Task 6
- [x] 规格 §4.2 两个读列表（inner join 过滤孤儿/封禁、按关注时间倒序）→ Task 4 + Task 6
- [x] 规格 §4.3 详情附带 `isFollowed` + `isSoftSessionPath` 登记 `/api/users/**` → Task 7
- [x] 规格 §4.4 限流（计划修正为独立 follow 档 30/min，而非复用 sensitive 10/min）→ Task 2
- [x] 规格 §5.1-§5.5 前端五处改动 → Task 9-13
- [x] 规格 §6 错误处理（401/422/404/幂等/回滚）→ Task 5 + Task 12/13 的 catch 回滚
- [x] 规格 §7 测试策略（计划修正为 schema/限流/路径纯函数单测，不新建 DB 测试基座）→ Task 2/3/7
- [x] 规格 §8 YAGNI（无通知/粉丝数/feed/后台管理页）→ 计划未包含
- [x] 链接参数修正：用户主页跳转一律 `?userId=`（规格 §5.2 原写 `?id=`）
- [x] tab 组件修正：自绘 tab 栏替代 `wd-tabs`（避免未安装组件的 API 风险）
