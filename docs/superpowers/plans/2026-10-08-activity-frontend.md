# 活动模块前端实施计划（H5 优先，兼容微信小程序）

> 前置：本计划依赖后端计划（`2026-10-08-activity-backend.md`）已实现并运行在 9999；前端 dev 3333。
> 设计事实源：`docs/superpowers/specs/2026-10-08-activity-checkin-design.md`（下称 Spec §x）。
> 包管理一律 `bun`（在 `frontend/` 目录执行）。
>
**提交约定：** 仓库 AGENTS.md §11 不自动创建 commit。每个 Task 末 git 命令仅当用户已明确要求提交时执行。
>
> **相对 Spec §6.2 的唯一实现偏差（更优，不改变契约）：** Spec 写「引入 uqrcode 生成二维码」，实际 wot-ui v2（`@wot-ui/ui ^2.3.2`）内置跨端 canvas 组件 `wd-qr-code`（H5/小程序都走 canvas，`watch(text)` 自动重绘，已核源码），直接使用，**不新增任何依赖、不引入 uqrcode**。二维码内容、滚动节奏、6 位码来源、422 语义均不变。

## 页面/模块总览与 Task 依赖

```
Task 1  http rawEnvelope 扩展 + api/activity.ts（契约层）
Task 2  store canManageActivity + 三个 util（datetime/location/checkin-link）+ TDD 单测
Task 3  env / env.d.ts / manifest 配置（chooseLocation 权限与 qqmap key）
Task 4  列表页 activity.vue（含 #ifndef H5 扫码入口、onReachBottom 分页）
Task 5  详情页 detail.vue（状态机底条 + 组织者区 + 位置导航）
Task 6  发布/编辑页 edit.vue（三 wd-datetime-picker + media-uploader 封面 + 选点/手动降级）
Task 7  参与者签到页 checkin.vue（URL a/c 预填 + 手输兜底）
Task 8  组织者滚动码页 checkin-code.vue（wd-qr-code + 60s 轮询）
Task 9  名单页 registrations.vue（统计 + 补签）
Task 10 我的报名页 mine.vue + me.vue 菜单接线
Task 11 全量门禁 type-check/lint/test:run + build:h5 + build:mp + H5 全链路走查
```

新建文件 11 个：`src/api/activity.ts`、`src/utils/{datetime,location,checkin-link,use-paged-list}.ts` + 对应 3 个测试、7 个页面（含替换占位 activity.vue）。修改 5 处：`src/http/alova.ts`、`src/store/auth.ts`、`src/pages/me/me.vue`、`src/env.d.ts`、`env/.env.development|production`、`manifest.config.ts`。AGENTS.md 的角色与目录同步由后端计划 Task 10 Step 4 负责，本计划不重复编辑。

## 关键事实（已核对，执行时不要重新调研）

1. **响应解包现状（[alova.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/http/alova.ts)）：** 成功只返回 `body.data`；分页接口的 `pagination`（及名单接口顶层 `stats`）会被丢弃。Task 1 给 meta 加 `rawEnvelope: true`（与既有 `rawAuth` 同构），分页/名单调用取回完整信封。
2. **路由参数：** H5 为 hash 模式（`env/.env` 中 `VITE_APP_ROUTER_MODE = hash`），故二维码 H5 链接为 `{base}/#/pages/activity/checkin?a={id}&c={code}`。
3. **自动导入：** 页面内 `ref/computed/onShow/onLoad/onReachBottom/definePage` 均无需 import（既有页面已验证）；普通 `.ts` 工具文件显式从 `vue` 导入。
4. **主题可用 token（themes.scss）：** `--c-primary/primary-soft/primary-soft-text/page/card/hover/ink/sub/muted/line/line-strong/danger/danger-soft`。没有 success 绿色 token：进行中用 primary 系，已取消用 danger 系，其余用 hover/muted 系。
5. **样式约定：** UnoCSS 原子类映射上述变量（如 `bg-card text-ink text-sub text-muted bg-hover border-line text-primary bg-primary-soft text-primary-soft-text bg-danger-soft text-danger`），动态图标类名只出 me.vue safelist 注释里；新页面图标全部静态写在 template 中。
6. **组件事实（node_modules/@wot-ui/ui/components 已核）：**
   - `wd-qr-code`：props `text:string`、`size:number=200`、`margin:number`，内部 `watch(text)` 自动重绘（[wd-qr-code.vue](file:///d:/projects/zhongailianmeng/zalm-code/frontend/node_modules/@wot-ui/ui/components/wd-qr-code/wd-qr-code.vue) 第 59-93 行）。
   - `wd-datetime-picker`：`v-model` 为时间戳（ms），`type="datetime"`，ref 暴露 `open()`，确认事件 `@confirm="({ value })"`（[types.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/node_modules/@wot-ui/ui/components/wd-datetime-picker/types.ts)、组件 emit 已核）。
   - 列表分段器不用 `wd-segmented`（它用 `value` 而非 `v-model`），直接用 view 自绘 tabs，与首页风格一致。
   - `wd-*` 经 pages.config.ts easycom 自动引入，**直接写标签**。
7. **媒体上传可复用：** [media-uploader.vue](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/components/media-uploader/media-uploader.vue) `bare` 模式 + `ref.trigger()` + `@change`（items[0].url, status==='done'），profile.vue 头像上传是现成范例；`resolveMediaUrl` 在 [profile.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/api/profile.ts) 第 95 行。
8. **后端响应字段（以后端计划 toActivityView 为准）：** ActivityView = `{id,title,description,coverUrl,location,startTime,endTime,registerDeadline,capacity,status,state,createdBy,createdAt,updatedAt,registeredCount,checkedInCount,remaining,myRegistration}`；名单行 = RegistrationRow + `{userName,userPhone,userImage}`；滚动码 `{code,expiresAt(ISO)}`；mine 元素 = `{registration, activity}`。
9. **alova `http.Get(url, {params, meta})` 传 query；** cast 风格 `as unknown as Promise<T>` 同 [media.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/api/media.ts)。
10. **登录回跳：** `toLoginPage()` 默认自动带当前 fullPath 回跳（[toLoginPage.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/utils/toLoginPage.ts)）；401 拦截器也会 reLaunch 登录页。
11. **测试风格：** Vitest 3 globals，文件 `src/**/*.test.ts`，`import {describe,expect,it} from 'vitest'`（见 [phone.test.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/utils/phone.test.ts)）。

---

## Task 1: 请求层 rawEnvelope 与 API 模块

**Files:**
- Modify: `src/http/alova.ts`
- Create: `src/api/activity.ts`

- [ ] **Step 1: 给 RequestMeta 加 rawEnvelope**

在 [alova.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/http/alova.ts) 的 `RequestMeta` 中 `rawAuth` 之后加：

```ts
  /**
   * 返回后端完整信封 { code,data,pagination?,stats? }（不剥离 data）。
   * 用于需要 pagination 或顶层 stats 的分页/名单接口。
   */
  rawEnvelope?: boolean
```

把成功分支：

```ts
      // 统一包装：成功返回 data，业务码非 OK 抛错
      const body = rawData as ApiEnvelope
      if (body && body.code === 'OK') {
        return body.data
      }
```

改为：

```ts
      // 统一包装：默认返回 data；rawEnvelope 返回完整信封（含 pagination/stats）
      const body = rawData as ApiEnvelope
      if (body && body.code === 'OK') {
        if (meta.rawEnvelope)
          return body
        return body.data
      }
```

- [ ] **Step 2: 创建 `src/api/activity.ts`（完整文件）**

```ts
import type { ApiEnvelope } from '@/http/alova'
import { http } from '@/http/alova'

/** 标准化位置（与后端 activityLocationSchema 对齐，GCJ-02 坐标，可整体为空降级）。 */
export interface ActivityLocation {
  name: string
  address: string
  latitude: number | null
  longitude: number | null
}

/** 活动派生状态（后端按 now 计算，非落库字段）。 */
export type ActivityDerivedState = 'upcoming' | 'ongoing' | 'ended' | 'cancelled'
/** 列表筛选项：active=进行中+未开始，past=已结束，cancelled=已取消。 */
export type ActivityStateFilter = 'active' | 'past' | 'cancelled'
/** 活动落库状态。 */
export type ActivityStatus = 'published' | 'cancelled'

export type RegistrationStatus = 'registered' | 'cancelled' | 'checked_in'
export type CheckInMethod = 'scan' | 'manual'

/** 报名记录行（与后端 RegistrationRow 对齐）。 */
export interface RegistrationRow {
  id: string
  activityId: string
  userId: string
  status: RegistrationStatus
  checkInAt: string | null
  checkInMethod: CheckInMethod | null
  checkedInBy: string | null
  createdAt: string
  cancelledAt: string | null
}

/** 活动详情/列表项（后端 toActivityView）。列表与详情同构，游客 myRegistration=null。 */
export interface ActivityView {
  id: string
  title: string
  description: string
  coverUrl: string | null
  location: ActivityLocation
  startTime: string
  endTime: string
  registerDeadline: string | null
  capacity: number | null
  status: ActivityStatus
  state: ActivityDerivedState
  createdBy: string
  createdAt: string
  updatedAt: string
  registeredCount: number
  checkedInCount: number
  remaining: number | null
  myRegistration: RegistrationRow | null
}

/** 组织者名单行（join 用户摘要，含完整手机号）。 */
export interface RegistrationWithUser extends RegistrationRow {
  userName: string
  userPhone: string
  userImage: string | null
}

export interface ActivityStats {
  registeredCount: number
  checkedInCount: number
  capacity: number | null
  remaining: number | null
}

export type PaginationMeta = NonNullable<ApiEnvelope<unknown>['pagination']>

/** rawEnvelope 调用解出的分页信封。 */
export interface Paged<T> {
  data: T[]
  pagination: PaginationMeta
}

export interface RegistrationsPage extends Paged<RegistrationWithUser> {
  stats: ActivityStats
}

/** GET /activities/mine/registrations 元素。 */
export interface MyRegistrationItem {
  registration: RegistrationRow
  activity: ActivityView
}

/** POST /activities、PUT /activities/:id 的请求体（PUT 时字段全部可选）。 */
export interface ActivityPayload {
  title: string
  description?: string
  coverUrl?: string | null
  location: ActivityLocation
  startTime: string
  endTime: string
  registerDeadline?: string | null
  capacity?: number | null
}
export type ActivityUpdatePayload = Partial<ActivityPayload>

export interface ActivityListParams {
  state: ActivityStateFilter
  page: number
  pageSize: number
  keyword?: string
}

// ===== 参与者/公开 =====

/** 活动分页列表（公开）。 */
export function listActivities(params: ActivityListParams): Promise<Paged<ActivityView>> {
  return http.Get('/activities', {
    params,
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<ActivityView>>
}

/** 活动详情（公开；登录响应附 myRegistration）。 */
export function getActivity(id: string): Promise<ActivityView> {
  return http.Get(`/activities/${id}`) as unknown as Promise<ActivityView>
}

/** 报名（幂等；满员/截止/取消 → 409，由拦截器 toast）。 */
export function registerToActivity(id: string): Promise<RegistrationRow> {
  return http.Post(`/activities/${id}/register`) as unknown as Promise<RegistrationRow>
}

/** 开始前取消报名（无记录 404，已签到/已开始 409）。 */
export function cancelMyRegistration(id: string): Promise<RegistrationRow> {
  return http.Post(`/activities/${id}/cancel-registration`) as unknown as Promise<RegistrationRow>
}

/** 自助签到（6 位码；窗外/未报名 409，错码 422，重复签到幂等）。 */
export function checkInActivity(id: string, code: string): Promise<RegistrationRow> {
  return http.Post(`/activities/${id}/check-in`, { code }) as unknown as Promise<RegistrationRow>
}

/** 我的报名（分页）。 */
export function listMyRegistrations(page: number, pageSize = 10): Promise<Paged<MyRegistrationItem>> {
  return http.Get('/activities/mine/registrations', {
    params: { page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<Paged<MyRegistrationItem>>
}

// ===== 组织者 =====

/** 发布活动。 */
export function createActivity(payload: ActivityPayload): Promise<ActivityView> {
  return http.Post('/activities', payload) as unknown as Promise<ActivityView>
}

/** 编辑活动（已取消 → 409）。 */
export function updateActivity(id: string, payload: ActivityUpdatePayload): Promise<ActivityView> {
  return http.Put(`/activities/${id}`, payload) as unknown as Promise<ActivityView>
}

/** 取消活动（终态）。 */
export function cancelActivity(id: string): Promise<ActivityView> {
  return http.Post(`/activities/${id}/cancel`) as unknown as Promise<ActivityView>
}

/** 取当前窗口滚动码 {code,expiresAt}。 */
export function getCheckInCode(id: string): Promise<{ code: string, expiresAt: string }> {
  return http.Get(`/activities/${id}/check-in-code`) as unknown as Promise<{ code: string, expiresAt: string }>
}

/** 报名/签到名单 + 统计（含完整手机号）。 */
export function listRegistrations(id: string, page: number, pageSize = 20): Promise<RegistrationsPage> {
  return http.Get(`/activities/${id}/registrations`, {
    params: { page, pageSize },
    meta: { rawEnvelope: true },
  }) as unknown as Promise<RegistrationsPage>
}

/** 现场手动补签。 */
export function manualCheckIn(activityId: string, userId: string): Promise<RegistrationRow> {
  return http.Post(`/activities/${activityId}/manual-check-in`, { userId }) as unknown as Promise<RegistrationRow>
}
```

- [ ] **Step 3: 检查点**

Run: `bun run type-check`
Expected: 0 error（alova 的 Get 配置含 `meta` 合法；`http.Put` 是 alova 实例方法）。

---

## Task 2: store 权限位 + 工具函数（TDD）

**Files:**
- Modify: `src/store/auth.ts`
- Create: `src/utils/datetime.ts`、`src/utils/datetime.test.ts`
- Create: `src/utils/location.ts`、`src/utils/location.test.ts`
- Create: `src/utils/checkin-link.ts`、`src/utils/checkin-link.test.ts`
- Create: `src/utils/use-paged-list.ts`

- [ ] **Step 1: store 增加 canManageActivity**

在 [auth.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/store/auth.ts) 的 `isAdmin` computed 下新增：

```ts
    /** 活动组织者能力：角色含 admin 或 activity_admin（仅控 UI，最终鉴权以后端为准）。 */
    const canManageActivity = computed(() => {
      const roles = user.value?.roles ?? []
      return roles.includes('admin') || roles.includes('activity_admin')
    })
```

并在末尾 `return { ... }` 中 `isAdmin,` 之后加入 `canManageActivity,`。

- [ ] **Step 2: 先写 datetime 测试** — `src/utils/datetime.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatTimeRange,
  secondsUntilNextMinute,
} from './datetime'

describe('datetime formatting', () => {
  it('formats an ISO string to YYYY-MM-DD HH:mm', () => {
    expect(formatDateTime('2026-10-08T05:06:07.000Z')).toBeTypeOf('string')
    const out = formatDateTime('2026-10-08T05:06:00Z')
    // 只约束格式骨架，时区由运行环境决定
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('formats date only', () => {
    expect(formatDate('2026-10-08T05:06:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns empty string for nullish / invalid input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('not-a-date')).toBe('')
  })

  it('formats a same-day range on one line', () => {
    const out = formatTimeRange('2026-10-08T01:00:00Z', '2026-10-08T03:00:00Z')
    expect(out).toContain('~')
    expect(out.startsWith('2026-10-')).toBe(true)
  })

  it('computes seconds until the next minute boundary', () => {
    expect(secondsUntilNextMinute(0)).toBe(60)
    expect(secondsUntilNextMinute(30_000)).toBe(30)
    expect(secondsUntilNextMinute(59_000)).toBe(1)
  })
})
```

- [ ] **Step 3: 实现 `src/utils/datetime.ts`**

```ts
/** 时间展示与滚动码倒计时辅助（活动模块统一用这一份，不在页面里手写 Date 格式化）。 */

function toDate(input?: string | Date | null): Date | null {
  if (input === null || input === undefined || input === '')
    return null
  const d = input instanceof Date ? input : new Date(input)
  return Number.isNaN(d.getTime()) ? null : d
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYY-MM-DD HH:mm；无效输入返回 ''。 */
export function formatDateTime(input?: string | Date | null): string {
  const d = toDate(input)
  if (!d)
    return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** YYYY-MM-DD；无效输入返回 ''。 */
export function formatDate(input?: string | Date | null): string {
  const d = toDate(input)
  if (!d)
    return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function hm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 列表/详情时间区间：同日「YYYY-MM-DD HH:mm~HH:mm」，跨日两行完整时间用 ~ 连接。 */
export function formatTimeRange(
  start?: string | Date | null,
  end?: string | Date | null,
): string {
  const s = toDate(start)
  const e = toDate(end)
  if (!s || !e)
    return ''
  const sameDay
    = s.getFullYear() === e.getFullYear()
      && s.getMonth() === e.getMonth()
      && s.getDate() === e.getDate()
  if (sameDay)
    return `${formatDate(s)} ${hm(s)}~${hm(e)}`
  return `${formatDateTime(s)} ~ ${formatDateTime(e)}`
}

/** 距离下一整分的秒数（1..60），用于滚动码倒计时。 */
export function secondsUntilNextMinute(nowMs: number = Date.now()): number {
  return 60 - (Math.floor(nowMs / 1000) % 60)
}
```

- [ ] **Step 4: 先写 location 测试** — `src/utils/location.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { ActivityLocation } from './location'
import {
  buildMarkerUri,
  hasCoordinates,
  round6,
} from './location'

const withCoord: ActivityLocation = {
  name: '人民广场',
  address: '上海市黄浦区',
  latitude: 31.2336,
  longitude: 121.4712,
}
const degraded: ActivityLocation = {
  name: '村委会',
  address: '某镇某村 1 号',
  latitude: null,
  longitude: null,
}

describe('location helpers', () => {
  it('detects whether a location has paired coordinates', () => {
    expect(hasCoordinates(withCoord)).toBe(true)
    expect(hasCoordinates(degraded)).toBe(false)
    expect(hasCoordinates({ ...withCoord, longitude: null })).toBe(false)
  })

  it('rounds to 6 decimals', () => {
    expect(round6(31.2336009)).toBe(31.233601)
    expect(round6(121.47)).toBe(121.47)
  })

  it('builds a Tencent map marker URI with encoded title/addr', () => {
    const uri = buildMarkerUri(withCoord)
    expect(uri.startsWith('https://apis.map.qq.com/uri/v1/marker?marker=coord:31.2336,121.4712;')).toBe(true)
    expect(uri).toContain(`title=${encodeURIComponent('人民广场')}`)
    expect(uri).toContain(`addr=${encodeURIComponent('上海市黄浦区')}`)
    expect(uri.endsWith('referer=%E4%BC%97%E7%88%B1%E8%81%94%E7%9B%9F')).toBe(true)
  })

  it('returns empty marker URI when coordinates missing', () => {
    expect(buildMarkerUri(degraded)).toBe('')
  })
})
```

注意：测试里 `import type { ActivityLocation } from './location'`，实际类型从 `@/api/activity` re-export 即可——实现文件里 `export type { ActivityLocation } from '@/api/activity'` 以兼容此写法（见 Step 5 代码首行）。

- [ ] **Step 5: 实现 `src/utils/location.ts`**

```ts
import type { ActivityLocation } from '@/api/activity'

export type { ActivityLocation }

/** 经纬度成对存在且为有限数。 */
export function hasCoordinates(
  loc: ActivityLocation,
): loc is ActivityLocation & { latitude: number, longitude: number } {
  return (
    typeof loc.latitude === 'number'
    && typeof loc.longitude === 'number'
    && Number.isFinite(loc.latitude)
    && Number.isFinite(loc.longitude)
  )
}

/** GCJ-02 坐标保留 6 位小数（约 0.1m）。 */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

export type ChooseLocationResult =
  | { ok: true, location: ActivityLocation }
  | { ok: false, cancelled: boolean, message: string }

/**
 * 调起系统选点页（uni.chooseLocation）的唯一封装：
 * - 成功返回标准化位置（名称/地址兜底互补，坐标保留 6 位）；
 * - 用户取消：{ ok:false, cancelled:true }，调用方静默；
 * - 授权/key/接口失败：{ ok:false, cancelled:false,message }，页面提示并引导手动填写。
 * 页面不要直接调 uni.chooseLocation。
 */
export function chooseActivityLocation(): Promise<ChooseLocationResult> {
  return new Promise((resolve) => {
    uni.chooseLocation({
      success: (res) => {
        const name = (res.name || '').trim() || (res.address || '').trim() || '已选位置'
        const address = (res.address || '').trim() || name
        resolve({
          ok: true,
          location: {
            name: name.slice(0, 100),
            address: address.slice(0, 200),
            latitude: round6(res.latitude),
            longitude: round6(res.longitude),
          },
        })
      },
      fail: (err) => {
        const msg = String(err?.errMsg ?? '')
        if (msg.includes('cancel')) {
          resolve({ ok: false, cancelled: true, message: '' })
          return
        }
        resolve({
          ok: false,
          cancelled: false,
          message: '无法打开地图选点，请检查定位授权，或直接手动填写地点名称与地址',
        })
      },
    })
  })
}

/** H5 导航用的腾讯地图 marker URI；无坐标返回 ''。 */
export function buildMarkerUri(loc: ActivityLocation): string {
  if (!hasCoordinates(loc))
    return ''
  const coord = `coord:${loc.latitude},${loc.longitude}`
  const query = [
    `marker=${coord};title=${encodeURIComponent(loc.name)};addr=${encodeURIComponent(loc.address)}`,
    'referer=%E4%BC%97%E7%88%B1%E8%81%94%E7%9B%9F',
  ].join('&')
  return `https://apis.map.qq.com/uri/v1/marker?${query}`
}

/**
 * 详情页「导航」：
 * - 小程序/App：uni.openLocation 打开内置地图（坐标为 GCJ-02，与微信/高德体系一致）；
 * - H5：新窗口打开腾讯地图 marker URI；
 * - 无坐标：toast 提示。
 */
export function openActivityNavigation(loc: ActivityLocation): void {
  if (!hasCoordinates(loc)) {
    uni.showToast({ title: '该活动未提供坐标，无法导航', icon: 'none' })
    return
  }
  // #ifdef H5
  const uri = buildMarkerUri(loc)
  if (typeof window !== 'undefined')
    window.open(uri, '_blank')
  // #endif
  // #ifndef H5
  uni.openLocation({
    latitude: loc.latitude,
    longitude: loc.longitude,
    name: loc.name,
    address: loc.address,
  })
  // #endif
}
```

- [ ] **Step 6: 先写 checkin-link 测试** — `src/utils/checkin-link.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildCheckinUrl, parseCheckinUrl } from './checkin-link'

const ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const CODE = '042042'

describe('buildCheckinUrl', () => {
  it('appends hash-route query and tolerates trailing slash', () => {
    expect(buildCheckinUrl('https://h5.example.com', ID, CODE))
      .toBe(`https://h5.example.com/#/pages/activity/checkin?a=${ID}&c=${CODE}`)
    expect(buildCheckinUrl('https://h5.example.com/', ID, CODE))
      .toBe(`https://h5.example.com/#/pages/activity/checkin?a=${ID}&c=${CODE}`)
  })
})

describe('parseCheckinUrl', () => {
  it('round-trips a built H5 url', () => {
    const url = buildCheckinUrl('https://h5.example.com', ID, CODE)
    expect(parseCheckinUrl(url)).toEqual({ activityId: ID, code: CODE })
  })

  it('parses a scanner result with surrounding whitespace or query after hash', () => {
    const raw = `  https://h5.example.com/?from=scan#/pages/activity/checkin?a=${ID}&c=${CODE}  `
    expect(parseCheckinUrl(raw)).toEqual({ activityId: ID, code: CODE })
  })

  it('rejects foreign paths and malformed codes', () => {
    // 域名不做白名单（生产/测试域名可能不同），但路由片段必须是本系统签到页
    expect(parseCheckinUrl('https://evil.com/#/pages/promo?a=x&c=123456')).toBe(null)
    expect(parseCheckinUrl(`https://h5.example.com/#/pages/activity/checkin?a=${ID}`)).toBe(null)
    expect(parseCheckinUrl(`https://h5.example.com/#/pages/activity/checkin?a=${ID}&c=abcdef`)).toBe(null)
    expect(parseCheckinUrl('not a url')).toBe(null)
    expect(parseCheckinUrl('')).toBe(null)
  })
})
```

注意 `from=scan` 那条用例：解析实现对 hash 与 search 一视同仁地正则提取 `a/c`，但必须命中 `pages/activity/checkin` 路由片段；它并不校验域名（扫码来源可能是测试/生产不同域）。

- [ ] **Step 7: 实现 `src/utils/checkin-link.ts`**

```ts
/** 签到二维码链接（H5 hash 路由）与扫码结果解析，均为纯函数。 */

const CHECKIN_ROUTE = 'pages/activity/checkin'
const CODE_RE = /^\d{6}$/
const ID_RE = /^[\w-]{1,64}$/

/** 构造二维码内容：{base}/#/pages/activity/checkin?a={activityId}&c={code}。 */
export function buildCheckinUrl(base: string, activityId: string, code: string): string {
  const root = base.trim().replace(/\/+$/, '')
  return `${root}/#/${CHECKIN_ROUTE}?a=${encodeURIComponent(activityId)}&c=${encodeURIComponent(code)}`
}

function pickParam(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`[?&]${key}=([^&#]+)`))
  if (!m)
    return null
  try {
    return decodeURIComponent(m[1])
  }
  catch {
    return null
  }
}

/**
 * 解析微信扫一扫得到的签到链接：
 * 命中签到路由且 a 合法、c 为 6 位数字时返回 {activityId,code}，否则 null。
 */
export function parseCheckinUrl(raw: string): { activityId: string, code: string } | null {
  if (!raw || !raw.trim())
    return null
  const text = raw.trim()
  if (!text.includes(CHECKIN_ROUTE))
    return null
  const activityId = pickParam(text, 'a')
  const code = pickParam(text, 'c')
  if (!activityId || !ID_RE.test(activityId))
    return null
  if (!code || !CODE_RE.test(code))
    return null
  return { activityId, code }
}

/** 签到二维码 H5 基址：优先 VITE_H5_BASE_URL；H5 开发态回退当前 origin；其余端缺省返回 ''。 */
export function getH5BaseUrl(): string {
  const configured = (import.meta.env.VITE_H5_BASE_URL || '').trim()
  if (configured)
    return configured.replace(/\/+$/, '')
  // #ifdef H5
  if (typeof location !== 'undefined' && location.origin)
    return location.origin
  // #endif
  return ''
}
```

- [ ] **Step 8: 实现分页 composable** — `src/utils/use-paged-list.ts`

```ts
import { computed, ref } from 'vue'

/**
 * 列表页通用「页码 + 触底加载」状态机。
 * fetcher 返回 { data, total }；reload() 回到第 1 页，loadMore() 触底调用。
 */
export function usePagedList<T>(
  fetcher: (page: number) => Promise<{ data: T[], total: number }>,
  pageSize = 10,
) {
  const items = ref<T[]>([])
  const page = ref(0)
  const total = ref(0)
  const loading = ref(false)
  const finished = computed(() => items.value.length >= total.value && total.value > 0)
  const empty = computed(() => !loading.value && items.value.length === 0)

  async function reload(): Promise<void> {
    loading.value = true
    try {
      const next = await fetcher(1)
      items.value = next.data
      total.value = next.total
      page.value = 1
    }
    finally {
      loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (loading.value || finished.value)
      return
    loading.value = true
    try {
      const next = await fetcher(page.value + 1)
      items.value = items.value.concat(next.data)
      total.value = next.total
      page.value += 1
    }
    finally {
      loading.value = false
    }
  }

  return { items, total, page, loading, finished, empty, reload, loadMore }
}
```

- [ ] **Step 9: 跑单测与门禁**

Run: `bun run test:run ; bun run type-check ; bun run lint`
Expected: 新增 3 个测试文件全绿；0 type error；lint 0 problem（若报风格问题 `bun run lint:fix`）。

---

## Task 3: 环境变量与 manifest 选点配置

**Files:**
- Modify: `env/.env.development`、`env/.env.production`、`src/env.d.ts`、`manifest.config.ts`

- [ ] **Step 1: env 文件追加分段**

[env/.env.development](file:///d:/projects/zhongailianmeng/zalm-code/frontend/env/.env.development) 末尾追加：

```bash

# 腾讯位置服务 key（H5 端 uni.chooseLocation 必需；留空时 H5 无法调起选点页，可手动填写地址降级）
VITE_QQMAP_KEY = ''
# 签到二维码指向的 H5 基址；留空时开发态回退当前站点 origin
VITE_H5_BASE_URL = ''
```

[env/.env.production](file:///d:/projects/zhongailianmeng/zalm-code/frontend/env/.env.production) 末尾追加：

```bash

# 腾讯位置服务 key（上线前填写；申请：https://lbs.qq.com/）
VITE_QQMAP_KEY = ''
# 签到二维码指向的 H5 正式基址（微信扫一扫打开的备案域名），如 https://h5.example.com
VITE_H5_BASE_URL = ''
```

- [ ] **Step 2: env.d.ts 补类型**

在 [src/env.d.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/env.d.ts) 的 `ImportMetaEnv` 中 `VITE_DELETE_CONSOLE` 前加：

```ts
  /** 腾讯位置服务 key（H5 chooseLocation），可留空 */
  readonly VITE_QQMAP_KEY?: string
  /** 签到二维码 H5 基址，留空时 H5 回退 location.origin */
  readonly VITE_H5_BASE_URL?: string
```

- [ ] **Step 3: manifest.config.ts**

在 [manifest.config.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/manifest.config.ts) 的解构中加 `VITE_QQMAP_KEY`；`h5` 块改为：

```ts
  h5: {
    router: {
      mode: VITE_APP_ROUTER_MODE as 'history' | 'hash',
      base: VITE_APP_PUBLIC_BASE,
    },
    // H5 端 uni.chooseLocation 依赖腾讯地图 JS SDK；key 为空时选点不可用，表单支持手动降级
    sdkConfigs: {
      maps: {
        qqmap: {
          key: VITE_QQMAP_KEY || '',
        },
      },
    },
  },
```

`mp-weixin` 块内（`appid: VITE_WX_APPID,` 之后）加：

```ts
    // uni.chooseLocation 隐私接口声明（2022 后微信后台与代码两侧均需声明）
    requiredPrivateInfos: ['chooseLocation'],
```

- [ ] **Step 4: 检查点**

Run: `bun run dev:h5`，确认 3333 正常启动、生成物 `src/manifest.json` 内含 `qqmap` 配置后 Ctrl+C 停止。
Expected: 启动无报错；控制台无 manifest 解析错误。

---

## Task 4: 活动列表页（替换占位页）

**Files:**
- Modify（整体替换）: `src/pages/activity/activity.vue`

页面内容：自定义三段 tabs（`active/past/cancelled`）、关键词搜索、卡片列表、触底分页；组织者可见「发布」入口；非 H5 有「扫码签到」图标。

- [ ] **Step 1: 整体替换 activity.vue**

```vue
<script lang="ts" setup>
import type { ActivityStateFilter, ActivityView } from '@/api/activity'
import { listActivities } from '@/api/activity'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { formatTimeRange } from '@/utils/datetime'
import { parseCheckinUrl } from '@/utils/checkin-link'
import { usePagedList } from '@/utils/use-paged-list'

definePage({
  style: {
    navigationBarTitleText: '活动',
  },
})

const TABS: { value: ActivityStateFilter, label: string }[] = [
  { value: 'active', label: '招募中' },
  { value: 'past', label: '已结束' },
  { value: 'cancelled', label: '已取消' },
]

const PAGE_SIZE = 10
const auth = useAuthStore()
const activeTab = ref<ActivityStateFilter>('active')
const keyword = ref('')

const { items, loading, finished, empty, reload, loadMore } = usePagedList<ActivityView>(
  (page) => {
    const kw = keyword.value.trim()
    return listActivities({
      state: activeTab.value,
      page,
      pageSize: PAGE_SIZE,
      ...(kw ? { keyword: kw } : {}),
    })
  },
  PAGE_SIZE,
)

const stateBadge: Record<string, { text: string, cls: string }> = {
  upcoming: { text: '未开始', cls: 'bg-hover text-sub' },
  ongoing: { text: '进行中', cls: 'bg-primary-soft text-primary-soft-text' },
  ended: { text: '已结束', cls: 'bg-hover text-muted' },
  cancelled: { text: '已取消', cls: 'bg-danger-soft text-danger' },
}

function capacityText(a: ActivityView): string {
  const cap = a.capacity === null ? '不限' : String(a.capacity)
  return `已报 ${a.registeredCount}/${cap}`
}

function switchTab(value: ActivityStateFilter) {
  if (activeTab.value === value)
    return
  activeTab.value = value
  void reload()
}

function onSearch() {
  void reload()
}

function clearKeyword() {
  if (!keyword.value)
    return
  keyword.value = ''
  void reload()
}

function openDetail(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

function publish() {
  uni.navigateTo({ url: '/pages/activity/edit' })
}

// #ifndef H5
function scanCheckIn() {
  uni.scanCode({
    success: (res) => {
      const parsed = parseCheckinUrl(res.result || '')
      if (!parsed) {
        uni.showToast({ title: '未识别到有效的签到码', icon: 'none' })
        return
      }
      uni.navigateTo({
        url: `/pages/activity/checkin?a=${parsed.activityId}&c=${parsed.code}`,
      })
    },
  })
}
// #endif

onShow(() => {
  // 从详情页报名/取消后返回、登录态变化后都刷新第一页
  void reload()
})

onReachBottom(() => {
  void loadMore()
})
</script>

<template>
  <view class="min-h-screen bg-page" style="padding-bottom: 96px">
    <!-- 顶部：标题 + 扫码（仅小程序/App）+ 发布（组织者） -->
    <view class="flex items-center px-3 pt-3">
      <text class="text-5 text-ink font-semibold">
        活动
      </text>
      <view class="ml-auto flex items-center">
        <!-- #ifndef H5 -->
        <view
          class="center mr-2 h-32px w-32px rounded-full bg-card shadow-sm"
          @click="scanCheckIn"
        >
          <view class="i-carbon-scan text-18px text-sub" />
        </view>
        <!-- #endif -->
        <view
          v-if="auth.canManageActivity"
          class="flex items-center rounded-full bg-primary px-3 py-1.5"
          @click="publish"
        >
          <view class="i-carbon-add mr-1 text-16px text-white" />
          <text class="text-3.5 text-white">
            发布活动
          </text>
        </view>
      </view>
    </view>

    <!-- 搜索 -->
    <view class="px-3 pt-3">
      <view class="flex h-36px items-center rounded-full bg-card px-3 shadow-sm">
        <view class="i-carbon-search mr-2 text-16px text-muted" />
        <input
          v-model="keyword"
          confirm-type="search"
          placeholder="搜索活动标题或地点"
          class="flex-1 text-3.5 text-ink"
          @confirm="onSearch"
        >
        <view
          v-if="keyword"
          class="i-carbon-close-circle-filled ml-2 text-16px text-muted"
          @click="clearKeyword"
        />
      </view>
    </view>

    <!-- 分段 tabs -->
    <view class="flex px-3 pt-3">
      <view
        v-for="tab in TABS"
        :key="tab.value"
        class="mr-2 rounded-full px-4 py-1.5 text-3.5"
        :class="activeTab === tab.value ? 'bg-primary text-white' : 'bg-card text-sub'"
        @click="switchTab(tab.value)"
      >
        {{ tab.label }}
      </view>
    </view>

    <!-- 列表 -->
    <view class="px-3 pt-3">
      <view
        v-for="a in items"
        :key="a.id"
        class="mb-3 overflow-hidden rounded-3 bg-card shadow-sm"
        @click="openDetail(a.id)"
      >
        <view class="flex">
          <image
            v-if="a.coverUrl"
            :src="resolveMediaUrl(a.coverUrl)"
            mode="aspectFill"
            class="h-100px w-120px shrink-0 bg-hover"
          >
          </image>
          <view class="flex-1 p-3">
            <view class="flex items-center">
              <text class="text-4 text-ink font-medium" style="max-width: 320rpx">
                {{ a.title }}
              </text>
              <text
                class="ml-2 shrink-0 rounded-full px-2 py-0.5 text-3"
                :class="stateBadge[a.state]?.cls"
              >
                {{ stateBadge[a.state]?.text }}
              </text>
            </view>
            <view class="i-carbon-time mt-2 flex items-center text-3 text-sub">
              <text class="ml-1">{{ formatTimeRange(a.startTime, a.endTime) }}</text>
            </view>
            <view class="i-carbon-location mt-1 flex items-center text-3 text-sub">
              <text class="ml-1 max-w-300px truncate">{{ a.location.name }}</text>
            </view>
            <view class="mt-2 flex items-center">
              <text class="text-3 text-muted">{{ capacityText(a) }}</text>
              <text
                v-if="a.state === 'upcoming' && a.remaining === 0"
                class="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-3 text-danger"
              >
                名额已满
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- 空态 / 底部状态 -->
      <view v-if="empty" class="flex flex-col items-center py-20">
        <view class="i-carbon-event-schedule text-48px text-muted" />
        <text class="mt-3 text-3.5 text-muted">
          暂无活动
        </text>
      </view>
      <view v-else-if="loading" class="py-4 text-center text-3 text-muted">
        加载中…
      </view>
      <view v-else-if="finished" class="py-4 text-center text-3 text-muted">
        没有更多了
      </view>
    </view>
  </view>
</template>
```

- [ ] **Step 2: 检查点**

Run: `bun run type-check ; bun run lint`
Expected: 0 error / 0 problem。H5 打开 http://localhost:3333 活动 tab（后端在跑且已有数据时可见卡片；无数据显示空态，tabs/搜索/发布按钮按角色显示正确）。

Git（仅当用户已明确要求提交）：

```bash
git add frontend/src/http/alova.ts frontend/src/api/activity.ts frontend/src/store/auth.ts frontend/src/utils frontend/env frontend/src/env.d.ts frontend/manifest.config.ts frontend/src/pages/activity/activity.vue
```

---

## Task 5: 活动详情页

**Files:**
- Create: `src/pages/activity/detail.vue`

- [ ] **Step 1: 创建 detail.vue（完整文件）**

```vue
<script lang="ts" setup>
import type { ActivityView } from '@/api/activity'
import {
  cancelActivity as cancelActivityApi,
  cancelMyRegistration,
  getActivity,
  registerToActivity,
} from '@/api/activity'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { formatDateTime, formatTimeRange } from '@/utils/datetime'
import { openActivityNavigation } from '@/utils/location'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '活动详情',
  },
})

const auth = useAuthStore()
const activityId = ref('')
const detail = ref<ActivityView | null>(null)
const loading = ref(false)
const acting = ref(false)

const myReg = computed(() => detail.value?.myRegistration ?? null)
const isCancelled = computed(() => detail.value?.state === 'cancelled')
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null

/** 客户端仅做按钮置灰，最终规则以后端 409 message 为准。 */
const registerClosedReason = computed<string | null>(() => {
  const a = detail.value
  if (!a || a.status !== 'published')
    return null
  if (a.state === 'ended')
    return '活动已结束'
  if (a.remaining === 0)
    return '名额已满'
  const deadline = a.registerDeadline ?? a.startTime
  if (now.value >= new Date(deadline).getTime())
    return '报名已截止'
  return null
})
const canCancelReg = computed(() =>
  myReg.value?.status === 'registered'
  && !!detail.value
  && now.value < new Date(detail.value.startTime).getTime(),
)

async function load() {
  if (!activityId.value)
    return
  loading.value = true
  try {
    detail.value = await getActivity(activityId.value)
  }
  finally {
    loading.value = false
  }
}

function ensureLogin(): boolean {
  if (auth.isLoggedIn)
    return true
  toLoginPage()
  return false
}

function doRegister() {
  if (!ensureLogin() || !detail.value)
    return
  const a = detail.value
  uni.showModal({
    title: '确认报名',
    content: `${formatTimeRange(a.startTime, a.endTime)}\n${a.location.name}`,
    confirmText: '确认报名',
    success: (res) => {
      if (!res.confirm)
        return
      void submitRegister()
    },
  })
}

async function submitRegister() {
  if (acting.value)
    return
  acting.value = true
  try {
    await registerToActivity(activityId.value)
    uni.showToast({ title: '报名成功', icon: 'success' })
    await load()
  }
  catch {
    // 409/422 message 已由拦截器 toast
  }
  finally {
    acting.value = false
  }
}

function doCancelRegistration() {
  uni.showModal({
    title: '取消报名',
    content: '确定取消本次活动报名吗？',
    confirmText: '取消报名',
    success: (res) => {
      if (!res.confirm)
        return
      void submitCancelRegistration()
    },
  })
}

async function submitCancelRegistration() {
  if (acting.value)
    return
  acting.value = true
  try {
    await cancelMyRegistration(activityId.value)
    uni.showToast({ title: '已取消报名', icon: 'none' })
    await load()
  }
  catch {
    // 拦截器已提示
  }
  finally {
    acting.value = false
  }
}

function goCheckIn() {
  if (!ensureLogin())
    return
  uni.navigateTo({ url: `/pages/activity/checkin?a=${activityId.value}` })
}

// —— 组织者动作 ——
function goEdit() {
  uni.navigateTo({ url: `/pages/activity/edit?id=${activityId.value}` })
}

function goCode() {
  uni.navigateTo({ url: `/pages/activity/checkin-code?id=${activityId.value}` })
}

function goRegistrations() {
  uni.navigateTo({ url: `/pages/activity/registrations?id=${activityId.value}` })
}

function doCancelActivity() {
  uni.showModal({
    title: '取消活动',
    content: '活动取消后不可恢复，已报名用户需自行知悉。确定取消该活动吗？',
    confirmText: '确认取消',
    confirmColor: '#ef4444',
    success: (res) => {
      if (!res.confirm)
        return
      void submitCancelActivity()
    },
  })
}

async function submitCancelActivity() {
  if (acting.value)
    return
  acting.value = true
  try {
    await cancelActivityApi(activityId.value)
    uni.showToast({ title: '活动已取消', icon: 'none' })
    await load()
  }
  catch {
    // 拦截器已提示
  }
  finally {
    acting.value = false
  }
}

const progressPercent = computed(() => {
  const a = detail.value
  if (!a || a.capacity === null || a.capacity <= 0)
    return a?.capacity === null ? 0 : 0
  return Math.min(100, Math.round((a.registeredCount / a.capacity) * 100))
})

onLoad((options) => {
  activityId.value = options?.id ?? ''
  void load()
})

onShow(() => {
  // 从编辑/签到页返回时刷新
  void load()
  nowTimer = setInterval(() => { now.value = Date.now() }, 30_000)
})

onHide(() => {
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
})

onUnload(() => {
  if (nowTimer)
    clearInterval(nowTimer)
})
</script>

<template>
  <view class="min-h-screen bg-page" style="padding-bottom: 140px">
    <view v-if="detail">
      <!-- 取消提示条 -->
      <view v-if="isCancelled" class="bg-danger-soft px-4 py-2 text-3.5 text-danger">
        该活动已取消，报名与签到已关闭
      </view>

      <!-- 封面 -->
      <image
        v-if="detail.coverUrl"
        :src="resolveMediaUrl(detail.coverUrl)"
        mode="widthFix"
        class="w-full bg-hover"
      />

      <view class="px-3 pt-3">
        <!-- 标题与时间 -->
        <view class="rounded-3 bg-card p-4 shadow-sm">
          <text class="text-5 text-ink font-semibold leading-7">
            {{ detail.title }}
          </text>
          <view class="mt-3 flex items-start">
            <view class="i-carbon-time mt-0.5 text-16px text-muted" />
            <view class="ml-2">
              <text class="block text-3.5 text-sub">{{ formatTimeRange(detail.startTime, detail.endTime) }}</text>
              <text class="mt-1 block text-3 text-muted">
                报名截止：{{ detail.registerDeadline ? formatDateTime(detail.registerDeadline) : '活动开始前' }}
              </text>
            </view>
          </view>
        </view>

        <!-- 位置 -->
        <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
          <view class="flex items-start">
            <view class="i-carbon-location mt-0.5 text-16px text-muted" />
            <view class="ml-2 flex-1">
              <text class="block text-4 text-ink">
                {{ detail.location.name }}
              </text>
              <text class="mt-1 block text-3.5 text-sub">
                {{ detail.location.address }}
              </text>
              <text v-if="!detail.location.latitude" class="mt-1 block text-3 text-muted">
                （未提供精确坐标）
              </text>
            </view>
            <view
              v-if="detail.location.latitude"
              class="ml-2 shrink-0 rounded-full bg-primary-soft px-3 py-1 text-3.5 text-primary-soft-text"
              @click="openActivityNavigation(detail.location)"
            >
              导航
            </view>
          </view>
        </view>

        <!-- 名额 -->
        <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
          <view class="flex items-center text-3.5">
            <text class="text-sub">已报名 {{ detail.registeredCount }} 人</text>
            <text class="ml-2 text-muted">
              / {{ detail.capacity === null ? '不限' : `上限 ${detail.capacity} 人` }}
            </text>
            <text class="ml-auto text-muted">已签到 {{ detail.checkedInCount }} 人</text>
          </view>
          <view v-if="detail.capacity !== null" class="mt-2 h-8px overflow-hidden rounded-full bg-hover">
            <view
              class="h-full rounded-full bg-primary transition-all"
              :style="{ width: `${progressPercent}%` }"
            />
          </view>
        </view>

        <!-- 详情 -->
        <view v-if="detail.description" class="mt-3 rounded-3 bg-card p-4 shadow-sm">
          <text class="text-4 text-ink font-medium">活动详情</text>
          <text class="mt-2 block whitespace-pre-wrap text-3.5 leading-6 text-sub">
            {{ detail.description }}
          </text>
        </view>

        <!-- 组织者区 -->
        <view v-if="auth.canManageActivity" class="mt-3 rounded-3 bg-card p-4 shadow-sm">
          <text class="text-4 text-ink font-medium">组织者操作</text>
          <view class="mt-3 flex flex-wrap">
            <view class="mr-3 mb-2 flex items-center rounded-full bg-primary-soft px-4 py-1.5 text-3.5 text-primary-soft-text" @click="goEdit">
              <view class="i-carbon-edit mr-1 text-14px" /> 编辑活动
            </view>
            <view class="mr-3 mb-2 flex items-center rounded-full bg-primary-soft px-4 py-1.5 text-3.5 text-primary-soft-text" @click="goCode">
              <view class="i-carbon-qr-code mr-1 text-14px" /> 出示签到码
            </view>
            <view class="mr-3 mb-2 flex items-center rounded-full bg-primary-soft px-4 py-1.5 text-3.5 text-primary-soft-text" @click="goRegistrations">
              <view class="i-carbon-list mr-1 text-14px" /> 报名名单
            </view>
            <view
              v-if="!isCancelled"
              class="mb-2 flex items-center rounded-full bg-danger-soft px-4 py-1.5 text-3.5 text-danger"
              @click="doCancelActivity"
            >
              <view class="i-carbon-circle-slash mr-1 text-14px" /> 取消活动
            </view>
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="!loading" class="pt-30 text-center text-4 text-muted">
      活动不存在或已下线
    </view>

    <!-- 底部操作条 -->
    <view
      v-if="detail && !isCancelled"
      class="fixed bottom-0 left-0 right-0 flex items-center border-t border-line bg-card px-3 py-2"
      style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px)"
    >
      <!-- 游客 -->
      <button
        v-if="!auth.isLoggedIn"
        class="h-44px flex-1 rounded-2 bg-primary text-4 text-white"
        @click="ensureLogin()"
      >
        登录后报名
      </button>

      <!-- 已签到 -->
      <button
        v-else-if="myReg?.status === 'checked_in'"
        disabled
        class="h-44px flex-1 rounded-2 bg-hover text-4 text-muted"
      >
        已签到
      </button>

      <!-- 已报名 -->
      <template v-else-if="myReg?.status === 'registered'">
        <button
          class="mr-2 h-44px flex-1 rounded-2 bg-primary text-4 text-white"
          @click="goCheckIn"
        >
          活动签到
        </button>
        <button
          :disabled="!canCancelReg || acting"
          class="h-44px flex-1 rounded-2 border border-line-strong text-4"
          :class="canCancelReg ? 'text-danger bg-card' : 'text-muted bg-hover'"
          @click="doCancelRegistration"
        >
          取消报名
        </button>
      </template>

      <!-- 未报名 / 已取消 -->
      <template v-else>
        <button
          :disabled="!!registerClosedReason || acting"
          class="h-44px flex-1 rounded-2 text-4 text-white"
          :class="registerClosedReason ? 'bg-hover text-muted' : 'bg-primary'"
          @click="doRegister"
        >
          {{ registerClosedReason || (myReg?.status === 'cancelled' ? '重新报名' : '立即报名') }}
        </button>
      </template>
    </view>
  </view>
</template>
```

- [ ] **Step 2: 检查点**

Run: `bun run type-check ; bun run lint`
Expected: 0 error / 0 problem。

走查（后端在跑）：游客可见详情与「登录后报名」；登录用户报名→二次确认→底条变「活动签到/取消报名」；组织者看到四个操作入口。

---

## Task 6: 发布 / 编辑活动页

**Files:**
- Create: `src/pages/activity/edit.vue`

- [ ] **Step 1: 创建 edit.vue（完整文件）**

```vue
<script lang="ts" setup>
import type { ActivityPayload } from '@/api/activity'
import type { MediaItem } from '@/api/media'
import { createActivity, getActivity, updateActivity } from '@/api/activity'
import { useAuthStore } from '@/store/auth'
import type { DatetimePickerInstance } from '@/utils/wd-picker-types'
import { chooseActivityLocation } from '@/utils/location'
import { formatDateTime } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '活动信息',
  },
})

const auth = useAuthStore()
const editingId = ref('')
const submitting = ref(false)

const form = ref({
  title: '',
  description: '',
  coverUrl: '' as string,
  startTs: 0,
  endTs: 0,
  hasDeadline: false,
  deadlineTs: 0,
  capacityText: '',
  location: {
    name: '',
    address: '',
    latitude: null as number | null,
    longitude: null as number | null,
  },
})

const startPicker = ref<DatetimePickerInstance | null>(null)
const endPicker = ref<DatetimePickerInstance | null>(null)
const deadlinePicker = ref<DatetimePickerInstance | null>(null)

function nextHourTs(): number {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d.getTime()
}

onLoad((options) => {
  if (!auth.canManageActivity) {
    uni.showToast({ title: '没有发布活动的权限', icon: 'none' })
    toLoginPage({ mode: 'reLaunch', redirect: null })
    return
  }
  const start = nextHourTs()
  form.value.startTs = start
  form.value.endTs = start + 2 * 3600_000
  form.value.deadlineTs = start
  if (options?.id) {
    editingId.value = options.id
    uni.setNavigationBarTitle({ title: '编辑活动' })
    void prefill(options.id)
  }
})

async function prefill(id: string) {
  try {
    const a = await getActivity(id)
    form.value.title = a.title
    form.value.description = a.description
    form.value.coverUrl = a.coverUrl ?? ''
    form.value.startTs = new Date(a.startTime).getTime()
    form.value.endTs = new Date(a.endTime).getTime()
    form.value.hasDeadline = !!a.registerDeadline
    form.value.deadlineTs = a.registerDeadline
      ? new Date(a.registerDeadline).getTime()
      : form.value.startTs
    form.value.capacityText = a.capacity === null ? '' : String(a.capacity)
    form.value.location = { ...a.location }
  }
  catch {
    // 拦截器已提示
  }
}

// —— 封面（复用通用上传组件，裸模式）——
const coverUploader = ref<{ trigger: () => void, reset: () => void } | null>(null)

function chooseCover() {
  coverUploader.value?.trigger()
}

async function onCoverChange(items: MediaItem[]) {
  const file = items[0]
  if (file && file.status === 'done')
    form.value.coverUrl = file.url
  coverUploader.value?.reset()
}

function removeCover() {
  form.value.coverUrl = ''
}

// —— 时间选择 ——
function onStartPick({ value }: { value: string | number | Array<string | number> }) {
  form.value.startTs = Number(value)
}
function onEndPick({ value }: { value: string | number | Array<string | number> }) {
  form.value.endTs = Number(value)
}
function onDeadlinePick({ value }: { value: string | number | Array<string | number> }) {
  form.value.deadlineTs = Number(value)
}

function onDeadlineToggle(e: { detail: { value: boolean } }) {
  form.value.hasDeadline = e.detail.value
}

// —— 位置 ——
async function chooseOnMap() {
  const result = await chooseActivityLocation()
  if (result.ok) {
    form.value.location = result.location
    return
  }
  if (!result.cancelled)
    uni.showToast({ title: result.message, icon: 'none' })
}

// —— 校验（与后端 Zod 规则对齐；错误先在前端拦一道）——
function validate(): string | null {
  const f = form.value
  const title = f.title.trim()
  if (title.length < 2 || title.length > 50)
    return '标题需 2~50 个字'
  if (f.description.length > 2000)
    return '活动详情不能超过 2000 字'
  if (!f.startTs || !f.endTs)
    return '请选择活动开始与结束时间'
  if (f.endTs <= f.startTs)
    return '结束时间必须晚于开始时间'
  if (f.hasDeadline && f.deadlineTs > f.startTs)
    return '报名截止时间不能晚于活动开始时间'
  if (f.capacityText.trim() !== '') {
    const cap = Number(f.capacityText)
    if (!Number.isInteger(cap) || cap < 1 || cap > 99999)
      return '人数上限需为 1~99999 的整数（留空表示不限）'
  }
  const name = f.location.name.trim()
  const address = f.location.address.trim()
  if (!name || name.length > 100)
    return '请填写地点名称（1~100 字）'
  if (!address || address.length > 200)
    return '请填写详细地址（1~200 字）'
  return null
}

function buildPayload(): ActivityPayload {
  const f = form.value
  return {
    title: f.title.trim(),
    description: f.description,
    coverUrl: f.coverUrl || null,
    location: {
      name: f.location.name.trim(),
      address: f.location.address.trim(),
      latitude: f.location.latitude,
      longitude: f.location.longitude,
    },
    startTime: new Date(f.startTs).toISOString(),
    endTime: new Date(f.endTs).toISOString(),
    registerDeadline: f.hasDeadline ? new Date(f.deadlineTs).toISOString() : null,
    capacity: f.capacityText.trim() === '' ? null : Number(f.capacityText),
  }
}

async function onSubmit() {
  if (!auth.canManageActivity) {
    toLoginPage({ mode: 'reLaunch' })
    return
  }
  const error = validate()
  if (error) {
    uni.showToast({ title: error, icon: 'none' })
    return
  }
  if (submitting.value)
    return
  submitting.value = true
  uni.showLoading({ title: '提交中', mask: true })
  try {
    if (editingId.value) {
      await updateActivity(editingId.value, buildPayload())
      uni.showToast({ title: '活动已更新', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    }
    else {
      const created = await createActivity(buildPayload())
      uni.showToast({ title: '活动发布成功', icon: 'success' })
      setTimeout(() => {
        uni.redirectTo({ url: `/pages/activity/detail?id=${created.id}` })
      }, 600)
    }
  }
  catch {
    // 409/422 message 已由拦截器 toast
  }
  finally {
    submitting.value = false
    uni.hideLoading()
  }
}
</script>

<template>
  <view class="min-h-screen bg-page px-3 py-3">
    <!-- 标题 -->
    <view class="rounded-3 bg-card p-4 shadow-sm">
      <text class="text-4 text-ink font-medium">活动标题</text>
      <input
        v-model="form.title"
        maxlength="50"
        placeholder="2~50 个字"
        class="mt-2 h-40px rounded-2 bg-hover px-3 text-4 text-ink"
      >
    </view>

    <!-- 封面 -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <text class="text-4 text-ink font-medium">封面图</text>
      <view class="mt-3 flex items-center">
        <image
          v-if="form.coverUrl"
          :src="form.coverUrl"
          mode="aspectFill"
          class="h-140px w-220px rounded-2 bg-hover"
          @click="chooseCover"
        />
        <view
          v-else
          class="center h-140px w-220px flex-col rounded-2 border border-line-strong border-dashed"
          @click="chooseCover"
        >
          <view class="i-carbon-image text-24px text-muted" />
          <text class="mt-1 text-3 text-muted">上传封面（可选）</text>
        </view>
        <view
          v-if="form.coverUrl"
          class="ml-3 rounded-full bg-danger-soft px-3 py-1.5 text-3.5 text-danger"
          @click="removeCover"
        >
          移除
        </view>
      </view>
      <media-uploader ref="coverUploader" type="image" bare @change="onCoverChange" />
    </view>

    <!-- 时间 -->
    <view class="mt-3 overflow-hidden rounded-3 bg-card shadow-sm">
      <view class="flex items-center px-4 py-3.5" @click="startPicker?.open()">
        <text class="text-4 text-sub">开始时间</text>
        <text class="ml-auto text-4 text-ink">{{ formatDateTime(form.startTs) }}</text>
        <view class="i-carbon-chevron-right ml-2 text-4 text-muted" />
      </view>
      <view class="flex items-center border-t border-line px-4 py-3.5" @click="endPicker?.open()">
        <text class="text-4 text-sub">结束时间</text>
        <text class="ml-auto text-4 text-ink">{{ formatDateTime(form.endTs) }}</text>
        <view class="i-carbon-chevron-right ml-2 text-4 text-muted" />
      </view>
      <view class="flex items-center border-t border-line px-4 py-3.5">
        <text class="text-4 text-sub">报名截止</text>
        <switch
          :checked="form.hasDeadline"
          color="#d14328"
          class="ml-auto"
          @change="onDeadlineToggle"
        />
      </view>
      <view
        v-if="form.hasDeadline"
        class="flex items-center border-t border-line px-4 py-3.5"
        @click="deadlinePicker?.open()"
      >
        <text class="text-4 text-sub">截止时间</text>
        <text class="ml-auto text-4 text-ink">{{ formatDateTime(form.deadlineTs) }}</text>
        <view class="i-carbon-chevron-right ml-2 text-4 text-muted" />
      </view>
      <view class="flex items-center border-t border-line px-4 py-3.5">
        <text class="text-4 text-sub">人数上限</text>
        <input
          v-model="form.capacityText"
          type="number"
          placeholder="留空表示不限"
          class="ml-auto h-32px w-200px rounded-2 bg-hover px-3 text-right text-4 text-ink"
        >
      </view>
    </view>

    <!-- 位置 -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <view class="flex items-center">
        <text class="text-4 text-ink font-medium">活动地点</text>
        <view
          class="ml-auto flex items-center rounded-full bg-primary-soft px-3 py-1.5 text-3.5 text-primary-soft-text"
          @click="chooseOnMap"
        >
          <view class="i-carbon-location mr-1 text-14px" /> 地图选点
        </view>
      </view>
      <input
        v-model="form.location.name"
        maxlength="100"
        placeholder="地点名称（必填）"
        class="mt-3 h-40px rounded-2 bg-hover px-3 text-4 text-ink"
      >
      <input
        v-model="form.location.address"
        maxlength="200"
        placeholder="详细地址（必填）"
        class="mt-2 h-40px rounded-2 bg-hover px-3 text-4 text-ink"
      >
      <text class="mt-2 block text-3 text-muted">
        {{ form.location.latitude ? `已选坐标（${form.location.latitude}, ${form.location.longitude}）` : '未选坐标也可发布，参与者将看不到导航按钮' }}
      </text>
    </view>

    <!-- 详情 -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <text class="text-4 text-ink font-medium">活动详情</text>
      <textarea
        v-model="form.description"
        maxlength="2000"
        placeholder="介绍活动内容、注意事项等（不超过 2000 字）"
        class="mt-2 h-200px w-full rounded-2 bg-hover p-3 text-4 text-ink"
      />
    </view>

    <button
      :disabled="submitting"
      class="mt-4 h-46px w-full rounded-2 bg-primary text-4 text-white"
      @click="onSubmit"
    >
      {{ editingId ? '保存修改' : '发布活动' }}
    </button>

    <!-- 三个弹出式时间选择器 -->
    <wd-datetime-picker
      ref="startPicker"
      v-model="form.startTs"
      type="datetime"
      title="选择开始时间"
      @confirm="onStartPick"
    />
    <wd-datetime-picker
      ref="endPicker"
      v-model="form.endTs"
      type="datetime"
      title="选择结束时间"
      @confirm="onEndPick"
    />
    <wd-datetime-picker
      v-if="form.hasDeadline"
      ref="deadlinePicker"
      v-model="form.deadlineTs"
      type="datetime"
      title="选择报名截止时间"
      @confirm="onDeadlinePick"
    />
  </view>
</template>
```

- [ ] **Step 2: 创建 picker 实例类型垫片** — `src/utils/wd-picker-types.ts`

easycom 组件没有全局 TS 类型（AGENTS §8 明确不引 `@wot-ui/ui/global`），用结构类型最小描述 ref 暴露面：

```ts
/** 仅描述页面实际用到的 wd-datetime-picker 命令式方法（组件经 easycom 解析，无需全局类型）。 */
export interface DatetimePickerInstance {
  open: () => void
  close: () => void
}
```

- [ ] **Step 3: 检查点**

Run: `bun run type-check ; bun run lint`
Expected: 0 error / 0 problem。若 vue-tsc 报三个 picker ref 与 easycom 组件实例不兼容（profile.vue 的结构类型 ref 对显式 import 组件已验证可行，easycom 组件类型以本地实际生成物为准），把三个 ref 放宽为 `ref<DatetimePickerInstance | null>(null)` 保持不变、仅在 ref 初始化处改 `ref<any>(null)` 并保留调用处结构。

走查：组织者账号进入发布页；地图选点（H5 未配 key 时按降级提示走手动填写）；时间校验拦截 end<=start；发布成功跳详情；详情页「编辑活动」进入时表单回填。

---

## Task 7: 参与者签到页

**Files:**
- Create: `src/pages/activity/checkin.vue`

- [ ] **Step 1: 创建 checkin.vue（完整文件）**

```vue
<script lang="ts" setup>
import type { ActivityView } from '@/api/activity'
import { checkInActivity, getActivity } from '@/api/activity'
import { useAuthStore } from '@/store/auth'
import { formatDateTime, formatTimeRange } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '活动签到',
  },
})

const auth = useAuthStore()
const activityId = ref('')
const activity = ref<ActivityView | null>(null)
const code = ref('')
const submitting = ref(false)
const successAt = ref('')

function normalizeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6)
}

function onCodeInput(e: { detail: { value: string } }) {
  code.value = normalizeCode(e.detail.value)
}

async function loadActivity() {
  if (!activityId.value)
    return
  try {
    activity.value = await getActivity(activityId.value)
  }
  catch {
    activity.value = null
  }
}

async function submit() {
  if (!auth.isLoggedIn) {
    toLoginPage()
    return
  }
  if (code.value.length !== 6 || submitting.value)
    return
  submitting.value = true
  try {
    await checkInActivity(activityId.value, code.value)
    successAt.value = formatDateTime(new Date())
    uni.showToast({ title: '签到成功', icon: 'success' })
  }
  catch {
    // 422/409 message 已由拦截器 toast，保留在当前页可改码重试
  }
  finally {
    submitting.value = false
  }
}

onLoad((options) => {
  activityId.value = options?.a ?? ''
  code.value = normalizeCode(options?.c ?? '')
  void loadActivity()
})

onShow(() => {
  // 登录回跳后继续可用
  if (!auth.isLoggedIn)
    toLoginPage({ mode: 'navigateTo' })
})
</script>

<template>
  <view class="min-h-screen bg-page px-4 pt-4">
    <!-- 链接无效 -->
    <view v-if="!activityId" class="pt-24 text-center">
      <view class="i-carbon-warning-alt text-48px text-muted" />
      <text class="mt-3 block text-4 text-muted">签到链接无效</text>
    </view>

    <template v-else>
      <!-- 活动摘要 -->
      <view v-if="activity" class="rounded-3 bg-card p-4 shadow-sm">
        <text class="text-5 text-ink font-semibold">{{ activity.title }}</text>
        <text class="mt-2 block text-3.5 text-sub">
          {{ formatTimeRange(activity.startTime, activity.endTime) }}
        </text>
        <text class="mt-1 block text-3.5 text-sub">{{ activity.location.name }}</text>
      </view>

      <!-- 成功态 -->
      <view v-if="successAt" class="mt-4 flex flex-col items-center rounded-3 bg-card p-6 shadow-sm">
        <view class="center h-100px w-100px rounded-full bg-primary-soft">
          <view class="i-carbon-checkmark-outline text-56px text-primary-soft-text" />
        </view>
        <text class="mt-4 text-5 text-ink font-semibold">签到成功</text>
        <text class="mt-2 text-3.5 text-muted">签到时间：{{ successAt }}</text>
      </view>

      <!-- 输入态 -->
      <view v-else class="mt-4 rounded-3 bg-card p-5 shadow-sm">
        <text class="text-4 text-ink font-medium">请输入 6 位签到码</text>
        <input
          :value="code"
          type="number"
          :maxlength="6"
          placeholder="6 位数字"
          class="mt-4 h-56px rounded-2 bg-hover text-center text-6 font-bold tracking-8px"
          @input="onCodeInput"
        >
        <text class="mt-3 block text-3 text-muted">
          签到码由现场组织者出示，每分钟自动更新
        </text>
        <button
          :disabled="code.length !== 6 || submitting"
          class="mt-5 h-46px w-full rounded-2 text-4 text-white"
          :class="code.length === 6 && !submitting ? 'bg-primary' : 'bg-hover text-muted'"
          @click="submit"
        >
          {{ submitting ? '签到中…' : '确认签到' }}
        </button>
        <view v-if="!auth.isLoggedIn" class="mt-3 text-center text-3.5 text-primary-soft-text" @click="toLoginPage()">
          登录后完成签到
        </view>
      </view>
    </template>
  </view>
</template>
```

- [ ] **Step 2: 检查点**

Run: `bun run type-check ; bun run lint`
Expected: 0 error / 0 problem。
走查：浏览器直接访问 `http://localhost:3333/#/pages/activity/checkin?a=<id>&c=000000` 显示活动标题与预填码；未登录点确认跳登录页（回跳带回 a/c）；错码显示后端 toast 且不离开页面，可改码重试。

---

## Task 8: 组织者滚动签到码页

**Files:**
- Create: `src/pages/activity/checkin-code.vue`

- [ ] **Step 1: 创建 checkin-code.vue（完整文件）**

```vue
<script lang="ts" setup>
import { getCheckInCode } from '@/api/activity'
import { useAuthStore } from '@/store/auth'
import { buildCheckinUrl, getH5BaseUrl } from '@/utils/checkin-link'
import { secondsUntilNextMinute } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '现场签到码',
  },
})

const auth = useAuthStore()
const activityId = ref('')
const code = ref('')
const expiresAt = ref(0)
const remainSeconds = ref(60)
const refreshing = ref(false)
const refreshFailed = ref(false)
const qrText = ref('')

let tickTimer: ReturnType<typeof setInterval> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null

async function refresh(): Promise<void> {
  refreshing.value = true
  try {
    const res = await getCheckInCode(activityId.value)
    code.value = res.code
    expiresAt.value = new Date(res.expiresAt).getTime()
    refreshFailed.value = false
    const base = getH5BaseUrl()
    qrText.value = base ? buildCheckinUrl(base, activityId.value, res.code) : ''
    remainSeconds.value = Math.max(1, Math.ceil((expiresAt.value - Date.now()) / 1000))
  }
  catch {
    // 旧码仍处于服务端上一窗口容忍期，保留旧码不黑屏，3 秒后重试
    refreshFailed.value = true
    retryTimer = setTimeout(() => void refresh(), 3000)
  }
  finally {
    refreshing.value = false
  }
}

function tick() {
  if (!expiresAt.value) {
    remainSeconds.value = secondsUntilNextMinute()
    return
  }
  remainSeconds.value = Math.max(0, Math.ceil((expiresAt.value - Date.now()) / 1000))
  if (Date.now() >= expiresAt.value)
    void refresh()
}

onLoad((options) => {
  activityId.value = options?.id ?? ''
})

onShow(() => {
  if (!auth.canManageActivity) {
    uni.showToast({ title: '仅活动组织者可出示签到码', icon: 'none' })
    toLoginPage({ mode: 'reLaunch', redirect: null })
    return
  }
  void refresh()
  tickTimer = setInterval(tick, 1000)
})

onHide(() => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
})

onUnload(() => {
  if (tickTimer)
    clearInterval(tickTimer)
  if (retryTimer)
    clearTimeout(retryTimer)
})
</script>

<template>
  <view class="min-h-screen bg-page px-4 pt-4">
    <view class="flex flex-col items-center rounded-3 bg-card p-5 shadow-sm">
      <text class="text-4 text-sub">参与者微信扫一扫，或在签到页输入数字码</text>

      <!-- 二维码：wd-qr-code watch(text) 自动重绘，换窗口无需手动刷新 canvas -->
      <view class="mt-5 center h-260px w-260px rounded-3 bg-white p-3">
        <wd-qr-code v-if="qrText" :text="qrText" :size="236" :margin="8" />
        <view v-else class="i-carbon-qr-code text-120px text-muted" />
      </view>

      <!-- 6 位数字码 -->
      <view class="mt-5 flex items-center justify-center">
        <text
          v-for="(ch, i) in code.padEnd(6, ' ')"
          :key="i"
          class="mx-1 h-56px w-40px rounded-2 bg-hover text-center text-6 leading-56px font-bold text-ink"
          :class="ch === ' ' ? 'text-muted' : ''"
        >
          {{ ch.trim() === '' ? '–' : ch }}
        </text>
      </view>

      <!-- 倒计时 -->
      <view class="mt-4 flex items-center text-3.5">
        <view v-if="refreshFailed" class="text-danger">刷新失败，正在重试…</view>
        <template v-else>
          <view class="i-carbon-time mr-1 text-14px text-muted" />
          <text class="text-muted">{{ remainSeconds }} 秒后自动更新</text>
        </template>
      </view>
      <view class="mt-2 h-4px w-260px overflow-hidden rounded-full bg-hover">
        <view
          class="h-full bg-primary transition-all duration-1000 ease-linear"
          :style="{ width: `${(remainSeconds / 60) * 100}%` }"
        />
      </view>

      <text class="mt-5 text-3 text-muted">
        二维码每分钟滚动；签到仅在活动开始前 15 分钟至结束内有效
      </text>
      <text v-if="!qrText" class="mt-2 text-3 text-danger">
        未配置 VITE_H5_BASE_URL，当前仅能在小程序/App 内使用数字码
      </text>
    </view>
  </view>
</template>
```

- [ ] **Step 2: 检查点**

Run: `bun run type-check ; bun run lint`
Expected: 0 error / 0 problem。
走查（组织者账号，活动临近开始）：数字码与后端口径一致；跨过整分时自动请求下一个码、二维码内容随之变化、倒计时复位；把后端停掉时旧码保留且显示「刷新失败，正在重试…」。

---

## Task 9: 报名名单与补签页

**Files:**
- Create: `src/pages/activity/registrations.vue`

- [ ] **Step 1: 创建 registrations.vue（完整文件）**

```vue
<script lang="ts" setup>
import type { ActivityView, RegistrationWithUser } from '@/api/activity'
import { getActivity, listRegistrations, manualCheckIn } from '@/api/activity'
import { resolveMediaUrl } from '@/api/profile'
import { useAuthStore } from '@/store/auth'
import { formatDateTime } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '报名名单',
  },
})

const PAGE_SIZE = 20
const auth = useAuthStore()
const activityId = ref('')
const activity = ref<ActivityView | null>(null)
const rows = ref<RegistrationWithUser[]>([])
const page = ref(0)
const total = ref(0)
const loading = ref(false)
const finished = computed(() => rows.value.length >= total.value && total.value > 0)

const statusText: Record<string, string> = {
  registered: '已报名',
  checked_in: '已签到',
  cancelled: '已取消',
}
const statusCls: Record<string, string> = {
  registered: 'bg-primary-soft text-primary-soft-text',
  checked_in: 'bg-hover text-sub',
  cancelled: 'bg-danger-soft text-danger',
}

async function fetchPage(target: number) {
  const res = await listRegistrations(activityId.value, target, PAGE_SIZE)
  if (target === 1)
    rows.value = res.data
  else
    rows.value = rows.value.concat(res.data)
  total.value = res.pagination.total
  page.value = target
}

async function reload() {
  if (!activityId.value)
    return
  loading.value = true
  try {
    const [a] = await Promise.all([
      getActivity(activityId.value),
      fetchPage(1),
    ])
    activity.value = a
  }
  finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loading.value || finished.value)
    return
  loading.value = true
  try {
    await fetchPage(page.value + 1)
  }
  finally {
    loading.value = false
  }
}

function doManualCheckIn(row: RegistrationWithUser) {
  uni.showModal({
    title: '手动补签',
    content: `确认为 ${row.userName || '该用户'} 补签吗？`,
    confirmText: '确认补签',
    success: (res) => {
      if (!res.confirm)
        return
      void submitManual(row.userId)
    },
  })
}

async function submitManual(userId: string) {
  try {
    await manualCheckIn(activityId.value, userId)
    uni.showToast({ title: '补签成功', icon: 'success' })
    await fetchPage(1)
  }
  catch {
    // 拦截器已提示
  }
}

onLoad((options) => {
  activityId.value = options?.id ?? ''
})

onShow(() => {
  if (!auth.canManageActivity) {
    uni.showToast({ title: '仅活动组织者可查看名单', icon: 'none' })
    toLoginPage({ mode: 'reLaunch', redirect: null })
    return
  }
  void reload()
})

onReachBottom(() => {
  void loadMore()
})
</script>

<template>
  <view class="min-h-screen bg-page px-3 pt-3" style="padding-bottom: 24px">
    <!-- 统计头 -->
    <view v-if="activity" class="flex rounded-3 bg-card p-4 shadow-sm">
      <view class="flex-1 text-center">
        <text class="block text-5 text-ink font-semibold">{{ activity.registeredCount }}</text>
        <text class="mt-1 block text-3 text-muted">有效报名</text>
      </view>
      <view class="flex-1 text-center">
        <text class="block text-5 text-ink font-semibold">{{ activity.checkedInCount }}</text>
        <text class="mt-1 block text-3 text-muted">已签到</text>
      </view>
      <view class="flex-1 text-center">
        <text class="block text-5 text-ink font-semibold">
          {{ activity.capacity === null ? '不限' : activity.capacity }}
        </text>
        <text class="mt-1 block text-3 text-muted">人数上限</text>
      </view>
      <view class="flex-1 text-center">
        <text class="block text-5 text-ink font-semibold">
          {{ activity.remaining === null ? '—' : activity.remaining }}
        </text>
        <text class="mt-1 block text-3 text-muted">剩余名额</text>
      </view>
    </view>

    <!-- 名单 -->
    <view class="mt-3 overflow-hidden rounded-3 bg-card shadow-sm">
      <view
        v-for="(row, idx) in rows"
        :key="row.id"
        class="flex items-center px-4 py-3"
        :class="idx > 0 ? 'border-t border-line' : ''"
      >
        <image
          :src="resolveMediaUrl(row.userImage) || '/static/images/default-avatar.png'"
          class="h-38px w-38px rounded-full bg-hover"
        />
        <view class="ml-3 flex-1">
          <view class="flex items-center">
            <text class="text-4 text-ink">{{ row.userName || '未命名用户' }}</text>
            <text class="ml-2 rounded-full px-2 py-0.5 text-3" :class="statusCls[row.status]">
              {{ statusText[row.status] }}
            </text>
          </view>
          <text class="mt-0.5 block text-3 text-muted">
            {{ row.userPhone || '未绑定手机号' }}
          </text>
          <text v-if="row.checkInAt" class="mt-0.5 block text-3 text-muted">
            签到：{{ formatDateTime(row.checkInAt) }}{{ row.checkInMethod === 'manual' ? '（补签）' : '' }}
          </text>
        </view>
        <view
          v-if="row.status === 'registered'"
          class="ml-2 shrink-0 rounded-full bg-primary-soft px-3 py-1.5 text-3.5 text-primary-soft-text"
          @click="doManualCheckIn(row)"
        >
          补签
        </view>
      </view>

      <view v-if="!loading && rows.length === 0" class="py-16 text-center text-4 text-muted">
        暂无报名记录
      </view>
      <view v-else-if="loading" class="py-4 text-center text-3 text-muted">
        加载中…
      </view>
      <view v-else-if="finished" class="py-4 text-center text-3 text-muted">
        共 {{ total }} 条，没有更多了
      </view>
    </view>
  </view>
</template>
```

- [ ] **Step 2: 检查点**

Run: `bun run type-check ; bun run lint`
Expected: 0 error / 0 problem。
走查：统计头数字与后端 detail 一致；registered 行有「补签」，点击二次确认后变「已签到（补签）」；cancelled 行无按钮；触底加载第 2 页。

---

## Task 10: 我的报名页 + 菜单接线

**Files:**
- Create: `src/pages/activity/mine.vue`
- Modify: `src/pages/me/me.vue`（第 74 行菜单项加 url）

- [ ] **Step 1: 创建 mine.vue（完整文件）**

```vue
<script lang="ts" setup>
import type { MyRegistrationItem } from '@/api/activity'
import { listMyRegistrations } from '@/api/activity'
import { useAuthStore } from '@/store/auth'
import { formatTimeRange } from '@/utils/datetime'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '我的活动报名',
  },
})

const PAGE_SIZE = 10
const auth = useAuthStore()
const items = ref<MyRegistrationItem[]>([])
const page = ref(0)
const total = ref(0)
const loading = ref(false)
const finished = computed(() => items.value.length >= total.value && total.value > 0)

const statusText: Record<string, string> = {
  registered: '已报名',
  checked_in: '已签到',
  cancelled: '已取消',
}
const statusCls: Record<string, string> = {
  registered: 'bg-primary-soft text-primary-soft-text',
  checked_in: 'bg-hover text-sub',
  cancelled: 'bg-danger-soft text-danger',
}

async function fetchPage(target: number) {
  const res = await listMyRegistrations(target, PAGE_SIZE)
  items.value = target === 1 ? res.data : items.value.concat(res.data)
  total.value = res.pagination.total
  page.value = target
}

async function reload() {
  loading.value = true
  try {
    await fetchPage(1)
  }
  finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loading.value || finished.value)
    return
  loading.value = true
  try {
    await fetchPage(page.value + 1)
  }
  finally {
    loading.value = false
  }
}

function openDetail(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

onShow(() => {
  if (!auth.isLoggedIn) {
    toLoginPage({ mode: 'reLaunch' })
    return
  }
  void reload()
})

onReachBottom(() => {
  void loadMore()
})
</script>

<template>
  <view class="min-h-screen bg-page px-3 pt-3" style="padding-bottom: 24px">
    <view
      v-for="item in items"
      :key="item.registration.id"
      class="mb-3 rounded-3 bg-card p-4 shadow-sm"
      @click="openDetail(item.activity.id)"
    >
      <view class="flex items-center">
        <text class="text-4 text-ink font-medium">{{ item.activity.title }}</text>
        <text class="ml-2 rounded-full px-2 py-0.5 text-3" :class="statusCls[item.registration.status]">
          {{ statusText[item.registration.status] }}
        </text>
        <view v-if="item.activity.state === 'cancelled'" class="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-3 text-danger">
          活动已取消
        </view>
      </view>
      <text class="mt-2 block text-3.5 text-sub">
        {{ formatTimeRange(item.activity.startTime, item.activity.endTime) }}
      </text>
      <text class="mt-1 block text-3 text-muted">
        {{ item.activity.location.name }}
      </text>
    </view>

    <view v-if="!loading && items.length === 0" class="flex flex-col items-center py-20">
      <view class="i-carbon-calendar-star text-48px text-muted" />
      <text class="mt-3 text-3.5 text-muted">还没有报名记录</text>
    </view>
    <view v-else-if="loading" class="py-4 text-center text-3 text-muted">
      加载中…
    </view>
    <view v-else-if="finished" class="py-4 text-center text-3 text-muted">
      没有更多了
    </view>
  </view>
</template>
```

- [ ] **Step 2: me.vue 菜单接线**

把 [me.vue](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/pages/me/me.vue) 第 74 行：

```ts
    { key: 'activities', label: '活动报名', icon: 'i-carbon-calendar' },
```

改为：

```ts
    { key: 'activities', label: '活动报名', icon: 'i-carbon-calendar', url: '/pages/activity/mine' },
```

`handleMenuTap` 既有逻辑（未登录 toast 提示、navigateTo）无需改动。

- [ ] **Step 3: 检查点**

Run: `bun run type-check ; bun run lint`
Expected: 0 error / 0 problem。
走查：我的 → 活动报名 → 进入 mine；未登录点菜单提示「请先登录」；登录后列出报名、点卡片进详情。

---

## Task 11: 全量门禁与端到端走查

**Files:** 无新增（验证任务）。

- [ ] **Step 1: 前端三门禁**

Run（在 `frontend/`）：

```powershell
bun run type-check
bun run lint
bun run test:run
```

Expected: 0 type error、0 lint problem（可 `bun run lint:fix`）、全部单测通过（含新增 datetime/location/checkin-link 三组）。

若 `type-check` 报 `TS2688: Cannot find type definition file for ...`（未 build 过导致 `src/types/*.d.ts` 缺失，见 AGENTS.md §10），先 `bun run build:h5` 生成真实类型文件后重跑；不要手改 `src/types/` 生成物。

- [ ] **Step 2: H5 构建与小程序构建**

Run：

```powershell
bun run build:h5
bun run build:mp
```

Expected: 两个构建均成功。mp 构建产物 `dist/build/mp-weixin/app.json` 或对应生成配置中含 `requiredPrivateInfos: ["chooseLocation"]`（可用文件搜索确认；不要手改生成物）。

- [ ] **Step 3: H5 全链路人工走查（后端 9999 + 前端 3333 均启动）**

按序验证（对照 Spec §8 与后端计划 Task 10 冒烟脚本，需两个账号：一个 admin/activity_admin，一个普通 user）：

1. **发布**：组织者在活动 tab 点「发布活动」→ 填表（地图选点或手动降级）→ 发布成功跳详情。
2. **列表**：tab 显示「未开始」徽章卡片；切「已结束/已取消」分段筛选正确；关键词搜索命中标题/地点；触底分页。
3. **报名**：普通用户详情点「立即报名」→ 二次确认（显示时间地点）→ 成功；名额/截止置灰文案正确；重复进入幂等无报错。
4. **取消报名**：开始前可取消、底条回到立即报名；开始后取消按钮置灰（或返回后端 409 toast）。
5. **滚动码**：组织者详情→出示签到码：二维码 + 6 位码 + 倒计时；跨过整分自动换新码（可比对管理端/接口返回）；二维码内容为 `.../#/pages/activity/checkin?a=..&c=..`。
6. **签到三路径**：
   - H5 直接打开二维码链接（含 a/c）→ 未登录走完登录回跳 → 一键确认 → 成功态；
   - 小程序内活动 tab「扫码签到」（开发者工具编译 mp 后）→ 扫/模拟扫该链接 → 进签到页；
   - 手动把签到页 code 改对/改错：错码 422 toast 且可重试；窗外 409 文案正确；重复签到幂等显示成功。
7. **名单/补签**：组织者详情→报名名单：统计头、手机号、状态；给 registered 用户补签后变「已签到（补签）」，该用户端 mine/详情显示已签到。
8. **取消活动**：组织者取消后详情顶部红条、底条消失、列表进「已取消」分段。
9. **我的**：me → 活动报名，状态徽章与详情一致。

- [ ] **Step 4: 完成后清理**

- 不新增任何临时文件（本计划无脚本型冒烟步骤；后端联调脚本由后端计划负责、用完即删）。
- 不执行 git commit，除非用户明确要求。
- AGENTS.md 同步项（activity_admin 角色、活动模块目录）已包含在后端计划 Task 10 Step 4，确认其落地即可，本任务不重复编辑。

- [ ] **Step 5: 交接说明**

向用户汇报：新增/修改文件清单、两条构建结果、第 3 步走查中未能自动化覆盖的项（真机微信扫码、正式 QQMap key 下的 H5 选点），以及 Spec §13 上线清单中仍需人工处理的事项（QQMap key、VITE_H5_BASE_URL 正式域名、小程序后台开通 chooseLocation、为组织者账号授权 activity_admin）。
