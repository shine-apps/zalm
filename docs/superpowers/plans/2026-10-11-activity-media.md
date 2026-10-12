# 活动相册（Activity Media）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 活动组织者可在 App 内为活动上传照片/视频并附选填描述，访客在活动详情页「活动相册」浏览。

**Architecture:** 新建 `activity_media` 关联表连接 `activity` 与既有 `media_file`（COS 直传登记表），写操作挂 `/api/activities/[id]/media/**` 并复用 `requireAnyRole(ACTIVITY_ORGANIZER_ROLES)` 与 `ref_count` 护栏；前端复用 `media-uploader` 上传链路，新增独立管理页 + 详情页九宫格相册区块。

**Tech Stack:** Nuxt 4 / Drizzle ORM / Zod 4 / Vitest（backend），unibest uniapp + Vue3 + UnoCSS（frontend）。

**Spec:** `docs/superpowers/specs/2026-10-11-activity-media-design.md`

**提交策略:** 按 AGENTS.md §11「不自动创建 commit」，本计划不含 commit 步骤；每个任务以门禁/测试通过为完成标志，仅在用户明确要求时提交。

**全局注意事项:**
- PowerShell 用 `;` 串联命令，不要用 `&&`。
- bun 输出进度到 stderr 可能报红色 NativeCommandError 噪音，**以退出码为准**。
- 前端 GET 缓存已全局置 0（[alova.ts:88](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/http/alova.ts#L88)），无需逐接口设 `cacheFor`。
- `src/pages.json` 是生成物，新页面只需在 `src/pages/` 下用 `definePage` 声明。

---

## 文件结构总览

| 操作 | 文件 | 职责 |
|---|---|---|
| Modify | `backend/server/database/schema.ts` | 新增 `activity_media` 表 |
| Modify | `backend/server/schemas/activity.ts` | 绑定/改描述的 Zod schema + 嵌套参数 schema |
| Modify | `backend/server/schemas/activity.test.ts` | schema 单测 |
| Create | `backend/server/database/repositories/activity-media.ts` | 关联表数据访问（join/增删改） |
| Create | `backend/server/utils/activity-media.ts` | 纯映射：关联行+媒体行 → 视图项（字段裁剪） |
| Create | `backend/server/utils/activity-media.test.ts` | 映射单测（无 DB 依赖） |
| Modify | `backend/server/utils/activity-service.ts` | 详情组装 media + 三个写操作服务 |
| Create | `backend/server/api/activities/[id]/media/index.post.ts` | 绑定 |
| Create | `backend/server/api/activities/[id]/media/[mediaId].patch.ts` | 改描述 |
| Create | `backend/server/api/activities/[id]/media/[mediaId].delete.ts` | 解绑 |
| Modify | `frontend/src/api/activity.ts` | `ActivityMediaItem` 类型 + 3 个 API 封装 |
| Create | `frontend/src/pages/activity/media.vue` | 组织者媒体管理页 |
| Modify | `frontend/src/pages/activity/edit.vue` | 「管理活动相册」入口 |
| Modify | `frontend/src/pages/activity/detail.vue` | 详情页相册区块 + 视频弹层 |

---

### Task 1: 后端表结构与迁移

**Files:**
- Modify: `backend/server/database/schema.ts`（`activityRegistration` 定义之后、Better Auth 导出之前）

- [ ] **Step 1: 在 schema.ts 中新增 activity_media 表**

在 `activityRegistration` 表定义之后追加（`unique`、`text`、`timestamp`、`jsonb` 等 import 已存在，无需新增 import；`mediaFile` 在同文件上方已定义）：

```ts
/**
 * 活动相册关联：一个活动挂多条媒体（image/video），每条带选填描述。
 * (activity_id, media_id) 唯一防重复挂载；删活动级联清理，删媒体被 restrict 拦截（配合 ref_count 护栏）。
 */
export const activityMedia = pgTable(
  'activity_media',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    activityId: text('activity_id')
      .notNull()
      .references(() => activity.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaFile.id, { onDelete: 'restrict' }),
    description: text('description').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [unique('activity_media_activity_media_unique').on(t.activityId, t.mediaId)]
)
```

- [ ] **Step 2: 生成并执行迁移**

Run（在 `backend/`）:

```powershell
bun run db:generate
bun run db:migrate
```

Expected: `db:generate` 在 `drizzle/` 下生成新序号 SQL（如 `0001_*.sql`，内含 `CREATE TABLE "activity_media"` 与唯一索引）；`db:migrate` 正常退出（退出码 0）。

- [ ] **Step 3: 确认生成的迁移被提交范围覆盖**

Run: `git status`

Expected: 变更含 `backend/server/database/schema.ts` 与 `backend/drizzle/000*.sql`（生成的 SQL 必须随代码一起入库，见 AGENTS.md §7.3）。

---

### Task 2: Zod schema（TDD）

**Files:**
- Test: `backend/server/schemas/activity.test.ts`
- Modify: `backend/server/schemas/activity.ts`

- [ ] **Step 1: 写失败测试**

在 `activity.test.ts` 顶部 import 中追加 `activityMediaBindBodySchema`、`activityMediaUpdateBodySchema`，文件末尾追加：

```ts
describe('activityMediaBindBodySchema', () => {
  const mediaId = '123e4567-e89b-42d3-a456-426614174000'

  it('accepts mediaId without description (defaults to empty)', () => {
    const parsed = activityMediaBindBodySchema.parse({ mediaId })
    expect(parsed.description).toBe('')
  })

  it('accepts an optional description within 200 chars', () => {
    const parsed = activityMediaBindBodySchema.parse({ mediaId, description: '现场合影' })
    expect(parsed.description).toBe('现场合影')
  })

  it('rejects missing or non-uuid mediaId', () => {
    expect(activityMediaBindBodySchema.safeParse({}).success).toBe(false)
    expect(activityMediaBindBodySchema.safeParse({ mediaId: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects description over 200 chars and unknown fields', () => {
    expect(
      activityMediaBindBodySchema.safeParse({ mediaId, description: 'x'.repeat(201) }).success,
    ).toBe(false)
    expect(activityMediaBindBodySchema.safeParse({ mediaId, extra: 1 }).success).toBe(false)
  })
})

describe('activityMediaUpdateBodySchema', () => {
  it('accepts empty description (clearing)', () => {
    expect(activityMediaUpdateBodySchema.parse({ description: '' }).description).toBe('')
  })

  it('rejects missing or overlong description', () => {
    expect(activityMediaUpdateBodySchema.safeParse({}).success).toBe(false)
    expect(
      activityMediaUpdateBodySchema.safeParse({ description: 'x'.repeat(201) }).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `backend/`）: `bunx vitest run server/schemas/activity.test.ts`

Expected: FAIL，报 `activityMediaBindBodySchema is not a function` / 导入错误。

- [ ] **Step 3: 实现 schema**

在 `schemas/activity.ts` 的 `activityIdParamSchema` 定义之后追加：

```ts
/** 相册描述：选填，≤200 字（绑定时缺省为空串，更新时必填但允许空串清空）。 */
const activityMediaDescriptionSchema = z.string().max(200, '描述不能超过 200 字')

export const activityMediaBindBodySchema = z
  .object({
    mediaId: z.string().uuid(),
    description: activityMediaDescriptionSchema.default('')
  })
  .strict()

export const activityMediaUpdateBodySchema = z
  .object({
    description: activityMediaDescriptionSchema
  })
  .strict()

/** 嵌套路由参数：/activities/:id/media/:mediaId */
export const activityMediaParamsSchema = z.object({
  id: z.string().uuid(),
  mediaId: z.string().uuid()
})

export type ActivityMediaBindBody = z.infer<typeof activityMediaBindBodySchema>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bunx vitest run server/schemas/activity.test.ts`

Expected: PASS（原有用例 + 新增 6 个全部通过）。

---

### Task 3: 纯映射层 toActivityMediaView（TDD）

**Files:**
- Create: `backend/server/utils/activity-media.test.ts`
- Create: `backend/server/utils/activity-media.ts`

设计意图：详情视图组装放 `activity-service`，但映射函数拆到独立纯模块，使单测无需引入 DB 连接（`activity-service` 运行时 import `database/client`）。

- [ ] **Step 1: 写失败测试**

创建 `backend/server/utils/activity-media.test.ts`：

```ts
import type { ActivityMediaWithFile } from '../database/repositories/activity-media'
import { describe, expect, it } from 'vitest'
import { toActivityMediaView } from './activity-media'

const baseRow: ActivityMediaWithFile = {
  link: {
    id: 'link-1',
    activityId: 'act-1',
    mediaId: 'media-1',
    description: '现场合影',
    createdAt: new Date('2026-10-11T08:00:00.000Z'),
  },
  media: {
    id: 'media-1',
    url: 'https://bucket.cos.ap-guangzhou.myqcloud.com/activity/image/a.jpg',
    type: 'image',
    refCount: 1,
    metadata: {
      key: 'activity/image/a.jpg',
      bucket: 'bucket',
      region: 'ap-guangzhou',
      width: 1280,
      height: 720,
      size: 12345,
    },
    createdAt: new Date('2026-10-11T07:00:00.000Z'),
  },
}

describe('toActivityMediaView', () => {
  it('projects only whitelisted fields (no COS internals)', () => {
    const view = toActivityMediaView(baseRow)
    expect(view).toEqual({
      id: 'link-1',
      url: 'https://bucket.cos.ap-guangzhou.myqcloud.com/activity/image/a.jpg',
      type: 'image',
      description: '现场合影',
      width: 1280,
      height: 720,
      createdAt: '2026-10-11T08:00:00.000Z',
    })
    expect(view).not.toHaveProperty('metadata')
    expect(view).not.toHaveProperty('refCount')
    expect(view).not.toHaveProperty('mediaId')
  })

  it('omits optional dimension/duration keys when metadata lacks them', () => {
    const view = toActivityMediaView({
      ...baseRow,
      media: { ...baseRow.media, metadata: { name: 'v.mp4', duration: 42 } },
    })
    expect(view.width).toBeUndefined()
    expect(view.duration).toBe(42)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `backend/`）: `bunx vitest run server/utils/activity-media.test.ts`

Expected: FAIL，`Cannot find module './activity-media'`。

- [ ] **Step 3: 实现映射模块**

创建 `backend/server/utils/activity-media.ts`：

```ts
import type { ActivityMediaWithFile } from '../database/repositories/activity-media'

/** 活动相册项（GET /api/activities/:id 的 media 元素；前端 ActivityMediaItem 对齐）。 */
export interface ActivityMediaItemView {
  id: string
  url: string
  type: 'image' | 'video'
  description: string
  duration?: number
  width?: number
  height?: number
  createdAt: string
}

/**
 * 关联行 + 媒体行 → 相册视图项。
 * 只暴露白名单字段，不泄漏 media_file.metadata 内的 COS key/bucket/etag 等内部信息；
 * 排序（created_at 倒序）在 repository 的 SQL 层完成。
 */
export function toActivityMediaView(row: ActivityMediaWithFile): ActivityMediaItemView {
  const { width, height, duration } = row.media.metadata
  return {
    id: row.link.id,
    url: row.media.url,
    type: row.media.type as 'image' | 'video',
    description: row.link.description,
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
    ...(duration !== undefined && { duration }),
    createdAt: row.link.createdAt.toISOString(),
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bunx vitest run server/utils/activity-media.test.ts`

Expected: PASS（2 个用例）。

---

### Task 4: activity-media repository

**Files:**
- Create: `backend/server/database/repositories/activity-media.ts`

- [ ] **Step 1: 实现 repository**

```ts
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../client'
import { activityMedia, mediaFile } from '../schema'

export type ActivityMediaRow = typeof activityMedia.$inferSelect

/** 关联行 + 媒体行（join 结果，供映射层裁剪）。 */
export interface ActivityMediaWithFile {
  link: ActivityMediaRow
  media: typeof mediaFile.$inferSelect
}

/** 某活动的相册列表，created_at 倒序（详情/管理页共用）。 */
export async function listActivityMedia(activityId: string): Promise<ActivityMediaWithFile[]> {
  const rows = await db
    .select()
    .from(activityMedia)
    .innerJoin(mediaFile, eq(activityMedia.mediaId, mediaFile.id))
    .where(eq(activityMedia.activityId, activityId))
    .orderBy(desc(activityMedia.createdAt))
  return rows.map(r => ({ link: r.activity_media, media: r.media_file }))
}

export async function getActivityMediaRow(
  activityId: string,
  mediaId: string
): Promise<ActivityMediaRow | null> {
  const rows = await db
    .select()
    .from(activityMedia)
    .where(and(eq(activityMedia.activityId, activityId), eq(activityMedia.mediaId, mediaId)))
    .limit(1)
  return rows[0] ?? null
}

export async function insertActivityMedia(input: {
  activityId: string
  mediaId: string
  description: string
}): Promise<ActivityMediaRow> {
  const rows = await db.insert(activityMedia).values(input).returning()
  return rows[0]!
}

export async function updateActivityMediaDescription(
  activityId: string,
  mediaId: string,
  description: string
): Promise<ActivityMediaRow | null> {
  const rows = await db
    .update(activityMedia)
    .set({ description })
    .where(and(eq(activityMedia.activityId, activityId), eq(activityMedia.mediaId, mediaId)))
    .returning()
  return rows[0] ?? null
}

export async function deleteActivityMediaRow(
  activityId: string,
  mediaId: string
): Promise<ActivityMediaRow | null> {
  const rows = await db
    .delete(activityMedia)
    .where(and(eq(activityMedia.activityId, activityId), eq(activityMedia.mediaId, mediaId)))
    .returning()
  return rows[0] ?? null
}
```

- [ ] **Step 2: 类型检查**

Run（在 `backend/`）: `bun run typecheck`

Expected: 0 error（此时 service 尚未引用，仅新文件自身类型正确）。

---

### Task 5: activity-service 扩展（详情组装 + 三个写操作）

**Files:**
- Modify: `backend/server/utils/activity-service.ts`

- [ ] **Step 1: 追加 import**

文件顶部 import 区追加：

```ts
import type { ActivityMediaBindBody } from '../schemas/activity'
import {
  deleteActivityMediaRow,
  getActivityMediaRow,
  insertActivityMedia,
  listActivityMedia,
  updateActivityMediaDescription,
} from '../database/repositories/activity-media'
import { adjustRefCount, getMediaFileById } from '../database/repositories/media'
import { toActivityMediaView, type ActivityMediaItemView } from './activity-media'
```

- [ ] **Step 2: toActivityView 增加 media 参数**

将 `toActivityView` 函数签名与返回值改为（其余字段不动）：

```ts
function toActivityView(
  activity: ActivityRow,
  stat: { registeredCount: number, checkedInCount: number },
  now: Date,
  myRegistration: RegistrationRow | null,
  media: ActivityMediaItemView[] = []
) {
  return {
    // ...原有字段保持不变...
    registeredCount: stat.registeredCount,
    checkedInCount: stat.checkedInCount,
    remaining: remaining(activity.capacity, stat.registeredCount),
    myRegistration,
    media,
  }
}
```

说明：列表接口（`listActivityView` / `listMineView`）不传 media，默认 `[]`（列表页不展示相册）；详情接口传全量。

- [ ] **Step 3: 详情组装 media**

修改 `getActivityDetail`：

```ts
export async function getActivityDetail(
  id: string,
  viewerId: string | null,
  now: Date = new Date()
) {
  const activity = await requireActivity(id)
  const [stat, mediaRows] = await Promise.all([
    getActivityStat(id),
    listActivityMedia(id),
  ])
  const myRegistration = viewerId ? await getRegistration(id, viewerId) : null
  return toActivityView(activity, stat, now, myRegistration, mediaRows.map(toActivityMediaView))
}
```

- [ ] **Step 4: 追加三个写操作服务**

文件末尾（`listMineView` 之后）追加：

```ts
// ===== 相册（组织者写操作） =====

export async function bindActivityMedia(activityId: string, input: ActivityMediaBindBody) {
  await requireActivity(activityId)

  const media = await getMediaFileById(input.mediaId)
  if (!media) throw createApiError('NOT_FOUND', { message: '媒体不存在' })
  if (media.type !== 'image' && media.type !== 'video') {
    throw createApiError('VALIDATION_ERROR', { message: '仅支持图片或视频入相册' })
  }

  const existing = await getActivityMediaRow(activityId, media.id)
  if (existing) throw createApiError('CONFLICT', { message: '该媒体已挂载到此活动' })

  const link = await insertActivityMedia({
    activityId,
    mediaId: media.id,
    description: input.description,
  })
  await adjustRefCount(media.id, 1)
  return toActivityMediaView({ link, media })
}

export async function setActivityMediaDescription(
  activityId: string,
  mediaId: string,
  description: string
) {
  await requireActivity(activityId)
  const link = await updateActivityMediaDescription(activityId, mediaId, description)
  if (!link) throw createApiError('NOT_FOUND', { message: '相册项不存在' })
  const media = await getMediaFileById(mediaId)
  // link 存在即 FK 成立（media_id references media_file），media 必不为 null
  return toActivityMediaView({ link, media: media! })
}

export async function removeActivityMedia(activityId: string, mediaId: string) {
  await requireActivity(activityId)
  const link = await deleteActivityMediaRow(activityId, mediaId)
  if (!link) throw createApiError('NOT_FOUND', { message: '相册项不存在' })
  // media_file 行保留，孤儿文件由 ref_count 护栏体系（admin 媒体管理）兜底
  await adjustRefCount(mediaId, -1)
}
```

- [ ] **Step 5: 类型检查**

Run: `bun run typecheck`

Expected: 0 error。

---

### Task 6: 三个 API 路由 + 后端门禁

**Files:**
- Create: `backend/server/api/activities/[id]/media/index.post.ts`
- Create: `backend/server/api/activities/[id]/media/[mediaId].patch.ts`
- Create: `backend/server/api/activities/[id]/media/[mediaId].delete.ts`

注：`requireAnyRole`、`ACTIVITY_ORGANIZER_ROLES`、`parseParams`、`parseBody`、`ok`、`bindActivityMedia` 等由 Nuxt 自动导入（与 `[id].put.ts` 一致），仅 schema 需显式 import。

- [ ] **Step 1: 绑定路由**

创建 `backend/server/api/activities/[id]/media/index.post.ts`：

```ts
import { activityIdParamSchema, activityMediaBindBodySchema } from '../../../../schemas/activity'

/** 绑定媒体到活动相册（activity_admin 或 admin）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id } = parseParams(event, activityIdParamSchema)
  const body = await parseBody(event, activityMediaBindBodySchema)
  const item = await bindActivityMedia(id, body)
  return ok(item, '已添加到活动相册')
})
```

- [ ] **Step 2: 改描述路由**

创建 `backend/server/api/activities/[id]/media/[mediaId].patch.ts`：

```ts
import { activityMediaParamsSchema, activityMediaUpdateBodySchema } from '../../../../schemas/activity'

/** 更新相册项描述（activity_admin 或 admin；空串清空）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id, mediaId } = parseParams(event, activityMediaParamsSchema)
  const body = await parseBody(event, activityMediaUpdateBodySchema)
  const item = await setActivityMediaDescription(id, mediaId, body.description)
  return ok(item, '描述已更新')
})
```

- [ ] **Step 3: 解绑路由**

创建 `backend/server/api/activities/[id]/media/[mediaId].delete.ts`：

```ts
import { activityMediaParamsSchema } from '../../../../schemas/activity'

/** 移除相册项（activity_admin 或 admin；media_file 保留，ref_count 归还）。 */
export default defineEventHandler(async (event) => {
  requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)
  const { id, mediaId } = parseParams(event, activityMediaParamsSchema)
  await removeActivityMedia(id, mediaId)
  return ok(null, '已从相册移除')
})
```

- [ ] **Step 4: 后端全量门禁**

Run（在 `backend/`）:

```powershell
bun run typecheck; bun run lint; bun run test
```

Expected: 三者退出码均为 0（typecheck 0 error、lint 0 problem、vitest 全过含新增用例）。

---

### Task 7: 前端类型与 API 封装

**Files:**
- Modify: `frontend/src/api/activity.ts`

- [ ] **Step 1: 新增类型与 ActivityView.media**

在 `ActivityView` 接口之前新增：

```ts
/** 活动相册项（后端 toActivityMediaView 裁剪后的白名单字段）。 */
export interface ActivityMediaItem {
  id: string
  url: string
  type: 'image' | 'video'
  description: string
  duration?: number
  width?: number
  height?: number
  createdAt: string
}
```

在 `ActivityView` 的 `myRegistration` 字段后追加：

```ts
  media: ActivityMediaItem[]
```

- [ ] **Step 2: 追加三个 API 封装**

在「组织者」区块末尾（`manualCheckIn` 之后）追加：

```ts
// ===== 相册（组织者） =====

/** 绑定媒体到活动相册（重复 409、类型不符 422，拦截器 toast）。 */
export function bindActivityMedia(
  id: string,
  payload: { mediaId: string, description?: string },
): Promise<ActivityMediaItem> {
  return http.Post(`/activities/${id}/media`, payload) as unknown as Promise<ActivityMediaItem>
}

/** 更新相册项描述（空串清空）。 */
export function updateActivityMedia(
  id: string,
  mediaId: string,
  description: string,
): Promise<ActivityMediaItem> {
  return http.Patch(`/activities/${id}/media/${mediaId}`, { description }) as unknown as Promise<ActivityMediaItem>
}

/** 移除相册项（媒体文件保留）。 */
export function removeActivityMedia(id: string, mediaId: string): Promise<void> {
  return http.Delete(`/activities/${id}/media/${mediaId}`) as unknown as Promise<void>
}
```

- [ ] **Step 3: 类型检查**

Run（在 `frontend/`）: `bun run type-check`

Expected: 0 error（`http.Patch` / `http.Delete` 为 alova 实例标准方法，若类型缺失会在此暴露）。

---

### Task 8: 组织者媒体管理页

**Files:**
- Create: `frontend/src/pages/activity/media.vue`

- [ ] **Step 1: 创建页面**

```vue
<script lang="ts" setup>
import type { ActivityMediaItem } from '@/api/activity'
import type { MediaItem } from '@/api/media'
import { bindActivityMedia, getActivity, removeActivityMedia, updateActivityMedia } from '@/api/activity'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '活动相册',
  },
})

const auth = useAuthStore()
const activityId = ref('')
const media = ref<ActivityMediaItem[]>([])
const loading = ref(false)

const imageUploader = ref<{ trigger: () => void, reset: () => void } | null>(null)
const videoUploader = ref<{ trigger: () => void, reset: () => void } | null>(null)

/** 已尝试绑定的媒体 id（change 事件随进度深监听高频触发，防止重复提交）。 */
const processedIds = new Set<string>()
/** 服务端已保存的描述快照（失焦时无变化则跳过 PATCH）。 */
const savedDescriptions = new Map<string, string>()

async function load() {
  if (!activityId.value)
    return
  loading.value = true
  try {
    const a = await getActivity(activityId.value)
    media.value = a.media
    savedDescriptions.clear()
    for (const item of a.media)
      savedDescriptions.set(item.id, item.description)
  }
  catch {
    // 拦截器已提示
  }
  finally {
    loading.value = false
  }
}

/**
 * 上传完成即绑定：等本轮全部上传结束（无 uploading）后批量 POST，
 * 成功后重置 uploader 暂存区并刷新列表（列表才是带描述的正式视图）。
 * 存在失败项时保留暂存区供重试（与列表暂时重复显示，重试成功后自愈）。
 */
async function onUploadChange(items: MediaItem[]) {
  if (items.some(i => i.status === 'uploading'))
    return
  let attempted = false
  for (const item of items) {
    if (item.status !== 'done' || item.id.startsWith('local-') || processedIds.has(item.id))
      continue
    processedIds.add(item.id)
    attempted = true
    try {
      await bindActivityMedia(activityId.value, { mediaId: item.id, description: '' })
    }
    catch {
      // 409（已挂载）静默；其余错误拦截器已 toast
    }
  }
  if (!items.some(i => i.status === 'error')) {
    imageUploader.value?.reset()
    videoUploader.value?.reset()
    processedIds.clear()
  }
  if (attempted)
    await load()
}

function onBlurDescription(item: ActivityMediaItem) {
  if (savedDescriptions.get(item.id) === item.description)
    return
  void saveDescription(item)
}

async function saveDescription(item: ActivityMediaItem) {
  try {
    await updateActivityMedia(activityId.value, item.id, item.description)
    savedDescriptions.set(item.id, item.description)
    uni.showToast({ title: '描述已保存', icon: 'none' })
  }
  catch {
    await load() // 失败回滚到服务端值
  }
}

function confirmRemove(item: ActivityMediaItem) {
  uni.showModal({
    title: '移除媒体',
    content: item.description
      ? `将从相册移除「${item.description}」，媒体文件保留。`
      : '确定从相册中移除该媒体吗？',
    confirmText: '移除',
    confirmColor: '#ef4444',
    success: (res) => {
      if (res.confirm)
        void doRemove(item)
    },
  })
}

async function doRemove(item: ActivityMediaItem) {
  try {
    await removeActivityMedia(activityId.value, item.id)
    uni.showToast({ title: '已移除', icon: 'none' })
    await load()
  }
  catch {
    // 拦截器已提示
  }
}

onLoad((options) => {
  if (!auth.canManageActivity) {
    uni.showToast({ title: '没有管理活动的权限', icon: 'none' })
    toLoginPage({ mode: 'reLaunch', redirect: null })
    return
  }
  activityId.value = options?.id ?? ''
  void load()
})
</script>

<template>
  <view class="min-h-screen bg-page px-3 py-3">
    <!-- 说明 -->
    <view class="rounded-3 bg-card p-4 shadow-sm">
      <text class="text-4 text-ink font-medium">上传活动照片或视频</text>
      <text class="mt-1 block text-3 text-muted">
        上传完成即自动加入相册，可为每条媒体添加描述；图片与视频将展示在活动详情页「活动相册」。
      </text>
    </view>

    <!-- 图片上传 -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <text class="text-4 text-ink font-medium">照片</text>
      <view class="mt-2">
        <media-uploader
          ref="imageUploader"
          type="image"
          multiple
          @change="onUploadChange"
        />
      </view>
    </view>

    <!-- 视频上传 -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <text class="text-4 text-ink font-medium">视频</text>
      <view class="mt-2">
        <media-uploader
          ref="videoUploader"
          type="video"
          :max-count="9"
          @change="onUploadChange"
        />
      </view>
    </view>

    <!-- 媒体列表（时间倒序） -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <view class="flex items-center">
        <text class="text-4 text-ink font-medium">相册内容</text>
        <text class="ml-auto text-3 text-muted">{{ media.length }} 项</text>
      </view>

      <view v-if="loading && !media.length" class="py-8 text-center text-3.5 text-muted">
        加载中…
      </view>
      <view v-else-if="!media.length" class="py-8 text-center text-3.5 text-muted">
        还没有相册内容，用上方上传区添加
      </view>

      <view v-for="item in media" :key="item.id" class="mt-3 flex items-start gap-3">
        <view
          class="h-80px w-100px shrink-0 overflow-hidden rounded-2"
          :class="item.type === 'video' ? 'bg-black' : 'bg-hover'"
        >
          <image
            v-if="item.type === 'image'"
            :src="resolveMediaUrl(item.url)"
            mode="aspectFill"
            class="h-full w-full"
          />
          <view v-else class="h-full w-full center">
            <view class="i-carbon-video text-20px text-white/80" />
          </view>
        </view>
        <view class="min-w-0 flex-1">
          <view class="flex items-center">
            <text class="text-3 text-muted">{{ item.type === 'video' ? '视频' : '图片' }}</text>
            <text
              class="i-carbon-trash-can ml-auto text-16px text-muted"
              @click="confirmRemove(item)"
            />
          </view>
          <input
            v-model="item.description"
            :maxlength="200"
            placeholder="添加描述（选填，最多 200 字）"
            class="mt-1 h-36px rounded-2 bg-hover px-2 text-3.5 text-ink"
            @blur="onBlurDescription(item)"
          />
        </view>
      </view>
    </view>
  </view>
</template>
```

- [ ] **Step 2: 类型检查**

Run（在 `frontend/`）: `bun run type-check`

Expected: 0 error。新页面由 pages 插件自动扫描注册，`src/pages.json` 在 dev/build 时自动更新，**不要手改**。

---

### Task 9: 编辑页入口

**Files:**
- Modify: `frontend/src/pages/activity/edit.vue`

- [ ] **Step 1: script 追加跳转函数**

在 `onSubmit` 函数之前追加：

```ts
// —— 相册管理（仅编辑模式：新活动尚无 id）——
function goMedia() {
  uni.navigateTo({ url: `/pages/activity/media?id=${editingId.value}` })
}
```

- [ ] **Step 2: template 追加入口按钮**

在底部 `<button ... @click="onSubmit">` 之前插入：

```html
    <!-- 相册管理入口（编辑模式） -->
    <view
      v-if="editingId"
      class="mt-4 flex items-center rounded-3 bg-card p-4 shadow-sm"
      @click="goMedia"
    >
      <view class="i-carbon-image text-16px text-muted" />
      <text class="ml-2 text-4 text-ink">管理活动相册</text>
      <text class="ml-auto text-3 text-muted">照片 / 视频</text>
      <view class="i-carbon-chevron-right ml-2 text-16px text-muted" />
    </view>
```

- [ ] **Step 3: 类型检查**

Run: `bun run type-check`

Expected: 0 error。

---

### Task 10: 详情页相册区块

**Files:**
- Modify: `frontend/src/pages/activity/detail.vue`

- [ ] **Step 1: script 追加相册逻辑**

import 区将 `import type { ActivityView } from '@/api/activity'` 改为：

```ts
import type { ActivityMediaItem, ActivityView } from '@/api/activity'
```

在 `progressPercent` 计算之前追加：

```ts
// —— 活动相册 ——
const GALLERY_PREVIEW_LIMIT = 12
const galleryExpanded = ref(false)
const playingVideo = ref<ActivityMediaItem | null>(null)

const galleryImages = computed(() =>
  (detail.value?.media ?? []).filter(m => m.type === 'image'),
)
const galleryShown = computed(() => {
  const list = detail.value?.media ?? []
  return galleryExpanded.value ? list : list.slice(0, GALLERY_PREVIEW_LIMIT)
})

function previewImage(current: ActivityMediaItem) {
  uni.previewImage({
    urls: galleryImages.value.map(m => resolveMediaUrl(m.url)),
    current: resolveMediaUrl(current.url),
  })
}

function closeVideo() {
  playingVideo.value = null
}

function formatDuration(seconds?: number): string {
  if (!seconds)
    return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
```

- [ ] **Step 2: template 插入相册区块**

在「详情」卡片（`<!-- 详情 -->` 块）之后、「组织者区」之前插入：

```html
        <!-- 活动相册 -->
        <view v-if="detail.media.length" class="mt-3 rounded-3 bg-card p-4 shadow-sm">
          <view class="flex items-center">
            <text class="text-4 text-ink font-medium">活动相册</text>
            <text class="ml-auto text-3 text-muted">{{ detail.media.length }} 项</text>
          </view>
          <view class="mt-3 grid grid-cols-3 gap-2">
            <view v-for="item in galleryShown" :key="item.id" class="min-w-0">
              <view
                class="relative aspect-[4/3] overflow-hidden rounded-2"
                :class="item.type === 'video' ? 'bg-black' : 'bg-hover'"
                @click="item.type === 'image' ? previewImage(item) : playingVideo = item"
              >
                <image
                  v-if="item.type === 'image'"
                  :src="resolveMediaUrl(item.url)"
                  mode="aspectFill"
                  class="h-full w-full"
                />
                <view
                  v-if="item.type === 'video'"
                  class="absolute inset-0 flex items-center justify-center"
                >
                  <view class="i-carbon-play-circle text-24px text-white" />
                  <text
                    v-if="item.duration"
                    class="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-2.5 text-white"
                  >
                    {{ formatDuration(item.duration) }}
                  </text>
                </view>
              </view>
              <text
                v-if="item.description"
                class="mt-1 block truncate text-3 text-sub"
              >
                {{ item.description }}
              </text>
            </view>
          </view>
          <view
            v-if="detail.media.length > GALLERY_PREVIEW_LIMIT && !galleryExpanded"
            class="mt-3 text-center text-3.5 text-primary-soft-text"
            @click="galleryExpanded = true"
          >
            查看全部 {{ detail.media.length }} 项
          </view>
        </view>
```

- [ ] **Step 3: template 末尾追加视频弹层**

在根 `<view class="min-h-screen ...">` 内、底部操作条之后（`</view>` 收尾之前）插入：

```html
    <!-- 视频播放弹层 -->
    <view
      v-if="playingVideo"
      class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      @click.self="closeVideo"
    >
      <view class="relative w-full">
        <video
          :src="resolveMediaUrl(playingVideo.url)"
          controls
          autoplay
          class="w-full"
          style="height: 220px"
        />
        <view
          class="absolute right-2 top-2 h-7 w-7 flex items-center justify-center rounded-full bg-black/60"
          @click="closeVideo"
        >
          <view class="i-carbon-close text-16px text-white" />
        </view>
      </view>
    </view>
```

- [ ] **Step 4: 类型检查**

Run: `bun run type-check`

Expected: 0 error。

---

### Task 11: 双端门禁与手工验收

**Files:** 无新改动（验证任务）

- [ ] **Step 1: 前端全量门禁**

Run（在 `frontend/`）:

```powershell
bun run type-check; bun run lint; bun run test:run
```

Expected: 三者退出码 0。

- [ ] **Step 2: 后端全量门禁（回归）**

Run（在 `backend/`）:

```powershell
bun run typecheck; bun run lint; bun run test
```

Expected: 三者退出码 0。

- [ ] **Step 3: 本地联调 + 手工验收**

启动：后端 `bun run dev`（9999）、前端 `bun run dev:h5`（3333），按 spec §6 清单逐项验证：

1. 组织者在管理页上传图片和视频 → 自动出现在列表和活动详情「活动相册」
2. 填写/修改/清空描述 → 详情页即时刷新
3. 删除媒体 → 详情页不再显示；DB 中 `media_file.ref_count` 归还（`SELECT ref_count FROM media_file WHERE id = ...`）
4. 游客（未登录）打开活动详情 → 能看相册，编辑页管理入口不可见（未登录直接进管理页被重定向）
5. 非组织者角色直接调 POST/PATCH/DELETE → 403（可临时用普通账号 curl 验证）
6. 重复绑定同一 mediaId → 409；绑定 audio 类型媒体 → 422（curl 模拟）
7. 图片点击全屏预览可左右滑动；视频点击弹层播放可关闭
8. 超过 12 条 → 首屏 12 条 + 「查看全部」展开

Expected: 全部通过。任一失败回到对应任务修复后重跑门禁。

- [ ] **Step 4: 汇报与提交（仅在用户要求时）**

汇总变更文件清单与验收结果；**不自动 commit**，等用户指示。

---

## Self-Review 记录

- **Spec 覆盖**：表/迁移(T1)、Zod(T2)、映射(T3)、repository(T4)、详情组装+写服务(T5)、三路由+权限+错误码(T6)、前端类型与封装(T7)、管理页(T8)、入口(T9)、详情相册(T10)、测试与验收(T11)。spec §6 中「倒序/重复绑定 409/ref_count 归还」依赖 DB 行为，现有测试体系无 DB 测试 harness，已下沉到 T11 手工验收第 3、6 项；单测覆盖纯 schema 与映射裁剪。
- **占位符**：无 TBD/TODO；所有代码步骤均给出完整代码。
- **类型一致性**：`ActivityMediaItemView`（后端）↔ `ActivityMediaItem`（前端）字段一致；服务函数名 `bindActivityMedia` / `setActivityMediaDescription` / `removeActivityMedia` 与路由、前端封装逐一对应；repository 的 `updateActivityMediaDescription` 与服务 `setActivityMediaDescription` 命名无冲突。
