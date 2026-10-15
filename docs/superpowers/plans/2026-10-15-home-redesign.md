# 首页重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 frontend 首页重构为「近期风采图片轮播 + 爱心积分动态滚动条 + 招募中行动卡列表」，并新增公开聚合接口 `GET /api/home`、将积分动态流 `GET /api/points/feed` 转为公开。

**Architecture:** 后端新增 home-service 复用现有 activity/points 数据层，选取策略中的纯映射逻辑抽为可单测的纯函数（本仓库后端测试均为工具层 Vitest，无 DB 集成测试）；前端新增 1 个 API 模块、2 个纯工具（含单测）、3 个 easycom `fg-*` 组件并重写首页，三板块数据独立容错。

**Tech Stack:** Nuxt 4 + Drizzle ORM + Vitest（backend）；uniapp(Vue3) + UnoCSS + alova + Vitest + @vue/test-utils（frontend）。

**仓库约束（覆盖技能默认约定）：**
- 全程使用 Bun；PowerShell 用 `;` 串联命令。
- **不执行 `git commit`**（AGENTS.md §11：仅用户明确要求时提交）。技能中的 Commit 步骤在本计划中替换为「检查点：跑门禁」。
- 生成物（`src/pages.json` 等）不手改；颜色只走主题变量与语义原子类，不硬编码色值。

---

## File Structure

**Backend（`backend/`）**

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `server/utils/path.ts` | 公开路径匹配 | 修改：新增 `/api/home`、`/api/points/feed` 两条 GET 正则 |
| `server/utils/path.test.ts` | path 单测 | 修改：补用例 |
| `server/database/repositories/activities.ts` | 活动数据访问 | 修改：新增 `listRecentlyEndedActivities`、`listRecruitingActivities` |
| `server/database/repositories/activity-media.ts` | 相册数据访问 | 修改：新增 `listFirstImageUrlsForActivities` |
| `server/utils/home-service.ts` | 首页聚合 + 纯映射 `toHighlights` | 新建 |
| `server/utils/home-service.test.ts` | toHighlights 单测 | 新建 |
| `server/utils/activity-service.ts` | 活动视图序列化 | 修改 1 行：导出 `toActivityView` 供 home-service 复用 |
| `server/api/home/index.get.ts` | `GET /api/home` 路由 | 新建 |
| `server/api/points/feed.get.ts` | 积分动态流 | 修改：删除 `requireUser` |

**Frontend（`frontend/`）**

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `src/api/home.ts` | 首页聚合接口类型与请求 | 新建 |
| `src/utils/points-feed.ts` | 积分动态文案纯函数 | 新建 |
| `src/utils/points-feed.test.ts` | 文案单测 | 新建 |
| `src/utils/home.ts` | 席位/进度/短日期/分类兜底纯函数 | 新建 |
| `src/utils/home.test.ts` | 单测 | 新建 |
| `src/components/fg-home-swiper/fg-home-swiper.vue` | 近期风采纯图片轮播 | 新建 |
| `src/components/fg-points-ticker/fg-points-ticker.vue` | 爱心动态纵向滚动条 | 新建 |
| `src/components/fg-recruit-card/fg-recruit-card.vue` | 招募行动卡 | 新建 |
| `src/pages/index/index.vue` | 首页 | 重写 |

---

## Task 1: 后端公开路径放行（TDD）

**Files:**
- Modify: `backend/server/utils/path.ts`
- Test: `backend/server/utils/path.test.ts`

- [ ] **Step 1: 先写失败测试**

在 `backend/server/utils/path.test.ts` 的 `describe('isPublicRequest', ...)` 块内追加：

```ts
  it('allows guest GET on the home aggregation endpoint', () => {
    expect(isPublicRequest('/api/home', 'GET')).toBe(true)
  })

  it('keeps non-GT home methods authenticated', () => {
    expect(isPublicRequest('/api/home', 'POST')).toBe(false)
  })

  it('allows guest GET on the public points feed only', () => {
    expect(isPublicRequest('/api/points/feed', 'GET')).toBe(true)
  })

  it('keeps personal points endpoints authenticated after feed goes public', () => {
    expect(isPublicRequest('/api/points/me', 'GET')).toBe(false)
    expect(isPublicRequest('/api/points/me/ledger', 'GET')).toBe(false)
    expect(isPublicRequest('/api/points/leaderboard', 'GET')).toBe(false)
  })
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cd backend; bun run test -- server/utils/path.test.ts
```

Expected: 新增 4 个用例 FAIL（实际为断言失败；`/api/home`、`/api/points/feed` 当前返回 false）。

- [ ] **Step 3: 修改 `path.ts` 放行两条精确路径**

把 `backend/server/utils/path.ts` 中的 `PUBLIC_GET_PATTERNS` 改为：

```ts
const PUBLIC_GET_PATTERNS = [
  /^\/api\/activities$/,
  /^\/api\/activities\/[^/]+$/,
  /^\/api\/home$/,
  /^\/api\/points\/feed$/
]
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
cd backend; bun run test -- server/utils/path.test.ts
```

Expected: PASS（含全部既有用例）。

---

## Task 2: 后端 repository 查询

**Files:**
- Modify: `backend/server/database/repositories/activities.ts`
- Modify: `backend/server/database/repositories/activity-media.ts`

- [ ] **Step 1: 在 activities repository 新增两个查询**

在 `backend/server/database/repositories/activities.ts` 的 `listActivities` 函数之后新增（`sql` 已在该文件顶部 import 列表中）：

```ts
/** 首页「近期风采」候选：时间窗内已结束的已发布活动，按结束时间倒序。 */
export async function listRecentlyEndedActivities(input: {
  now: Date
  windowMs: number
  limit: number
}): Promise<ActivityRow[]> {
  const since = new Date(input.now.getTime() - input.windowMs)
  const rows = await db
    .select()
    .from(activityTable)
    .where(
      and(
        eq(activityTable.status, 'published'),
        lt(activityTable.endTime, input.now),
        gte(activityTable.endTime, since)
      )
    )
    .orderBy(desc(activityTable.endTime), desc(activityTable.id))
    .limit(input.limit)
  return rows
}

/**
 * 首页「招募中」：已发布且当前未过有效报名截止时间（无截止时间以开始时间为准）。
 * 满员不在此剔除——由前端置灰，保证候选集与统计口径一致。
 *
 * 注意（实测坑）：不要用 sql`COALESCE(col, col) >= ${date}` 原生片段——postgres.js
 * 驱动对片段中的裸 Date 参数没有列类型编码器，会抛
 * "The 'string' argument must be of type string or Buffer... Received Date"。
 * 展开成两条列条件 OR，Date 走与 eq/gte 一致的正常参数编码。
 */
export async function listRecruitingActivities(input: {
  now: Date
  limit: number
}): Promise<ActivityRow[]> {
  const rows = await db
    .select()
    .from(activityTable)
    .where(
      and(
        eq(activityTable.status, 'published'),
        or(
          and(isNotNull(activityTable.registerDeadline), gte(activityTable.registerDeadline, input.now)),
          and(isNull(activityTable.registerDeadline), gte(activityTable.startTime, input.now))
        )
      )
    )
    .orderBy(asc(activityTable.startTime), asc(activityTable.id))
    .limit(input.limit)
  return rows
}
```

import 行相应为（`sql` 文件内他处仍在使用，保留）：

```ts
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm'
```

- [ ] **Step 2: 在 activity-media repository 新增批量首图查询**

在 `backend/server/database/repositories/activity-media.ts` 顶部 import 改为：

```ts
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
```

文件末尾新增：

```ts
/**
 * 批量取多个活动相册中「最早的一张图片」URL（跳过视频）。
 * 按 (activityId, 关联创建时间) 升序拉取后在 JS 内每组取首条，
 * 候选数受调用方限制（首页 ≤20 个候选），上限 500 行兜底。
 */
export async function listFirstImageUrlsForActivities(
  activityIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (activityIds.length === 0) return map
  const rows = await db
    .select({
      activityId: activityMedia.activityId,
      url: mediaFile.url
    })
    .from(activityMedia)
    .innerJoin(mediaFile, eq(activityMedia.mediaId, mediaFile.id))
    .where(and(inArray(activityMedia.activityId, activityIds), eq(mediaFile.type, 'image')))
    .orderBy(
      asc(activityMedia.activityId),
      asc(activityMedia.createdAt),
      asc(activityMedia.id)
    )
    .limit(500)
  for (const row of rows) {
    if (!map.has(row.activityId)) map.set(row.activityId, row.url)
  }
  return map
}
```

- [ ] **Step 3: 类型检查**

```powershell
cd backend; bun run typecheck
```

Expected: 0 error。

---

## Task 3: 首页聚合 service 与纯映射（TDD）

**Files:**
- Create: `backend/server/utils/home-service.ts`
- Test: `backend/server/utils/home-service.test.ts`
- Modify: `backend/server/utils/activity-service.ts`（导出 `toActivityView`）

- [ ] **Step 1: 导出 toActivityView**

`backend/server/utils/activity-service.ts` 中：

```ts
function toActivityView(
```

改为：

```ts
export function toActivityView(
```

- [ ] **Step 2: 先写失败测试 `home-service.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { toHighlights, type HighlightSource } from './home-service'

function source(over: Partial<HighlightSource> & { id: string }): HighlightSource {
  return {
    title: `活动-${over.id}`,
    endTime: '2026-10-12T01:00:00.000Z',
    categories: [],
    coverUrl: null,
    ...over
  }
}

describe('toHighlights（近期风采选取）', () => {
  it('相册首图优先于封面，并标记 imageSource', () => {
    const items = toHighlights(
      [source({ id: 'a', coverUrl: '/cover-a.jpg' })],
      new Map([['a', '/album-a.jpg']])
    )
    expect(items).toEqual([
      {
        id: 'a',
        title: '活动-a',
        endTime: '2026-10-12T01:00:00.000Z',
        categories: [],
        imageUrl: '/album-a.jpg',
        imageSource: 'album'
      }
    ])
  })

  it('相册无图片时退回封面', () => {
    const items = toHighlights(
      [source({ id: 'b', coverUrl: '/cover-b.jpg' })],
      new Map()
    )
    expect(items[0]?.imageUrl).toBe('/cover-b.jpg')
    expect(items[0]?.imageSource).toBe('cover')
  })

  it('相册只有视频（map 无该活动）且无封面时跳过该活动', () => {
    const items = toHighlights([source({ id: 'c', coverUrl: null })], new Map())
    expect(items).toEqual([])
  })

  it('保持入参顺序（SQL 已按结束时间倒序），最多返回 5 个', () => {
    const sources = Array.from({ length: 6 }, (_, i) =>
      source({ id: `e${i}`, coverUrl: `/c${i}.jpg` })
    )
    const items = toHighlights(sources, new Map())
    expect(items).toHaveLength(5)
    expect(items.map(i => i.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4'])
  })
})
```

- [ ] **Step 3: 运行确认失败**

```powershell
cd backend; bun run test -- server/utils/home-service.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 `home-service.ts`（全文以此为准）**

```ts
import {
  getActivityStatsMap,
  listRecentlyEndedActivities,
  listRecruitingActivities
} from '../database/repositories/activities'
import { listFirstImageUrlsForActivities } from '../database/repositories/activity-media'
import type { ActivityCategory } from '../database/schema'
import { toActivityView } from './activity-service'

/** 近期风采时间窗：30 天。 */
const HIGHLIGHT_WINDOW_MS = 30 * 24 * 60 * 60_000
/** 首页每板块上限。 */
const HOME_SECTION_LIMIT = 5
/** 风采候选超采样上限：部分候选可能无任何图片被跳过。 */
const HIGHLIGHT_CANDIDATE_LIMIT = 20

export interface HomeHighlight {
  id: string
  title: string
  endTime: string
  categories: ActivityCategory[]
  imageUrl: string
  imageSource: 'album' | 'cover'
}

export interface HighlightSource {
  id: string
  title: string
  endTime: Date | string
  categories: ActivityCategory[]
  coverUrl: string | null
}

/**
 * 纯映射：按「相册首图 → 封面」选取风采图，两者皆无跳过，截断到 limit。
 * 入参顺序由 SQL 保证（endTime 倒序），此函数不再排序。
 */
export function toHighlights(
  sources: HighlightSource[],
  firstImageUrl: Map<string, string>,
  limit: number = HOME_SECTION_LIMIT
): HomeHighlight[] {
  const result: HomeHighlight[] = []
  for (const s of sources) {
    if (result.length >= limit) break
    const album = firstImageUrl.get(s.id)
    const endTime = s.endTime instanceof Date ? s.endTime.toISOString() : s.endTime
    if (album) {
      result.push({
        id: s.id,
        title: s.title,
        endTime,
        categories: s.categories,
        imageUrl: album,
        imageSource: 'album'
      })
    } else if (s.coverUrl) {
      result.push({
        id: s.id,
        title: s.title,
        endTime,
        categories: s.categories,
        imageUrl: s.coverUrl,
        imageSource: 'cover'
      })
    }
  }
  return result
}

export interface HomeView {
  highlights: HomeHighlight[]
  recruiting: ReturnType<typeof toActivityView>[]
}

/** 首页聚合：近期风采 + 招募中。无 myRegistration（游客视角）。 */
export async function getHomeView(now: Date = new Date()): Promise<HomeView> {
  const [ended, recruiting] = await Promise.all([
    listRecentlyEndedActivities({ now, windowMs: HIGHLIGHT_WINDOW_MS, limit: HIGHLIGHT_CANDIDATE_LIMIT }),
    listRecruitingActivities({ now, limit: HOME_SECTION_LIMIT })
  ])

  const [firstImageUrl, statsMap] = await Promise.all([
    listFirstImageUrlsForActivities(ended.map(a => a.id)),
    getActivityStatsMap(recruiting.map(a => a.id))
  ])

  return {
    highlights: toHighlights(ended, firstImageUrl, HOME_SECTION_LIMIT),
    recruiting: recruiting.map(a =>
      toActivityView(
        a,
        statsMap.get(a.id) ?? { registeredCount: 0, checkedInCount: 0 },
        now,
        null,
        []
      )
    )
  }
}
```

- [ ] **Step 5: 运行测试与类型检查**

```powershell
cd backend; bun run test -- server/utils/home-service.test.ts; bun run typecheck
```

Expected: 4 个新用例 PASS，typecheck 0 error。

---

## Task 4: 路由接线与 feed 公开

**Files:**
- Create: `backend/server/api/home/index.get.ts`
- Modify: `backend/server/api/points/feed.get.ts`

- [ ] **Step 1: 新建 `GET /api/home` 路由**

`backend/server/api/home/index.get.ts` 全文：

```ts
/**
 * 首页聚合（游客可读）：近期风采轮播 + 招募中列表。
 * 服务函数经 server/utils 自动导入；响应用普通 { code, data } 信封，无分页。
 */
export default defineEventHandler(async () => {
  return ok(await getHomeView())
})
```

- [ ] **Step 2: 将积分动态流改为公开**

`backend/server/api/points/feed.get.ts` 删除 `requireUser(event)` 一行，并把文件头注释更新为：

```ts
import { feedQuerySchema } from '../../schemas/points'

/** 全站近期积分获取动态（游客可读）；捐献记录在 service 层已强制隐去 note。 */
export default defineEventHandler(async (event) => {
  const query = parseQuery(event, feedQuerySchema)
  const { data, total } = await getFeedView({
    category: query.category,
    page: query.page,
    pageSize: query.pageSize
  })
  return paginated(data, buildPaginationMeta(total, { page: query.page, pageSize: query.pageSize }))
})
```

- [ ] **Step 3: 后端全量门禁检查点**

```powershell
cd backend; bun run typecheck; bun run lint; bun run test
```

Expected: typecheck 0 error、lint 0 problem、全部测试 PASS（原 126 个 + 新增）。

- [ ] **Step 4: 手工冒烟（服务已在运行则跳过启动）**

另开终端 `cd backend; bun run dev`，然后在项目根执行临时脚本（用完即删）：

```powershell
cd backend; bun -e "const r = await fetch('http://localhost:9999/api/home'); console.log(r.status); const j = await r.json(); console.log(JSON.stringify({hl:j.data.highlights.length, rec:j.data.recruiting.length, sample:j.data.highlights[0] ?? null}, null, 2)); const f = await fetch('http://localhost:9999/api/points/feed?page=1&pageSize=5'); console.log('feed', f.status, JSON.stringify(await f.json()).includes('note'))"
```

Expected: 首页 `200`、结构含 `highlights/recruiting`；feed `200` 且输出 `feed true false`（字符串中不出现裸 `note` 字段；注意白名单输出本来就无 note，`includes('note')` 应为 false）。

---

## Task 5: 前端 API 模块

**Files:**
- Create: `frontend/src/api/home.ts`

- [ ] **Step 1: 新建 `src/api/home.ts`**

```ts
import type { ActivityCategory, ActivityView } from './activity'
import { http } from '@/http/alova'

/** 首页近期风采项（轮播纯图片：相册首图或封面）。 */
export interface HomeHighlight {
  id: string
  title: string
  endTime: string
  categories: ActivityCategory[]
  imageUrl: string
  imageSource: 'album' | 'cover'
}

/** GET /home 响应。recruiting 元素与活动列表项同构（游客视角 myRegistration=null）。 */
export interface HomeData {
  highlights: HomeHighlight[]
  recruiting: ActivityView[]
}

/** 首页聚合（游客可读）。 */
export function getHome(): Promise<HomeData> {
  return http.Get('/home') as unknown as Promise<HomeData>
}
```

- [ ] **Step 2: 类型检查**

```powershell
cd frontend; bun run type-check
```

Expected: 0 error。

---

## Task 6: 前端纯工具函数（TDD）

**Files:**
- Create: `frontend/src/utils/points-feed.ts`
- Test: `frontend/src/utils/points-feed.test.ts`
- Create: `frontend/src/utils/home.ts`
- Test: `frontend/src/utils/home.test.ts`

- [ ] **Step 1: 先写 `points-feed.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { formatFeedText } from './points-feed'

const base = {
  userName: '张三',
  points: 10,
  activityTitle: '敬老院慰问',
  category: 'activity',
  source: 'checkin',
} as const

describe('formatFeedText', () => {
  it('签到类动态', () => {
    expect(formatFeedText({ ...base, category: 'activity', source: 'checkin' }))
      .toBe('张三 参与「敬老院慰问」签到，获得 10 积分')
  })

  it('活动补录类动态不带「签到」', () => {
    expect(formatFeedText({ ...base, category: 'activity', source: 'manual_activity' }))
      .toBe('张三 参与「敬老院慰问」，获得 10 积分')
  })

  it('捐献类不区分款/物、不出现金额物资信息', () => {
    expect(
      formatFeedText({
        userName: '李四',
        points: 5,
        category: 'donation',
        source: 'manual_donation',
        activityTitle: null,
      }),
    ).toBe('李四 爱心捐献，获得 5 积分')
  })

  it('活动标题为空时兜底为公益活动', () => {
    expect(formatFeedText({ ...base, activityTitle: null }))
      .toBe('张三 参与「公益活动」签到，获得 10 积分')
    expect(formatFeedText({ ...base, activityTitle: '   ' }))
      .toBe('张三 参与「公益活动」签到，获得 10 积分')
  })
})
```

- [ ] **Step 2: 实现 `src/utils/points-feed.ts`**

```ts
import type { PointsFeedItem } from '@/api/points'

type FeedInput = Pick<PointsFeedItem, 'userName' | 'points' | 'category' | 'source' | 'activityTitle'>

/** 首页/积分页爱心动态的统一播报文案（白名单数据，无金额/物资/备注）。 */
export function formatFeedText(item: FeedInput): string {
  if (item.category === 'donation') {
    return `${item.userName} 爱心捐献，获得 ${item.points} 积分`
  }
  const title = item.activityTitle?.trim() || '公益活动'
  if (item.source === 'checkin') {
    return `${item.userName} 参与「${title}」签到，获得 ${item.points} 积分`
  }
  return `${item.userName} 参与「${title}」，获得 ${item.points} 积分`
}
```

- [ ] **Step 3: 运行确认通过**

```powershell
cd frontend; bun run test:run -- src/utils/points-feed.test.ts
```

Expected: 4 个用例 PASS。

- [ ] **Step 4: 先写 `home.test.ts`**

```ts
import type { ActivityView } from '@/api/activity'
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_FALLBACK,
  enrolledText,
  isFull,
  progressPercent,
  seatBadge,
  shortChineseDate,
} from './home'

function activity(over: Partial<ActivityView> = {}): ActivityView {
  return {
    id: 'a1',
    title: '测试活动',
    description: '',
    coverUrl: null,
    location: { name: '仓库', address: '', latitude: null, longitude: null },
    categories: [],
    startTime: '2026-10-20T01:00:00.000Z',
    endTime: '2026-10-20T03:00:00.000Z',
    registerDeadline: null,
    capacity: 30,
    points: 0,
    status: 'published',
    state: 'upcoming',
    createdBy: 'u1',
    createdAt: '',
    updatedAt: '',
    registeredCount: 12,
    checkedInCount: 0,
    remaining: 18,
    myRegistration: null,
    media: [],
    ...over,
  }
}

describe('招募卡派生函数', () => {
  it('满员判定与席位角标', () => {
    expect(isFull(activity({ remaining: 18 }))).toBe(false)
    expect(seatBadge(activity({ remaining: 18 }))).toBe('报名中 · 剩 18 席')
    expect(isFull(activity({ capacity: 20, registeredCount: 20, remaining: 0 }))).toBe(true)
    expect(seatBadge(activity({ capacity: 20, registeredCount: 20, remaining: 0 }))).toBe('名额已满')
  })

  it('不限名额时无进度条，角标只显示报名中', () => {
    const a = activity({ capacity: null, remaining: null })
    expect(seatBadge(a)).toBe('报名中')
    expect(progressPercent(a)).toBeNull()
    expect(enrolledText(a)).toBe('已报 12/不限')
  })

  it('名额进度百分比取整且封顶 100', () => {
    expect(progressPercent(activity())).toBe(40)
    expect(progressPercent(activity({ capacity: 20, registeredCount: 20, remaining: 0 }))).toBe(100)
  })

  it('中文短日期', () => {
    expect(shortChineseDate('2026-10-05T01:00:00.000Z')).toBe('10月5日')
  })

  it('五个分类都有兜底图标', () => {
    expect(Object.keys(CATEGORY_FALLBACK)).toHaveLength(5)
  })
})
```

- [ ] **Step 5: 实现 `src/utils/home.ts`**

```ts
import type { ActivityCategory, ActivityView } from '@/api/activity'

/** 招募卡：是否已满员（remaining 为 null 表示不限名额）。 */
export function isFull(a: Pick<ActivityView, 'remaining'>): boolean {
  return a.remaining !== null && a.remaining <= 0
}

/** 左上角标文案。 */
export function seatBadge(a: Pick<ActivityView, 'remaining'>): string {
  if (isFull(a)) return '名额已满'
  return a.remaining === null ? '报名中' : `报名中 · 剩 ${a.remaining} 席`
}

/** 已报名人数文案（与活动列表页口径一致）。 */
export function enrolledText(a: Pick<ActivityView, 'capacity' | 'registeredCount'>): string {
  const cap = a.capacity === null ? '不限' : String(a.capacity)
  return `已报 ${a.registeredCount}/${cap}`
}

/** 名额进度百分比；不限名额返回 null（不渲染进度条）。 */
export function progressPercent(
  a: Pick<ActivityView, 'capacity' | 'registeredCount'>,
): number | null {
  if (a.capacity === null || a.capacity <= 0) return null
  return Math.min(100, Math.round((a.registeredCount / a.capacity) * 100))
}

/** ISO 时间 → 「M月D日」；无效输入返回空串。 */
export function shortChineseDate(input?: string | Date | null): string {
  if (!input) return ''
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 无封面活动的分类色底兜底图标（carbon 图标，经 UnoCSS safelist/直接类名生效）。 */
export const CATEGORY_FALLBACK: Record<ActivityCategory, string> = {
  爱心物资: 'i-carbon-delivery-parcel',
  助学帮扶: 'i-carbon-education',
  传统文化: 'i-carbon-book',
  乡村振兴: 'i-carbon-location-heart',
  关爱群体: 'i-carbon-user-multiple',
}

export const DEFAULT_FALLBACK_ICON = 'i-carbon-calendar'
```

注意：`CATEGORY_FALLBACK` 的图标经数据绑定动态拼接，UnoCSS 无法扫描，必须在 `frontend/uno.config.ts` 的 `safelist` 中。已核对该文件 `safelist` 现有内容包含全部 5 个分类图标（`i-carbon-education`、`i-carbon-delivery-parcel`、`i-carbon-book`、`i-carbon-location-heart`、`i-carbon-user-multiple`）及 `i-carbon-calendar`，**本任务无需改 uno.config**。新组件中的静态图标（如 `i-carbon-trophy`、`i-carbon-image`）写死在模板里，会被 UnoCSS 正常扫描。

- [ ] **Step 6: 运行前端单测**

```powershell
cd frontend; bun run test:run -- src/utils/home.test.ts src/utils/points-feed.test.ts
```

Expected: 全部 PASS。

---

## Task 7: 轮播组件 fg-home-swiper

**Files:**
- Create: `frontend/src/components/fg-home-swiper/fg-home-swiper.vue`

- [ ] **Step 1: 新建组件全文**

```vue
<script lang="ts" setup>
import type { HomeHighlight } from '@/api/home'
import { resolveMediaUrl } from '@/api/profile'
import { shortChineseDate } from '@/utils/home'

defineOptions({ name: 'FgHomeSwiper' })

const props = defineProps<{ items: HomeHighlight[] }>()
const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const failedIds = ref<Set<string>>(new Set())

function imageUrl(item: HomeHighlight): string {
  return resolveMediaUrl(item.imageUrl)
}

function onImageError(id: string) {
  if (failedIds.value.has(id))
    return
  const next = new Set(failedIds.value)
  next.add(id)
  failedIds.value = next
}

function onTap(id: string) {
  emit('select', id)
}
</script>

<template>
  <swiper
    v-if="props.items.length"
    class="h-190px w-full overflow-hidden rounded-3"
    circular
    autoplay
    :interval="4000"
    :duration="400"
    indicator-dots
    indicator-color="rgba(255,255,255,0.5)"
    indicator-active-color="#ffffff"
  >
    <swiper-item
      v-for="item in props.items"
      :key="item.id"
      @click="onTap(item.id)"
    >
      <view class="relative h-full w-full bg-hover">
        <image
          v-if="!failedIds.has(item.id)"
          :src="imageUrl(item)"
          mode="aspectFill"
          class="h-full w-full"
          @error="onImageError(item.id)"
        />
        <view v-else class="h-full w-full center bg-primary-soft">
          <view class="i-carbon-image text-40px text-primary-soft-text opacity-70" />
        </view>
        <view
          class="absolute left-2 top-2 rounded-1 bg-black/40 px-2 py-0.5 text-2.5 text-white"
        >
          近期风采 · {{ shortChineseDate(item.endTime) }} 已结束
        </view>
        <view class="absolute bottom-6 left-0 right-0 px-3">
          <text
            class="text-4 text-white font-medium"
            style="text-shadow: 0 1px 6px rgba(0,0,0,0.6)"
          >{{ item.title }}</text>
        </view>
      </view>
    </swiper-item>
  </swiper>
</template>
```

说明：空数组由父级 `v-if` 控制不挂载，组件内 `v-if` 仅为双保险；图片 404 时切换为语义色兜底（不硬编码色值）；`indicator-color` 为 uniapp 组件属性（透传给原生 swiper），不属于 CSS 硬编码。

- [ ] **Step 2: 类型检查**

```powershell
cd frontend; bun run type-check
```

Expected: 0 error（easycom 组件无需手动 import）。

---

## Task 8: 积分滚动条组件 fg-points-ticker

**Files:**
- Create: `frontend/src/components/fg-points-ticker/fg-points-ticker.vue`

- [ ] **Step 1: 新建组件全文（以此为准）**

```vue
<script lang="ts" setup>
import type { PointsFeedItem } from '@/api/points'
import { formatFeedText } from '@/utils/points-feed'

defineOptions({ name: 'FgPointsTicker' })

const FALLBACK_TEXTS = ['让每一份善意，一对一精准抵达需要的人']

const props = withDefaults(
  defineProps<{
    items: PointsFeedItem[]
    fallbackTexts?: string[]
  }>(),
  { fallbackTexts: () => FALLBACK_TEXTS },
)

const emit = defineEmits<{
  (e: 'more'): void
}>()

const lines = computed<string[]>(() => {
  if (props.items.length) return props.items.map(formatFeedText)
  return props.fallbackTexts.length ? props.fallbackTexts : FALLBACK_TEXTS
})

const index = ref(0)
const smooth = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

function tick() {
  if (index.value < lines.value.length - 1) {
    index.value += 1
    return
  }
  // 滚到末尾后无动画归零，形成无缝循环
  smooth.value = false
  index.value = 0
  setTimeout(() => {
    smooth.value = true
  }, 50)
}

onMounted(() => {
  timer = setInterval(tick, 3000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  timer = null
})
</script>

<template>
  <view
    class="mt-3 flex items-center rounded-2 bg-primary-soft px-3 py-2"
    @click="emit('more')"
  >
    <view class="i-carbon-trophy mr-2 shrink-0 text-18px text-primary-soft-text" />
    <view class="relative h-20px flex-1 overflow-hidden">
      <view
        class="absolute left-0 right-0 top-0"
        :style="{
          transform: `translateY(-${index * 100}%)`,
          transition: smooth ? 'transform 0.4s ease' : 'none',
        }"
      >
        <view
          v-for="(line, i) in lines"
          :key="i"
          class="h-20px flex items-center text-3 text-primary-soft-text"
        >
          <text class="truncate">{{ line }}</text>
        </view>
      </view>
    </view>
    <text class="ml-2 shrink-0 text-3 text-primary-soft-text font-medium">积分榜 ›</text>
  </view>
</template>
```

说明：整条点击都跳积分榜（扩大热区）；仅有 1 条时 translate 始终为 0，定时器归零无视觉影响；全部颜色走 `primary-soft` 语义色，无硬编码。

- [ ] **Step 2: 类型检查与 lint**

```powershell
cd frontend; bun run type-check; bun run lint
```

Expected: 0 error / 0 problem。

---

## Task 9: 招募行动卡组件 fg-recruit-card

**Files:**
- Create: `frontend/src/components/fg-recruit-card/fg-recruit-card.vue`

- [ ] **Step 1: 新建组件全文**

```vue
<script lang="ts" setup>
import type { ActivityView } from '@/api/activity'
import { resolveMediaUrl } from '@/api/profile'
import { formatTimeRange } from '@/utils/datetime'
import {
  CATEGORY_FALLBACK,
  DEFAULT_FALLBACK_ICON,
  enrolledText,
  isFull,
  progressPercent,
  seatBadge,
} from '@/utils/home'

defineOptions({ name: 'FgRecruitCard' })

const props = defineProps<{ activity: ActivityView }>()
const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const full = computed(() => isFull(props.activity))
const percent = computed(() => progressPercent(props.activity))
const coverUrl = computed(() => resolveMediaUrl(props.activity.coverUrl))
const fallbackIcon = computed(
  () => CATEGORY_FALLBACK[props.activity.categories[0] ?? ''] ?? DEFAULT_FALLBACK_ICON,
)
const imgFailed = ref(false)

function open() {
  if (full.value) return
  emit('select', props.activity.id)
}
</script>

<template>
  <view
    class="overflow-hidden rounded-3 bg-card shadow-sm"
    :class="full ? 'opacity-60' : ''"
    @click="open"
  >
    <view class="relative h-92px w-full bg-hover">
      <image
        v-if="coverUrl && !imgFailed"
        :src="coverUrl"
        mode="aspectFill"
        class="h-full w-full"
        @error="imgFailed = true"
      />
      <view v-else class="h-full w-full center bg-primary-soft">
        <view :class="fallbackIcon" class="text-32px text-primary-soft-text opacity-80" />
      </view>
      <text
        class="absolute left-2 top-2 rounded-full px-2 py-0.5 text-2.5"
        :class="full ? 'bg-hover text-sub' : 'bg-primary text-white'"
      >
        {{ seatBadge(activity) }}
      </text>
    </view>

    <view class="p-3">
      <text class="text-4 text-ink font-medium">{{ activity.title }}</text>
      <view class="mt-1 flex items-center text-3 text-sub">
        <view class="i-carbon-time mr-1 text-16px text-muted" />
        <text class="ml-1">{{ formatTimeRange(activity.startTime, activity.endTime) }}</text>
      </view>
      <view class="mt-1 flex items-center text-3 text-sub">
        <view class="i-carbon-location mr-1 text-16px text-muted" />
        <text class="ml-1 max-w-300px truncate">{{ activity.location.name }}</text>
      </view>

      <view class="mt-2.5 flex items-center">
        <text class="shrink-0 text-3 text-muted">{{ enrolledText(activity) }}</text>
        <view v-if="percent !== null" class="mx-2.5 h-5px flex-1 overflow-hidden rounded-3 bg-hover">
          <view class="h-full rounded-3 bg-primary" :style="{ width: `${percent}%` }" />
        </view>
        <view v-else class="flex-1" />
        <text
          class="shrink-0 rounded-full px-3.5 py-1 text-3 font-medium"
          :class="full ? 'bg-hover text-muted' : 'bg-primary text-white'"
        >
          {{ full ? '名额已满' : '立即报名 ›' }}
        </text>
      </view>
    </view>
  </view>
</template>
```

满员角标使用 `bg-hover text-sub` 语义色，全部颜色无硬编码。

- [ ] **Step 2: 类型检查**

```powershell
cd frontend; bun run type-check
```

Expected: 0 error。

---

## Task 10: 重写首页

**Files:**
- Rewrite: `frontend/src/pages/index/index.vue`

- [ ] **Step 1: 重写 `index.vue` 全文**

```vue
<script lang="ts" setup>
import type { ActivityView } from '@/api/activity'
import { getHome, type HomeHighlight } from '@/api/home'
import { getPointsFeed, type PointsFeedItem } from '@/api/points'

defineOptions({
  name: 'Home',
})
definePage({
  type: 'home',
  layout: 'blank',
  style: {
    navigationBarTitleText: '首页',
  },
})

const highlights = ref<HomeHighlight[]>([])
const recruiting = ref<ActivityView[]>([])
const feedItems = ref<PointsFeedItem[]>([])

async function loadHome() {
  try {
    const data = await getHome()
    highlights.value = data.highlights
    recruiting.value = data.recruiting
  }
  catch {
    // 请求层已统一 toast；失败时保留各板块空态
    highlights.value = []
    recruiting.value = []
  }
}

async function loadFeed() {
  try {
    const res = await getPointsFeed(1, undefined, 20)
    feedItems.value = res.data
  }
  catch {
    feedItems.value = []
  }
}

function goAbout() {
  uni.navigateTo({ url: '/pages/about/about' })
}

function openDetail(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

function goActivityList() {
  uni.switchTab({ url: '/pages/activity/activity' })
}

function goPoints() {
  uni.navigateTo({ url: '/pages/points/index' })
}

// 首屏与从详情页报名后返回都刷新（与活动列表页一致，仅用 onShow 避免首屏双发）
onShow(() => {
  void Promise.allSettled([loadHome(), loadFeed()])
})
</script>

<template>
  <view class="min-h-screen bg-page px-3 py-3">
    <!-- 压缩品牌头 -->
    <view class="mission-banner relative overflow-hidden rounded-4 px-4 py-3.5">
      <view
        class="pointer-events-none absolute font-bold text-white -bottom-6 -right-1"
        style="font-size: 96rpx; opacity: 0.08"
      >
        众
      </view>
      <view class="text-3 text-white tracking-widest" style="opacity: 0.9">
        众爱联盟 · ZHONG AI LIAN MENG
      </view>
      <view class="mt-1.5 text-5 text-white font-bold leading-7">
        一对一助力困境学生安心学业
      </view>
      <view
        class="mt-2 inline-block rounded-full bg-white px-3.5 py-1 text-3 text-primary font-semibold"
        @click="goAbout"
      >
        了解我们 ›
      </view>
    </view>

    <!-- 近期风采轮播：无素材时整块隐藏 -->
    <fg-home-swiper
      v-if="highlights.length"
      class="mt-3 block"
      :items="highlights"
      @select="openDetail"
    />

    <!-- 爱心动态滚动条（冷启动自动轮播信念文案） -->
    <fg-points-ticker :items="feedItems" @more="goPoints" />

    <!-- 招募中 -->
    <view class="mt-4 flex items-center px-1">
      <text class="text-5 text-ink font-semibold">🔥 招募中</text>
      <text v-if="recruiting.length" class="ml-2 text-3 text-muted">
        {{ recruiting.length }} 场活动等你参与
      </text>
      <text class="ml-auto text-3 text-muted" @click="goActivityList">
        查看全部 ›
      </text>
    </view>

    <view class="mt-2.5">
      <fg-recruit-card
        v-for="a in recruiting"
        :key="a.id"
        class="mb-3 block"
        :activity="a"
        @select="openDetail"
      />

      <view
        v-if="!recruiting.length"
        class="flex flex-col items-center rounded-3 border border-dashed border-hover bg-card px-4 py-8"
        @click="goActivityList"
      >
        <view class="i-carbon-event-schedule text-40px text-muted" />
        <text class="mt-2 text-3.5 text-muted">
          近期暂无招募活动，看看往期风采 ›
        </text>
      </view>
    </view>

    <view class="mt-6 pb-4 text-center text-3 text-muted tracking-widest">
      仁心济世 · 善行天下
    </view>
  </view>
</template>

<style scoped lang="scss">
.mission-banner {
  background: var(--c-primary-gradient);
}
</style>
```

- [ ] **Step 2: 前端全量门禁检查点**

```powershell
cd frontend; bun run type-check; bun run lint; bun run test:run
```

Expected: 0 error / 0 problem / 全部测试 PASS。若 lint 报组件内风格问题，用 `bun run lint:fix` 自动修后重跑。

---

## Task 11: 端到端手工验收

**Files:** 无（验证任务）

前置：后端 `cd backend; bun run dev`（9999），前端 `cd frontend; bun run dev:h5`（3333）。准备数据：至少 1 场近 30 天内结束且**相册有图片**的活动、1 场已结束但相册只有视频（有封面）的活动、1 场可报名未满活动、1 场满员活动、若干签到/捐献积分流水。

- [ ] **Step 1: 游客视角**

浏览器无痕窗口打开 `http://localhost:3333/`：
1. 品牌头压缩显示，首屏能同时看到轮播与招募标题；
2. 轮播自动播放（4 秒）、可手滑、圆点指示；相册图活动显示相册首图；只有视频的活动显示封面；点击任一页进入对应活动详情；
3. 滚动条约 3 秒切换；签到/补录/捐献三类文案符合规则；点滚动条跳到积分页（游客被 401 流程引导登录，符合既有行为）；
4. 招募卡：未满显示「报名中 · 剩 N 席」与进度条；不限名额无进度条、文案「已报 x/不限」；满员卡半透明、角标与按钮均为「名额已满」且点击无跳转；
5. 点「立即报名 ›」/卡片进入详情页；「查看全部 ›」切换到活动 Tab；空态卡点击同样进活动 Tab。

- [ ] **Step 2: 刷新与降级**

1. 详情页报名后返回首页，招募统计与滚动条出现新动态（onShow 刷新）；
2. 停止后端后刷新首页：三板块分别为轮播隐藏、滚动条显示信念文案、招募显示空态卡片，页面不白屏、无未捕获异常；
3. 清空积分流水（或新库）时滚动条显示信念文案；全部近期活动无图时轮播不占位。

- [ ] **Step 3: 最终双端门禁**

```powershell
cd backend; bun run typecheck; bun run lint; bun run test
```

```powershell
cd frontend; bun run type-check; bun run lint; bun run test:run
```

Expected: 全绿。

---

## Self-Reviev 记录（计划对照规格）

- 规格 §2 四板块 → Task 7/8/9/10 全覆盖；空态三兜底 → Task 8（信念文案）、Task 10（轮播隐藏、招募空态）。
- 规格 §3.1 `/api/home`（30 天窗、相册首图→封面→跳过、超采样 20、上限 5、满员保留、COALESCE 截止）→ Task 2/3/4；§3.2 feed 公开精确匹配 → Task 1/4。
- 规格 §4 前端 api/组件/页面/文案 → Task 5–10；`formatFeedText` 四分支 → Task 6。
- 规格 §6 测试：后端纯选取 + path 规则 + 既有 feed 白名单测试（`points-views.test.ts` 已断言无 note）；前端文案与派生函数；DB 层与端到端行为走 Task 4/11 手工验收（本仓库无 DB/端到端测试基建，与既有 17 个后端测试范式一致）。
- 类型一致性：`HomeHighlight.imageSource`、`HomeData`、`PointsFeedItem`、`ActivityView` 在前后端任务中命名一致；组件 emit 协议（`select(id)` / `more`）在 Task 7–9 定义、Task 10 消费，父子两端同步落地。
