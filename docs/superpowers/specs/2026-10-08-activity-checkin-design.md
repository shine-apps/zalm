# 众爱联盟 · 活动发布 / 报名 / 扫码签到 设计文档

日期：2026-10-08
范围：backend（Nuxt 4 + Drizzle + Better Auth）+ frontend（unibest / uniapp H5+微信小程序）+ 后端管理后台页面（Nuxt UI v4）。
状态：方案 A（无状态滚动签到码）+ 系统选点页（`uni.chooseLocation`）已经需求方确认，待书面评审。

## 1. 背景与目标

前端「活动」tab 目前是「即将上线」占位页。本轮把活动业务完整落地：

1. **发布**：拥有 `activity_admin` 或 `admin` 角色的用户可在 App 内发布、编辑、取消活动。
2. **报名**：活动列表/详情对**游客可见**；登录用户可报名、开始前可取消；有人数上限与报名截止规则。
3. **签到**：现场组织者出示**每分钟滚动的二维码 + 6 位数字码**；参与者微信扫一扫 / App 内扫码 / 手动输码完成签到。
4. **位置**：`location` 存标准化结构（名称/地址/经纬度），发布时用 `uni.chooseLocation` 交互式选点；无法选点时允许仅填名称+地址降级发布。
5. **PC 后台**：admin 在 Nuxt 管理后台查看活动、取消活动、查看报名/签到名单、手动补签。

## 2. 不做什么（YAGNI）

- 不做活动分类/标签、评论、点赞、收藏、活动消息推送。
- 不做签到签退（只签一次到）；不做报名审核（报名即成功，除非满员/截止）。
- 不做组织者数据隔离：`activity_admin` 可管理所有活动（公益组织内部信任模型）。
- 不自绘地图、不引入高德/腾讯 JS GL SDK 与 WebService 直连；地图选点统一走 `uni.chooseLocation`，详情页不嵌地图。
- H5 端不做摄像头扫码（用微信「扫一扫」+ 手动输码兜底）。
- PC 后台不做发布活动、不出示签到码（发布与签到码仅 App 内）。
- 不做分布式限流/签到码作废列表（滚动码天然 2 分钟失效）。

## 3. 角色与授权

- 种子角色在现有 `admin` / `user` 之外新增 **`activity_admin`（活动管理员）**，由 admin 在现有「用户管理 → 分配角色」中授予，无需新建授权页面。
- 授权判据沿用「角色 name 严格相等」约定：
  - **组织者能力**（发布/编辑/取消/签到码/名单/补签的 API 与 App 入口）= 角色含 `activity_admin` **或** `admin`。
  - **PC 后台**（`/admin/**` 页面与 `/api/admin/**` 接口）= 仅 `admin`，沿用现有中间件与全局守卫，不放宽。
- 后端新增上下文辅助 `requireAnyRole(event, ['admin', 'activity_admin'])`（与现有 `requireAdmin` 同文件），业务接口不使用 `/api/admin/**` 前缀（该前缀被认证中间件硬绑 admin）。
- 前端 `useAuthStore` 新增计算属性 `canManageActivity = roles 含两者之一`，控制「发布活动」入口与详情页组织者区显示。该值仅控制 UI，最终鉴权以后端为准。

## 4. 数据模型

物理列 `snake_case`、TS 属性 `camelCase`，时间统一 `timestamp({ withTimezone: true })`。两张新表加入 `server/database/schema.ts`，迁移走 `db:generate` → `db:migrate` 标准流程。

### 4.1 `activity`（活动）

| 列 | 类型 | 约束/默认 | 说明 |
|---|---|---|---|
| id | text | pk，`$defaultFn(crypto.randomUUID)` | |
| title | text | notNull，2~50 | 标题 |
| description | text | notNull default ''，≤2000 | 活动详情（纯文本，保留换行） |
| cover_url | text | null | 封面图 URL（复用现有 COS 媒体体系） |
| location | jsonb | notNull | 标准化位置，见 §5 |
| start_time | timestamptz | notNull | 开始时间 |
| end_time | timestamptz | notNull | 结束时间，必须晚于开始 |
| register_deadline | timestamptz | null | 报名截止；null 视为开始时间即截止 |
| capacity | integer | null，>0 | 人数上限；null = 不限 |
| status | text | notNull default 'published' | `published` / `cancelled` |
| created_by | text | notNull，references user.id（**restrict**） | 发布者留痕，禁止删用户破坏记录 |
| created_at / updated_at | timestamptz | notNull defaultNow / `.$onUpdate(() => new Date())` | |

### 4.2 `activity_registration`（报名记录）

一人一活动**一行**，唯一约束 `(activity_id, user_id)`：

| 列 | 类型 | 说明 |
|---|---|---|
| id | text uuid pk | |
| activity_id | text → activity.id，onDelete cascade | |
| user_id | text → user.id，onDelete cascade | |
| status | text notNull default 'registered' | `registered` / `cancelled` / `checked_in` |
| check_in_at | timestamptz null | |
| check_in_method | text null | `scan`（扫码/输码自助）/ `manual`（管理员补签） |
| checked_in_by | text → user.id null（restrict） | 补签操作人 |
| created_at | timestamptz notNull defaultNow | 首次报名时间（复活不重置） |
| cancelled_at | timestamptz null | 最近一次取消时间 |

行为约定：

- **取消后重新报名 = 复活同一行**：status 回 `registered`、清空 cancelled_at，不新增行；created_at 保留。
- `checked_in` 是终态：不可取消报名、不可重复改变状态（重复签到幂等返回）。
- 「有效报名」计数口径：`status IN ('registered','checked_in')`（即不含 cancelled）。
- `created_by` 与 `checked_in_by` 外键均为 **restrict**：已发布过活动或执行过补签的用户不能被直接删除——现有「删除用户」处理器需捕获该 FK 违反并返回 409「该用户存在活动关联记录，请改用停用账号」（报名记录侧的 user/activity FK 仍为 cascade）。

### 4.3 活动展示状态（派生，不落库）

按 now 派生：`cancelled`（status=cancelled）> `ongoing`（start≤now≤end）> `upcoming`（now<start）> `ended`（now>end）。列表接口的 `state` 查询参数映射：

- `active`（默认）：published 且 end_time ≥ now，按 start_time **升序**
- `past`：published 且 end_time < now，按 start_time 降序
- `cancelled`：status = cancelled，按 start_time 降序

名额派生字段（接口返回，不落库）：`registeredCount` = 有效报名数（registered+checked_in）；`remaining = capacity 为 null 时为 null（不限），否则 max(0, capacity − registeredCount)`。

## 5. 标准化位置与地图选点

### 5.1 数据结构（前后端唯一事实源）

`activity.location` jsonb：

```ts
interface ActivityLocation {
  name: string               // 地点名称，必填，1~100
  address: string            // 详细地址，必填，1~200
  latitude: number | null    // GCJ-02 纬度；手动降级时为 null
  longitude: number | null   // GCJ-02 经度；手动降级时为 null
}
```

Zod 规则：name/address trim 后非空；经纬度必须**成对出现**（都有或都空）；有值时 latitude ∈ (0, 72]（中国范围放宽校验）、longitude ∈ (60, 140]，精度保留 6 位小数。

### 5.2 发布/编辑表单交互

- 「选择位置」按钮调 `uni.chooseLocation`（H5 由 uniapp 调起腾讯地图选点页，小程序调起微信原生选点页），成功返回后一次性写入 `name/address/latitude/longitude`。
- 选点成功后以只读卡片展示「名称 + 地址」；点「重新选择」可再次调起。
- 折叠的「手动填写地址」始终可见：当用户拒绝授权、H5 未配 key、接口 fail 时，只填 name+address（经纬度 null）也能通过校验、正常发布。
- 封装 `src/utils/location.ts`：`chooseActivityLocation()`（包一层，错误时不 toast 原始报错，分类提示并让用户走手动填写）与导航/展示辅助函数；页面不直接写 `uni.chooseLocation`。

### 5.3 平台配置与导航

- `manifest.config.ts`：mp-weixin 增加 `requiredPrivateInfos: ['chooseLocation']`；H5 `sdkConfigs.maps.qqmap.key` 取 `VITE_QQMAP_KEY`。
- 环境变量（`frontend/env/.env.development` / `.env.production`，无密钥入库问题的构建配置可入库）：新增 `VITE_QQMAP_KEY`、`VITE_H5_BASE_URL`（签到二维码链接的 H5 正式基址，开发态回退 `location.origin`）。
- 详情页位置卡片：展示 name + address；**有坐标**时显示「导航」——
  - 小程序/App：`uni.openLocation({ latitude, longitude, name, address })`；
  - H5：新窗口打开腾讯 marker URI：`https://apis.map.qq.com/uri/v1/marker?marker=coord:{lat},{lng};title:{name};addr:{address}&referer=众爱联盟`。
  - 无坐标：不显示导航按钮。

## 6. 滚动签到码（无状态，方案 A）

### 6.1 算法（服务端 `server/utils/checkin-code.ts`）

- 窗口：60 秒。`window = floor(now_ms / 60_000)`。
- `digest = HMAC_SHA256(BETTER_AUTH_SECRET, "activity-checkin:" + activityId + ":" + window)`。
- 取摘要前 4 字节按大端读 uint32，`code = String(digest % 1_000_000).padStart(6, '0')`（HOTP 式截断，避免直接截 hex 的偏斜）。
- **校验接受当前窗口与上一窗口**（容忍 ≤ ~2 分钟的时钟差/出示延迟），更旧的码拒绝；不同活动的码因 HMAC 消息含 activityId 不可互换。
- 纯函数可单测：注入 `now` 即可覆盖「当前通过 / 上窗口通过 / 更旧拒绝 / 跨活动拒绝」。

### 6.2 二维码

- 内容 = H5 签到页地址：`{VITE_H5_BASE_URL}/#/pages/activity/checkin?a={activityId}&c={code}`。
- 生成：前端引入 **uqrcode**（纯 JS + uni canvas，H5/小程序/App 通用），由签到码页面绘制，不引重量级扫码库。
- 组织者页 `checkin-code.vue`：进入时调 `GET /api/activities/:id/check-in-code` 得 `{ code, expiresAt }`，大号显示 6 位码、canvas 二维码、倒计时进度条；在 `expiresAt` 前 1.5 秒轮询下一次（轮询失败保留旧码并提示，不黑屏）。码的正确性以服务端校验为准，前端不计算 HMAC。

### 6.3 核销条件（全部满足才置 checked_in）

1. 活动存在且未取消；
2. 当前用户对该活动有 `registered` 状态记录（未报名 → 409「请先报名」；已取消 → 409「报名已取消，请重新报名」）；
3. 在签到时间窗：`start_time - 15min ≤ now ≤ end_time`（窗外 → 409，message 区分「签到尚未开始」/「活动已结束」）；
4. 签到码通过 §6.1 校验（失败 → 422「签到码无效或已过期」）；
5. 已是 checked_in → **幂等成功**，直接返回该记录。

## 7. 后端 API

统一 `{code:'OK', data, pagination?}` 响应、Zod 入参、既有错误码与分页工具。分层：`repositories/activities.ts`（数据访问，含事务/计数）+ `utils/checkin-code.ts`（码算法）+ 处理器保持轻薄（状态判断尽量在仓储/工具函数中，便于单测）。

### 7.1 公开路径放行（需改造现有机制）

现有 `isPublicPath` 只按前缀放行。本轮新增「方法 + 路径」公开表：在 `server/utils/path.ts` 增加

- `GET /api/activities`
- `GET /api/activities/:id`

为公开（游客可读）；同前缀的 POST 等仍须登录。`isPublicPath` 签名扩展为接收 method（或新增 `isPublicRequest(pathname, method)`，老函数保留委托），`20.auth.ts` 同步改调用。

匹配必须精确：详情公开规则的路径形态为 `^/api/activities/[^/]+$`（单段 id），**不得**用裸前缀，否则 `mine/registrations` 等深层路径会被误放行；静态段 `mine` 本身不存在 GET 处理器，无碰撞。

### 7.2 参与者接口

| 方法/路径 | 鉴权 | 规则与错误 |
|---|---|---|
| GET `/api/activities` | 公开 | query：`state=active|past|cancelled`、`page/pageSize`、`keyword`（title/location.name ilike）；列表项含统计摘要，不含 description |
| GET `/api/activities/:id` | 公开 | 详情含 description、完整 location、registerDeadline、registeredCount/checkedInCount/remaining；登录时附 `myRegistration`（游客为 null） |
| POST `/api/activities/:id/register` | 登录 | 事务：活动存在且 published；now ≤ 有效截止（deadline ?? startTime）；有效报名数 < capacity（null 不限），超限 409「名额已满」；唯一冲突时复活 cancelled 行；已 registered/checked_in 幂等返回 |
| POST `/api/activities/:id/cancel-registration` | 登录 | 仅 now < startTime（开始后 409「活动已开始，无法取消」）；registered → cancelled + cancelled_at；checked_in 409；无报名记录 404 NOT_FOUND「未找到报名记录」 |
| POST `/api/activities/:id/check-in` | 登录 | body `{ code: 6位数字字符串 }`；按 §6.3 核销，method=`scan` |
| GET `/api/activities/mine/registrations` | 登录 | 我的报名（分页，含活动完整摘要 + 我的状态/签到时间），按 created_at 降序 |

路由实现注意：`mine/registrations.get.ts` 为静态段文件，Nitro 静态路由优先于 `[id].get.ts`；register/check-in 等为 POST，不与 GET `[id]` 冲突。

### 7.3 组织者接口（activity_admin 或 admin）

挂载于 `/api/activities` 前缀下但处理器内 `requireAnyRole`：

| 方法/路径 | 说明 |
|---|---|
| POST `/api/activities` | 发布。body 见 §7.5；created_by = 当前用户 |
| PUT `/api/activities/:id` | 编辑。cancelled 活动 409；新 capacity（若非 null）不得小于当前有效报名数，否则 409「人数上限不能低于已报名人数（N）」 |
| POST `/api/activities/:id/cancel` | 取消活动（终态）；已取消再调 409。不影响已产生的签到记录 |
| GET `/api/activities/:id/check-in-code` | 返回 `{ code, expiresAt }`（expiresAt = 下一窗口起点） |
| GET `/api/activities/:id/registrations` | 名单分页，含用户昵称、**完整手机号**（现场联系用，仅组织者可见）、头像、status、checkInAt、checkInMethod；头行返回统计 `{ registeredCount, checkedInCount, capacity, remaining }` |
| POST `/api/activities/:id/manual-check-in` | body `{ userId }`；校验该用户对本活动有 registered 记录；置 checked_in + method=`manual` + checkedInBy=自己；已签到幂等成功；未报名 409 |

### 7.4 PC 后台接口（仅 admin，薄处理器复用同一仓储）

- GET `/api/admin/activities`（含 state/keyword/分页）、GET `/api/admin/activities/:id`
- POST `/api/admin/activities/:id/cancel`
- GET `/api/admin/activities/:id/registrations`、POST `/api/admin/activities/:id/manual-check-in`

不提供发布/编辑/签到码端点；发布与签到码只在 App 内。

### 7.5 Zod schema（`server/schemas/activity.ts`）

- `activityLocationSchema`：见 §5.1。
- 创建 body：title 2~50、description ≤2000、coverUrl 可选 URL ≤500、location 必填、startTime/endTime 为 ISO 时间字符串（coerce 后 end>start）、registerDeadline 可空且 ≤ startTime、capacity 可空为 1~99999 的整数。`.strict()`。
- 更新 body：同字段全部可选，`.refine(至少一个字段)`；时间对组校验（任一时间出现都要保证 end>start、deadline≤start，缺省字段从库中补齐后比较）。
- `checkInBodySchema`：`code = z.string().regex(/^\d{6}$/)`；`manualCheckInBodySchema`：`userId` 1~64。
- 列表 query：复用 `pageQuerySchema.merge(keywordQuerySchema)`，加 `state` 枚举可选。

### 7.6 限流与安全

- `10.rate-limit.ts` 的敏感端点（10/min）追加四个（matcher 需同时区分方法与路径正则）：
  - POST `/api/activities/:id/register`
  - POST `/api/activities/:id/check-in`
  - POST `/api/activities/:id/manual-check-in`
  - GET `/api/activities/:id/check-in-code`（防遍历刷码）
- 报名/签到的所有权判断只认会话 user，不信任前端上送 userId；名单接口返回完整手机号仅限组织者角色。

## 8. 前端页面与交互

页面均在 `src/pages/activity/` 下，`definePage` 声明，wd-* 组件经 easycom 直接用，颜色只走 `var(--c-*)`，UnoCSS 原子优先。API 封装在新增 `src/api/activity.ts`，走现有 alova 实例（统一解包/401 行为不变）。

| 文件 | 入口 | 角色 | 内容 |
|---|---|---|---|
| `activity.vue`（替换占位页） | tab | 公开 | 顶部分段三个：未开始/进行中（合并为 `active`，卡片内用徽章区分未开始/进行中）、已结束、已取消；活动卡片（封面、标题、时间、location.name、名额 `已报/上限`、状态徽章）；组织者可见「发布活动」按钮；「扫码签到」图标按钮（见 8.2） |
| `detail.vue?id=` | 卡片 | 公开可看 | 封面、标题、时间、位置卡片（导航）、详情、名额进度；底部操作条按我的状态切换：未报名→「立即报名」（游客点则引导登录）、registered→「取消报名」（开始前）、checked_in→「已签到」、cancelled→「重新报名」；组织者区：编辑/取消活动/出示签到码/报名名单 |
| `edit.vue?id?` | 发布按钮/编辑 | 组织者 | 表单：标题、封面（复用 media-uploader）、开始/结束（wd-datetime-picker）、报名截止、人数上限（空=不限）、位置（§5.2）、详情；提交前前端校验时间关系 |
| `checkin.vue?a=&c=` | 扫码/输码 | 登录 | 拉活动摘要；URL 带 c 时自动填入，点「确认签到」；也提供 6 位码手动输入格；成功态（活动名+签到时间）/失败态（按 message 提示，可重试） |
| `checkin-code.vue?id=` | 详情组织者区 | 组织者 | §6.2：滚动码 + 二维码 + 倒计时 + 实时已签到人数（可选轮询名单计数） |
| `registrations.vue?id=` | 详情组织者区 | 组织者 | 统计头 + 名单列表（头像/昵称/手机号/状态/签到时间与方式），registered 行有「补签」按钮 |
| `mine.vue` | 「我的 → 活动报名」菜单 | 登录 | 我的报名列表，状态徽章 + 跳转详情 |

同步改动：

- `src/store/auth.ts`：新增 `canManageActivity`；`src/api/auth.ts` 的 AuthUser 类型已含 roles，无需后端改 /me。
- `src/pages/me/me.vue`：「活动报名」菜单项 url 指向 `/pages/activity/mine`（替换当前「功能开发中」）。
- 新增 `src/utils/checkin-link.ts`：`buildCheckinUrl(base, id, code)` 与 `parseCheckinUrl(url)`（解析 hash query 的 a/c，供小程序扫码结果解析），纯函数配单测。
- 新增 `src/utils/location.ts`：选点封装、`openActivityNavigation(location)`、错误分类提示。

### 8.1 报名/取消交互细节

- 报名弹二次确认（展示时间地点），防误触；提交成功 toast 并刷新详情与列表计数。
- 取消报名弹确认；满员活动按钮置灰显示「名额已满」；已过截止显示「报名已截止」；活动被取消详情顶部红色提示条、操作条禁用。
- 所有 409/422 直接展示后端 message（alova 已统一 toast），页面不另编错误文案。

### 8.2 现场签到三条路径

1. **微信「扫一扫」扫二维码** → 浏览器打开 H5 签到页（a/c 已在 URL）→ 未登录走现有登录流程后回跳 → 一键确认。
2. **小程序内**：活动 tab「扫码签到」→ `uni.scanCode`（仅 #ifdef 非 H5）→ `parseCheckinUrl` 取出 a/c → `navigateTo` 签到页；扫到的不是本系统链接则提示。
3. **手动输码兜底**：H5 与小程序签到页都支持手输 6 位码（应对无摄像头/弱网/截屏）。

## 9. PC 管理后台（仅 admin，Nuxt UI v4）

新增页面（沿用现有 admin 布局与 `auth.global.ts` 守卫、UModal `#body`、UTable `${id}-cell`/`row.original` 等已踩坑约定）：

- `app/pages/admin/activities/index.vue`：活动表格（标题/开始时间/地点/状态/报名数/容量/签到数），state 筛选与关键词搜索、分页；行操作「查看」「取消活动」（UModal 二次确认，终态提示）。
- `app/pages/admin/activities/[id].vue`：活动信息 + 报名/签到名单表（昵称、手机号、报名时间、状态、签到时间、方式），行内「补签」按钮；不做编辑表单。
- 在现有后台侧边栏增加「活动管理」分组入口。

## 10. 错误处理与安全小结

| 场景 | HTTP / code | message |
|---|---|---|
| 未登录访问写接口 | 401 UNAUTHORIZED | 既有统一处理（清态跳登录） |
| 非组织者访问组织者接口 | 403 FORBIDDEN | 没有访问权限 |
| 活动不存在 | 404 NOT_FOUND | 活动不存在 |
| 报名满员/过截止/活动取消/已开始取消报名/窗外签到/未报名签到 | 409 CONFLICT | 各自明确中文文案 |
| 签到码错误或过期 | 422 VALIDATION_ERROR | 签到码无效或已过期 |
| capacity 低于已报名数 / 编辑已取消活动 | 409 | 明确中文文案 |
| location 经纬度不成对或越界 | 422 + issues | Zod path 标注 |

幂等：重复报名（复活或保持）、重复签到、重复补签均成功返回，不报错。

## 11. 测试与质量门禁

后端 Vitest（纯函数层，与现有无 DB 单测风格一致）：

- `utils/checkin-code.test.ts`：当前窗口通过、上窗口容错通过、更旧拒绝、跨活动不可互换、码恒为 6 位数字。
- `schemas/activity` 相关校验测试（经 schema 编译后放 `server/utils/validation.test.ts` 风格的用例或独立测试文件）：时间关系、deadline、capacity、location 成对规则。
- 前端 `utils/checkin-link.test.ts`：build/parse 往返、小程序扫码字符串解析、非法 URL 返回 null。
- 前端 `utils/location.ts` 中可纯测的部分（经纬度存在性判断、marker URI 拼装、回退分支）。

门禁（合入前全绿）：

```powershell
# backend
bun run typecheck; bun run lint; bun run test
# frontend
bun run type-check; bun run lint; bun run test:run
```

验证补充：本地 H5 浏览器走查「admin 发布 → 另一用户报名 → 出示滚动码（含跨分钟刷新）→ 输码签到 → 补签」全链路；`bun run build:mp` 验证微信小程序构建通过（真机扫码链路留待配 key 后）。

## 12. 实施顺序建议（供 writing-plans 细化）

1. 后端：schema 两表 + 迁移 + 种子角色 `activity_admin` + `requireAnyRole`/公开路径/限流改造。
2. 后端：checkin-code 工具与单测 → Zod schema → 仓储 → 参与者/组织者 API → admin 薄 API。
3. 前端基础：`api/activity.ts`、store `canManageActivity`、utils（location/checkin-link）与单测、环境变量/manifest 配置。
4. 前端页面：列表/详情/报名 → edit 发布（含选点）→ 签到码页/签到页/扫码入口 → 名单/补签 → 我的报名。
5. PC 后台两页 + 侧边栏入口。
6. 全部门禁 + H5 全链路走查 + build:mp。

## 13. 上线/部署清单（非代码）

- 申请腾讯位置服务 key（H5 chooseLocation 必需），配置 `VITE_QQMAP_KEY`；小程序后台开通「地理位置」接口（chooseLocation）。
- 配置 `VITE_H5_BASE_URL` 为 H5 正式域名；微信「扫一扫」打开 H5 需 ICP 备案域名。
- 生产执行 `bun run db:migrate` 与 `bun run db:seed`（幂等补 activity_admin 角色）；为现场组织者账号授予 activity_admin。
- AGENTS.md 同步：角色清单（§7.2）与目录结构补充活动模块。
