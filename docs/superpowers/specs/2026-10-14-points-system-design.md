# 众爱联盟 · 用户积分管理 设计文档

日期：2026-10-14
范围：backend（Nuxt 4 + Drizzle + Better Auth）+ frontend（unibest / uniapp，当前 H5 联调）+ 后端管理后台页面（Nuxt UI v4）。
状态：关键决策均已经需求方逐条确认（见 §2），待书面评审。

## 1. 背景与目标

为联盟成员建立双口径积分体系：

1. **活动积分**：每个活动创建时指定「参与积分」（0–9999，0 = 该活动不计分）；用户**签到成功后自动获得**（含自助扫码签到与管理员手动补签两个入口）。此外允许管理员在 PC 后台手工补录活动积分（线下活动、漏签等场景），积分值选活动后自动带出但可修改。
2. **捐献积分**：用户捐献钱或物资时，由 **admin 在 PC 后台手工录入**；1 积分代表 1 元钱，但积分值一律以管理员录入为准（物资按估值录入，钱款金额仅作备注参考）。
3. **排行榜**：按总积分排名，可切换「总榜 / 活动榜 / 捐献榜」；**仅登录用户可见**。
4. **近期积分获取动态**：排行榜页展示全站动态流；「我的」侧提供个人完整明细。全站动态中**捐献记录只显示积分，不显示金额、物资名称与备注**。
5. **纠错机制**：流水不可改删，只允许 **冲正**（新增等额负流水，全程留痕）。

## 2. 关键决策（已确认）

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 活动积分发放时机 | 签到成功后发放（方案 A）；报名不发分 |
| 2 | 捐献积分定值方式 | 管理员手工录入积分数；捐钱时金额仅作备注（方案 A） |
| 3 | 排行榜口径 | 总积分排名 + 活动/捐献维度切换（方案 A）；仅登录可见 |
| 4 | 近期记录范围 | 全站动态流 + 个人明细两处都做（方案 A） |
| 4b | 动态流隐私 | 捐献只显示积分，不显示金额/物资/备注（方案 A） |
| 5 | 纠错方式 | 冲正：等额负流水留痕（方案 A） |
| 6 | 活动积分配置 | 必填，范围 **0–9999**（允许 0）；活动开始前可改，已发流水不回收；活动取消不回收已发积分（用户确已到场） |
| 7 | 录入入口与权限 | PC 后台新增「积分管理」页，仅 `admin`；App 端不提供录入 |
| 8 | 数据模型选型 | 统一积分流水表 + 用户积分汇总表（方案 1），同事务维护 |
| 9 | 活动积分手工补录 | 管理员可手工补录，选活动后带出配置积分、可修改，不要求有报名记录 |

## 3. 不做什么（YAGNI）

- 不做积分兑换商品/礼品、积分消费、积分过期清零。
- 不做积分等级/勋章体系（排行榜前三名的奖牌样式仅是展示）。
- 不做捐献在线支付；捐献一律线下发生、管理员事后录入。
- 不做活动取消后自动回收已发积分；不做存量历史活动的积分回填（如需由管理员手工补录）。
- 不做独立的审计页面——积分流水审计表即审计凭证。
- App 端不做积分录入；`activity_admin` 无积分管理权限。

## 4. 数据模型

物理列 `snake_case`、TS 属性 `camelCase`，时间统一 `timestamp({ withTimezone: true })`。
变更落在现有 `server/database/schema.ts`，迁移走 `db:generate` → 人工检查 → `db:migrate` 标准流程。

### 4.1 `activity` 表新增列

| 列 | 类型 | 约束/默认 | 说明 |
|---|---|---|---|
| points | integer | notNull default 0，值域 0–9999（Zod 入口保证） | 签到成功可得的参与积分；0 = 不计分 |

存量活动迁移后均为 0，不追溯补发。

### 4.2 `points_ledger`（积分流水，唯一事实源）

一次积分变动一行，`points` 为**带符号整数**（正向得分、冲正为负）。

| 列 | 类型 | 约束/默认 | 说明 |
|---|---|---|---|
| id | text | pk，`$defaultFn(crypto.randomUUID)` | |
| user_id | text | notNull，references user.id（**cascade**） | 积分归属用户 |
| points | integer | notNull，非零 | 变动分值；得分为正，冲正为负 |
| category | text | notNull | `activity` \| `donation`（积分口径） |
| source | text | notNull | `checkin` \| `manual_activity` \| `manual_donation` \| `reversal` |
| activity_id | text | null，references activity.id（**restrict**） | 仅活动类流水有值（checkin / manual_activity；冲正活动积分时同类别携带） |
| registration_id | text | null，references activity_registration.id（**restrict**） | 仅 `checkin` 流水有值，发分幂等锚点 |
| donation_kind | text | null | `money` \| `goods`，仅捐献类流水有值（冲正捐献流水时携带原值） |
| note | text | notNull default ''，≤200 | 备注（金额/物资名/冲正原因等）；**仅后台与本人可见** |
| created_by | text | null，references user.id（**restrict**） | 操作人；系统自动发分（checkin）为 null |
| reversal_of | text | null，references points_ledger.id（**restrict**） | 冲正记录指向原流水 |
| created_at | timestamptz | notNull defaultNow | 排序口径；手工录入允许显式指定以补录历史 |

索引与约束：

- **部分唯一索引** `(registration_id) WHERE registration_id IS NOT NULL`：一场签到最多一条活动积分流水，数据库层兜底并发/重复签到，插入冲突按幂等忽略。
- **部分唯一索引** `(reversal_of) WHERE reversal_of IS NOT NULL`：一条流水最多被冲正一次。
- 普通索引：`(user_id, category, created_at desc)`（个人明细）、`(category, created_at desc)`（全站动态）。
- 不用 DB CHECK 约束非负：扣减防御在服务层（§6）。

### 4.3 `user_points`（积分汇总，读优化）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| user_id | text | pk，references user.id（**cascade**） | |
| activity_points | integer | notNull default 0 | 活动积分净额 |
| donation_points | integer | notNull default 0 | 捐献积分净额 |
| updated_at | timestamptz | notNull defaultNow，`$onUpdate` | |

- 总积分不存列，查询时 `activity_points + donation_points` 现算。
- **只允许由流水在同一事务内 upsert + 增量更新**（`SET xx_points = xx_points + $1`），不存在任何脱离流水的修改入口。
- 用户首次发生积分变动时建 0 行；未上榜/零分用户是否展示见 §7.1。

## 5. 后端服务与数据访问

新增：
- `server/database/repositories/points.ts`：流水插入（支持 ON CONFLICT 选项）、按 id 取流水、查 `reversal_of` 是否已存在、汇总行 upsert 增量、排行榜查询、动态/明细分页查询。所有写函数接收 `DbExecutor`（与 activities repo 一致），支持事务透传。
- `server/schemas/points.ts`：Zod 入参（见 §7）。
- `server/utils/points-service.ts`：业务逻辑，仿 `activity-service.ts` 的分层风格。

### 5.1 签到发分（对现有签到链路的改造）

现状：`checkInToActivity`（自助）与 `manualCheckIn`（补签）最终都调用 repo 的 `setRegistrationCheckedIn`（当前走全局 `db`、按 id 更新）。

改造：

1. repo 新增「条件更新」：`UPDATE ... SET status='checked_in', ... WHERE id = $1 AND status <> 'checked_in' RETURNING *`，返回为空即表示此前已签到。
2. `checkInToActivity` 与 `manualCheckIn` 的持久化段包入**一个事务**：
   - 条件更新报名行；
   - **仅当首次变为 checked_in**（RETURNING 命中）且 `activity.points > 0` 时：
     `INSERT INTO points_ledger (...) ON CONFLICT (registration_id) WHERE registration_id IS NOT NULL DO NOTHING`，
     仅在实际插入成功后，同事务对 `user_points` 做 activity 积分增量 upsert；
   - 已签到的幂等请求直接返回报名记录，不发分。
3. 自助签到的时间窗、签到码校验与补签的状态校验逻辑保持不变，只把「写签到 + 发分」原子化。
4. 活动被取消无法签到（现有逻辑已保证），因此取消后不会产生新积分；活动进行中取消、此前已发的积分不回收。

### 5.2 手工录入（活动 / 捐献）

`awardManualPoints(input, operatorId)`：

- 通用字段：`userId`、`points`（1–9999 正整数）、`note`（选填 ≤200）、`createdAt`（选填，缺省当前时间）。
- `category = 'activity'`：必传 `activityId`（活动须存在；已取消活动也允许，用于线下补录），`source='manual_activity'`，不写 `registration_id`，因此**可对同一用户同一活动多次补录**（纠错靠冲正）。
- `category = 'donation'`：必传 `donationKind: 'money' | 'goods'`，`source='manual_donation'`，不写 `activity_id`。
- 校验目标用户存在；同事务写流水 + 汇总增量 upsert；`created_by = operatorId`。

### 5.3 冲正

`reverseLedger(ledgerId, operatorId, reason)`：

- 原流水须存在；`source = 'reversal'` 的记录不可再冲正（422）；
- 原流水未被冲正（依赖 `reversal_of` 部分唯一索引，冲突报 409）；
- 防御性校验：该用户该类别当前净积分 ≥ 原流水分值（含同事务读汇总行），不足以扣成负数时 409；
- 同事务写入：新流水 `points = -原points`、`category` 相同、`source='reversal'`、
  活动类携带原 `activity_id`、捐献类携带原 `donation_kind`、`reversal_of = 原id`、
  `created_by = operatorId`、`note = "冲正：{原note|无备注}；原因：{reason}"`；
  汇总行同类别增量扣减。
- 冲正记录同样出现在后台流水与个人明细中（负分色），全站动态流**不展示** `reversal` 记录（动态只展示正向获取，冲正在个人明细/后台可见；见 §7.2）。

## 6. 错误与边界

| 场景 | 行为 |
|---|---|
| 并发/重复签到、重复补签 | 条件更新 + `(registration_id)` 部分唯一索引双保险；幂等返回，不发第二次分 |
| 活动积分 = 0 | 不写流水、不动汇总 |
| 手工录入：用户/活动不存在 | 404 |
| 手工录入：积分越界、类别与字段不匹配（活动缺 activityId / 捐献缺 donationKind） | 422 带 issues |
| 冲正已冲正记录 / 冲正冲正记录 | 409 / 422 |
| 冲正导致负积分 | 409（防御） |
| 游客访问排行榜、动态、我的积分 | 401（端点不进公开白名单，沿用 20.auth 中间件） |
| 非 admin 调用 `/api/admin/points/**` | 403（沿用中间件硬绑 admin） |
| 用户删除 | 流水、汇总随 FK cascade 删除 |
| 活动删除 | 项目无删除活动接口（仅取消），`activity_id` restrict 安全 |
| 动态流隐私 | service 序列化层**强制**剔除捐献流水的 `note`/金额/物资名（前端无法绕过） |

所有错误一律 `createApiError(code, extra?)`，响应格式、HTTP 状态码、issues 结构沿用现有约定。

## 7. HTTP 接口

均挂 `/api` 前缀，成功返回 `{ code:'OK', data, pagination? }`，分页参数沿用 `pageQuerySchema`。

### 7.1 登录用户接口（`server/api/points/`）

| 方法 & 路径 | 说明 | 返回要点 |
|---|---|---|
| `GET /api/points/leaderboard?dimension=total\|activity\|donation` | 排行榜分页，默认 total | 排名（序号由分页位置推导）、用户 id/姓名/头像、activityPoints/donationPoints/total；当前登录用户行标记 `isMe`；按维度降序、同分按 updated_at/姓名兜底稳定排序 |
| `GET /api/points/feed?category=activity\|donation`（category 可选） | 全站近期**正向**获取动态，倒序分页 | 用户摘要 + points + source；活动类含活动标题；捐献类仅 `donationKind`（可暴露类型，不含 note/金额/物资名）；**不返回 reversal** |
| `GET /api/points/me` | 我的积分总览 | `{ activityPoints, donationPoints, total }`（无汇总行时返回三个 0） |
| `GET /api/points/me/ledger?category=` | 我的明细分页 | 完整流水视图：含本人 note、活动标题/捐献类型、正负分、时间、source |

排行榜零分用户：默认只返回有积分（该维度 > 0）的用户；`dimension=total` 口径为两列之和 > 0。

### 7.2 管理员接口（`server/api/admin/points/`，仅 admin）

| 方法 & 路径 | 说明 |
|---|---|
| `POST /api/admin/points` | 手工录入。body：`{ category, userId, points(1..9999), activityId?, donationKind?, note?, createdAt? }`，201 返回流水 |
| `GET /api/admin/points/ledger?page&pageSize&category?&keyword?&source?` | 全量流水分页审计：含 note、操作人、冲正关系；keyword 匹配用户姓名/手机号 |
| `POST /api/admin/points/:id/reverse` | 冲正。body：`{ reason: string(1..200) }`，返回新负流水 |

### 7.3 现有接口的字段增量

- 活动创建/编辑 schema（`server/schemas/activity.ts`）：
  - create 增加 `points: z.number().int().min(0).max(9999)`（前端默认传 0）；
  - update 增加同字段 `.optional()`。
- `publishActivity` / `editActivity` / activity repo 透传 `points`；活动视图对象（list/detail/mine）返回 `points`。
- 限流：`POST /api/admin/points` 与 reverse 沿用管理员写操作档（同建用户）；查询端点走默认 300/min。

## 8. PC 管理后台（Nuxt UI v4，仅 admin）

新增 `backend/app/pages/admin/points.vue`，侧边栏新增「积分管理」菜单项。

页面结构：

1. **录入弹窗**（UModal，正文必须用 `#body`；UForm 用 `:validate` 自定义校验 + `@submit`）：
   - 类别单选：活动积分 / 捐献积分；
   - 用户选择：关键字搜索（姓名/手机号），复用 `GET /api/admin/users?keyword=`；
   - 活动积分：活动下拉（标题 + 日期，含已取消项并标注），选中后自动带出该活动 `points` 到积分输入框，可改（0–9999，但提交正分所以录入表单限制 1–9999）；
   - 捐献积分：捐献类型单选（钱/物资）+ 积分值；
   - 备注（选填，≤200）、录入时间（选填，日期时间控件，缺省当前）。
2. **流水审计表**（UTable + UPagination，`${id}-cell` 插槽、`row.original`）：
   列：时间、用户、类别、来源、积分（正绿负红，带 +/-）、活动标题/捐献类型、备注、操作人、操作（冲正）。
   冲正按钮对「已被冲正」「自身为冲正记录」禁用；点击弹二次确认框填原因。
3. 顶部筛选：类别、来源、用户关键字。

活动创建/编辑页（`backend/app/pages/admin/activities/[id].vue` 及创建入口）增加「参与积分」数字输入（0–9999，默认 0，必填语义由默认值满足）。

## 9. App 端（unibest + wot-ui v2，登录可见）

新增/改动页面（`definePage` 声明路由，生成物不手改）：

1. **新增 `src/pages/points/index.vue`（排行榜 + 动态）**
   - 顶部我的积分卡：活动积分、捐献积分、总分（`GET /api/points/me`）；
   - Tabs：总榜 / 活动榜 / 捐献榜（`wd-tabs`）；前三名奖牌样式，列表：名次、头像、姓名、积分；`isMe` 行高亮；翻页分页；
   - 下方「近期动态」卡片流（`GET /api/points/feed`，上拉加载）：
     文案示例：`张三 参加活动「敬老院慰问」 +10`、`张三 捐献 +20`；相对时间；不出现金额/物资/备注。
2. **新增 `src/pages/points/ledger.vue`（我的明细）**：类别筛选 Tab + 分页列表，含本人完整备注、正负分色。
3. **`src/pages/me/me.vue`**：增加积分摘要（总分）与「积分排行 / 我的明细」入口；未登录沿用现有登录守卫。
4. **活动相关**：
   - `src/pages/activity/edit.vue`：表单加「参与积分」输入（0–9999，默认 0）；
   - `src/pages/activity/detail.vue`：积分 > 0 时在报名区展示「签到可得 N 积分」，0 分不显示。
5. API 封装：新增 `src/api/points.ts`（leaderboard / feed / myOverview / myLedger），
   走 alova Cookie 模式，Method 配置 **`cacheFor: { GET: 0 }`**（写操作后与切账号场景不得命中 5 分钟缓存，沿用项目既有教训）。

样式：全部 UnoCSS 原子类 + `var(--c-*)` 主题变量；wot 组件直接写标签、用 `variant` 属性，不硬编码 wot 色值。

## 10. 测试策略

后端 Vitest（服务/工具层，沿用现有 `*.test.ts` 风格）：

- 签到发分：首次签到写流水 + 汇总增加；重复签到（自助/补签各一）不重发；0 分活动不写流水。
- 手工录入：活动/捐献两类写流水且汇总一致；缺关联字段 422；用户/活动不存在 404。
- 冲正：生成等额负流水 + 汇总扣减；二次冲正被拒；冲正冲正记录被拒；净积分不足 409。
- 隐私：feed 序列化结果中捐献流水无 note/金额/物资字段、不含 reversal。
- 活动 schema：points 边界（-1 / 0 / 9999 / 10000）。

前端：`src/api/points.ts` 轻量测试（如现有粒度）；页面以手工联调验收为主：
建活动设积分 → 报名 → 签到 → 我的积分增加、排行榜/动态可见；管理员录入捐献 → 冲正 → 净额回落；
游客 401、非 admin 403；H5 两页面在浅/深主题下无硬编码色值、无布局错乱。

## 11. 迁移与验收

1. 编辑 `schema.ts` 后 `bun run db:generate`，人工核对 SQL：`activity` 加列带 `default 0`；两张新表 + 两条部分唯一索引 + 两条普通索引。
2. `bun run db:migrate`；存量活动 points = 0，不回填。
3. 质量门禁全绿：
   - backend：`bun run typecheck`、`bun run lint`、`bun run test`；
   - frontend：`bun run type-check`、`bun run lint`、`bun run test:run`。
4. 联调链路：前端 3333 → 代理 → 后端 9999，Cookie 会话不变。

## 12. 交付物清单

**backend**

- `server/database/schema.ts`：`activity.points`、`pointsLedger`、`userPoints`
- `server/database/repositories/points.ts`（新）；`activities.ts` 签到条件更新改造
- `server/schemas/points.ts`（新）；`schemas/activity.ts` points 字段
- `server/utils/points-service.ts`（新）；`utils/activity-service.ts` 签到事务化发分
- `server/api/points/`：`leaderboard.get.ts`、`feed.get.ts`、`me.get.ts`、`me/ledger.get.ts`
- `server/api/admin/points/`：`index.post.ts`、`ledger.get.ts`、`[id]/reverse.post.ts`
- `app/pages/admin/points.vue`（新）；侧边栏菜单；活动后台表单加积分字段
- `drizzle/*.sql` 新迁移

**frontend**

- `src/api/points.ts`（新）
- `src/pages/points/index.vue`、`src/pages/points/ledger.vue`（新）
- `src/pages/me/me.vue`、`src/pages/activity/edit.vue`、`src/pages/activity/detail.vue` 改造
