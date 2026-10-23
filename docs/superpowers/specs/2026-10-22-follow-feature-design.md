# 设计文档：我的关注（关注活动与用户）

* 日期：2026-10-22

* 状态：已与用户逐段确认

* 范围：前后端全链路新增"关注"功能，替代"我的收藏"占位入口

## 1. 背景与目标

现状：前端"我的"页面的「我的收藏」是一个占位菜单项（`frontend/src/pages/me/me.vue`，点击 toast"功能开发中"），前后端均无任何收藏/关注实现。本设计将「我的收藏」改造为「我的关注」：

* 可关注**活动页**（活动详情页底栏按钮）

* 可关注**其他用户**（他人主页顶部按钮）

* 「我的关注」列表页（单页双 tab）集中管理

## 2. 需求决策记录（用户确认）

| 决策点    | 结论                                       |
| ------ | ---------------------------------------- |
| 关注语义深度 | **仅收藏夹式**：不做通知推送、不做粉丝数/粉丝列表、不做关注 feed 流  |
| 列表页形态  | **单页双 tab**：「活动」/「用户」两个 wd-tabs，各自独立分页   |
| 关注活动入口 | 活动详情页底部操作条（分享按钮旁）                        |
| 关注用户入口 | 他人主页（user-home）顶部按钮                      |
| 数据模型   | **单表多态**（follow 表，targetType + targetId） |

## 3. 数据模型

`backend/server/database/schema.ts` 新增 `follow` 表：

```ts
export const follow = pgTable(
  'follow',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(), // 'activity' | 'user'
    targetId: text('target_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('follow_user_target_unique').on(t.userId, t.targetType, t.targetId),
    index('follow_user_type_idx').on(t.userId, t.targetType),
  ],
)
```

要点：

* `userId`（关注者）挂真实外键级联删除：用户注销 → 其关注记录自动清理。

* `targetId` 多态无外键；孤儿记录（活动被删、目标用户注销）通过**查询时 inner join 目标表**自然过滤，不做异步清理任务。

* `targetType` 值域由 Zod `z.enum(['activity', 'user'])` 在入参层校验；未来扩展新类型只需加枚举值。

* 管理后台不做关注数据管理页（纯个人收藏夹语义，无运营诉求）。

迁移流程（仓库规则）：编辑 schema.ts → `bun run db:generate -- --name add_follows` → 提交 `backend/drizzle/*.sql` → `bun run db:migrate`。

## 4. 后端 API

### 4.1 写操作（资源嵌套路径，同 `POST /api/activities/[id]/register` 模式）

| 端点                                   | 行为                                                                |
| ------------------------------------ | ----------------------------------------------------------------- |
| `POST /api/activities/[id]/follow`   | 关注活动。活动不存在 404；重复关注幂等返回 `{ followed: true }`（onConflictDoNothing） |
| `DELETE /api/activities/[id]/follow` | 取关活动。未关注时幂等返回 `{ followed: false }`                               |
| `POST /api/users/[id]/follow`        | 关注用户。**关注自己 422**；目标不存在/封禁 404；重复幂等                               |
| `DELETE /api/users/[id]/follow`      | 取关用户。幂等返回 `{ followed: false }`                                   |

### 4.2 读操作（均需登录，`requireUser`）

| 端点                                               | 行为                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/follows?type=activity&page=&pageSize=` | 我关注的活动卡片分页：inner join `activity`（过滤孤儿与已删活动），返回 `{ activityId, title, coverUrl, startTime, location, status }`，按 `follow.createdAt` 倒序 |
| `GET /api/follows?type=user&page=&pageSize=`     | 我关注的用户卡片分页：inner join `user`（过滤注销/封禁），返回 `{ userId, name, image }`，按 `follow.createdAt` 倒序                                            |

### 4.3 状态附带（跟随 `myRegistration` 软会话既有模式）

* `GET /api/activities/[id]` 的 `ActivityView` 增加 `isFollowed: boolean`（游客为 `false`）

* `GET /api/users/[id]`（用户主页公开资料）增加 `isFollowed: boolean`（游客为 `false`）

* `server/middleware/20.auth.ts` 的 `isSoftSessionPath` 登记 `/api/users/**`（当前仅 `/api/activities/**` 与 `POST /api/share/events`），保持游客可访问 + 登录者附带状态

### 4.4 横切关注点

* 4 个写端点 `requireUser`（未登录 401）；加入限流敏感档 30/min（`server/utils/rate-limit.ts` 的 `getRateLimitTier` 登记，介于公开档 300/min 与报名档 10/min 之间，防脚本刷库）。

* Zod 入参（`server/schemas/` 新建 follow\.ts）：`followsQuerySchema`（type enum + 分页参数）、id 参数复用 `idParamSchema` 风格。

* Repository 新建 `server/database/repositories/follows.ts`：`insertFollow` / `deleteFollow` / `getFollowedActivities` / `getFollowedUsers` / `isFollowing`，纯函数导出、支持事务传参（`DbExecutor`），与现有 repository 风格一致。

* 响应统一走 `ok()` / `paginated()`；错误统一 `createApiError`。

## 5. 前端

### 5.1 菜单改造 — `frontend/src/pages/me/me.vue`

原「我的收藏」占位项（第 107 行）改为：

```ts
{ key: 'follows', label: '我的关注', icon: 'i-carbon-user-follow', url: '/pages/follow/index' }
```

（me.vue 第 16 行的 UnoCSS 图标扫描注释同步补 `i-carbon-user-follow`。）

### 5.2 新页面 `frontend/src/pages/follow/index.vue`

* `definePage({...})` 声明（生成物 pages.json 不手改），登录守卫同 points 页模式。

* 顶部 `wd-tabs`：「活动」/「用户」双 tab，各自独立分页状态（`items/page/total/finished` + `onReachBottom` 滚动加载，同 user-home 模式）。

* 活动 tab 卡片：封面、标题、时间、地点、状态标签 → 点击跳活动详情。

* 用户 tab 卡片：头像、昵称 → 点击跳 `/pages/user-home/index?id=`。

* 空状态各自展示（「暂无关注的活动」/「暂无关注的用户」）。

* 卡片右侧小"取关"按钮（星标 icon）：点击即取关并从列表移除，toast 反馈。

### 5.3 活动详情页 — `frontend/src/pages/activity/detail.vue`

* 底部操作条（第 582 行分享按钮旁）加关注按钮：`i-carbon-star`，未关注空心/已关注实心（主题色）。

* 游客点击跳登录页（复用现有"登录后报名"模式）；点击后乐观切换 icon，API 失败回滚 + toast。

* 初始状态来自 `ActivityView.isFollowed`。

### 5.4 他人主页 — `frontend/src/pages/user-home/index.vue`

* other 模式顶部展示「关注 / 已关注」`wd-button`：未关注实心（base 变体）、已关注 soft 变体灰底；self 模式不显示。

* 游客点击跳登录；乐观更新，失败回滚 + toast。

* 初始状态来自 `GET /api/users/[id]` 的 `isFollowed`。

### 5.5 API 模块 `frontend/src/api/follow.ts`

* `followActivity(id)` / `unfollowActivity(id)` / `followUser(id)` / `unfollowUser(id)`（写操作，统一 toast）

* `getFollowedActivities(page, pageSize)` / `getFollowedUsers(page, pageSize)`（分页，`meta: { rawEnvelope: true }`）

* 类型：`ActivityView` 加 `isFollowed: boolean`；`PublicUserProfile` 加 `isFollowed: boolean`；新建 `FollowedActivityCard` / `FollowedUserCard` 类型。

## 6. 错误处理汇总

| 场景            | 行为                                    |
| ------------- | ------------------------------------- |
| 游客调用写端点       | 401 UNAUTHORIZED（前端在按钮层引导登录，不展示裸 401） |
| 关注自己          | 422 VALIDATION\_ERROR                 |
| 目标活动/用户不存在或封禁 | 404 NOT\_FOUND                        |
| 重复关注 / 重复取关   | 幂等成功（不报 409）                          |
| 乐观更新失败        | 前端回滚 icon 状态 + toast 错误信息             |
| 孤儿关注记录        | 列表查询 inner join 自然过滤，不返回              |

## 7. 测试策略

* 后端（Vitest，现有工具层单测模式）：`follows.ts` repository 单测——幂等插入、幂等删除、分页查询 join 过滤（孤儿/封禁）、`isFollowing`。

* 前端：`api/follow.ts` 函数签名与类型单测（跟随现有 api 模块测试模式，若有）。

* 质量门禁（合入前全绿）：backend `bun run typecheck && bun run lint && bun run test`；frontend `bun run type-check && bun run lint && bun run test:run`。

## 8. 明确不做（YAGNI）

* 通知推送（关注/被关注/活动更新提醒）

* 粉丝数、关注数展示，粉丝列表页

* 活动列表页快捷星标

* 管理后台关注数据管理页

* 关注 feed 流（"关注的人发布的活动"聚合页）

## 9. 实施清单概览

1. backend：schema.ts 加 follow 表 → 迁移 `add_follows`
2. backend：schemas/follow\.ts + repositories/follows.ts
3. backend：4 个写路由 + 1 个读路由（GET /api/follows）
4. backend：activities/\[id].get.ts 与 users/\[id].get.ts 附带 isFollowed；isSoftSessionPath 登记 /api/users/\*\*；限流档登记
5. frontend：api/follow\.ts + 类型扩展
6. frontend：me.vue 菜单改造
7. frontend：pages/follow/index.vue 新页面
8. frontend：activity/detail.vue 底栏关注按钮
9. frontend：user-home/index.vue 顶部关注按钮
10. 双端质量门禁全绿

