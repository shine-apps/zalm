# 活动相册（活动照片/视频上传与展示）设计文档

- 日期：2026-10-11
- 状态：已评审通过（三节设计均经用户逐节确认）
- 范围：backend + frontend

## 1. 背景与目标

活动管理者（`activity_admin` / `admin`）可以在 App 内为活动上传照片和视频，每条媒体可带选填的描述信息；所有访客在活动详情页的「活动相册」区块浏览。

已确认的需求决策：

| 决策点 | 结论 |
|---|---|
| 管理入口 | App 内组织者端，独立媒体管理页 |
| 上传时机 | 随时可传，无阶段限制 |
| 描述 | 选填，上传后可编辑、可清空 |
| 数量 | 不限量，按上传时间倒序 |
| 详情展示 | 相册区块：九宫格 + 全屏预览/弹层播放 |
| 数据模型 | 新建 `activity_media` 关联表（方案 A） |

## 2. 数据模型

新增表 `activity_media`（snake_case 物理列，风格与 `activity_registration` 一致）：

| 列 | 类型 | 约束/说明 |
|---|---|---|
| `id` | text PK | `crypto.randomUUID()` |
| `activity_id` | text | FK → `activity.id`，`onDelete: cascade` |
| `media_id` | text | FK → `media_file.id`，`onDelete: restrict` |
| `description` | text | `not null default ''`，选填，≤200 字 |
| `created_at` | timestamptz | `not null default now()`，排序依据 |
| 唯一约束 | — | `(activity_id, media_id)`，重复挂载回 409 |

配套逻辑：

- 绑定成功：`media_file.ref_count + 1`（复用 [repositories/media.ts](file:///d:/projects/zhongailianmeng/zalm-code/backend/server/database/repositories/media.ts) 的增减方法）
- 解绑：`ref_count - 1`（`greatest(0, ...)` 兜底），`media_file` 行保留，孤儿文件仍由现有 admin 媒体管理端 `ref_count > 0` 拒删护栏体系处理
- 删除活动：级联清理关联行（ref_count 不回捡，孤儿同上）

媒体值域：仅 `image` / `video` 可入相册；`audio` / `file` 拒绝（422）。

改表流程遵循 AGENTS.md §7.3：编辑 `schema.ts` → `bun run db:generate` → 提交生成 SQL → `bun run db:migrate`。

## 3. 后端 API

全部挂 `/api/activities/**`（前缀硬约束：`/api/admin/**` 绑死 admin 角色，不可用）。

### 3.1 读取（公开）

`GET /api/activities/[id]` 已有公开逻辑，`ActivityView` 增加字段：

```ts
media: Array<{
  id: string
  url: string
  type: 'image' | 'video'
  description: string
  duration?: number
  width?: number
  height?: number
  createdAt: string
}>
```

- 按 `created_at` 倒序，全量返回（单条几十字节，活动媒体量级可控，不分页）
- 转换逻辑落在 `activity-service` 的 `ActivityView` 组装处
- 字段裁剪：只暴露上表字段，不泄漏 `media_file.metadata` 内的 COS key/bucket 等内部信息

### 3.2 绑定

`POST /api/activities/[id]/media`

- 权限：`requireAnyRole(event, ACTIVITY_ORGANIZER_ROLES)`（与其他组织者接口一致）
- body（Zod）：`{ mediaId: string, description?: string ≤200 }`
- 校验顺序：活动存在（404）→ 媒体行存在（404）→ `type ∈ {image, video}`（422）→ 唯一约束冲突（409）
- 成功：写 `activity_media`，`ref_count + 1`，返回关联行

### 3.3 改描述

`PATCH /api/activities/[id]/media/[mediaId]`

- 权限同上；body：`{ description: string ≤200 }`（允许空串 = 清空）
- 关联行不存在（含活动不匹配）→ 404

### 3.4 解绑

`DELETE /api/activities/[id]/media/[mediaId]`

- 权限同上；删关联行，`ref_count - 1`，`media_file` 保留
- 不存在 → 404

### 3.5 横切约定

- 错误一律 `createApiError(code)`，由 `server/plugins/error.ts` 统一序列化
- 限流用全局默认（300/min），不进敏感端点名单（10/min 仅限登录/报名/签到类）
- 上传链路不新增接口：前端复用 `media-uploader` → COS 直传 → `POST /api/media/register` 取 `media_id`，再调绑定

## 4. 前端

### 4.1 类型与 API 封装（[frontend/src/api/activity.ts](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/api/activity.ts)）

- 新增 `ActivityMediaItem` 类型（与 3.1 返回结构一致）
- `ActivityView` 增加 `media: ActivityMediaItem[]`
- 新增 `bindActivityMedia(activityId, body)` / `updateActivityMedia(activityId, mediaId, body)` / `deleteActivityMedia(activityId, mediaId)`
- 相关 GET 沿用 `cacheFor = 0`（项目教训：alova 默认缓存导致写后不刷新）

### 4.2 独立媒体管理页 `pages/activity/media.vue`

- `definePage` 声明，路由参数 `id`（活动 ID）；新页面在 `pages.config.ts` 注册（生成物 `src/pages.json` 不手改）
- 结构：
  1. 顶部提示条（说明支持的类型与大小限制）
  2. 两个上传区：`media-uploader`（`type="image" multiple` + `type="video"` 各一）
  3. 媒体列表（`ActivityView.media` 时间倒序）：缩略图/视频占位 + 描述输入框 + 删除按钮
- 交互：
  - **上传完成即绑定**：监听 `change`，`status === 'done'` 的新项立即调 POST（描述为空），无需保存按钮
  - 描述：失焦触发 PATCH；空串即清空
  - 删除：`uni.showModal` 二次确认后调 DELETE
  - 绑定冲突（409）或其他失败：toast + 刷新列表兜底
- 入口：活动编辑页 [edit.vue](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/pages/activity/edit.vue) 底部「管理活动相册」按钮，仅组织者可见（沿用现有管理按钮权限判断）

### 4.3 详情页相册区块（[detail.vue](file:///d:/projects/zhongailianmeng/zalm-code/frontend/src/pages/activity/detail.vue)）

- 位置：活动基本信息之后、报名操作之前；`media` 为空整块不渲染
- 九宫格 3 列：图片 `image` 缩略图（`aspectFill`）；视频项显示占位封面（播放图标 + 时长角标，不做转码/截帧）
- 首屏渲染前 12 条，超出显示「查看全部 N 条」展开
- 图片点击 `uni.previewImage`（urls 传全量图片列表，支持左右滑动）
- 视频点击弹层内嵌 `<video>` 播放，关闭时销毁
- 描述：每项缩略图下方小字展示（1 行截断）；全屏图片预览不重复显示描述
- 样式：UnoCSS 原子类 + 主题变量；`wd-*` 走 easycom 直接用

### 4.4 平台差异

上传的 H5/小程序分支已由 `media-uploader` / `uploadMedia` 条件编译封装，本功能不新增平台分支代码。

## 5. 错误处理汇总

| 场景 | code | HTTP |
|---|---|---|
| 活动不存在 | NOT_FOUND | 404 |
| 媒体不存在 / 关联不存在 | NOT_FOUND | 404 |
| 重复绑定同一 mediaId | CONFLICT | 409 |
| 媒体类型非 image/video、描述超 200 字 | VALIDATION_ERROR | 422 |
| 非组织者调写接口 | FORBIDDEN | 403 |
| 未登录 | UNAUTHORIZED | 401 |

## 6. 测试

**后端单测**（Vitest，沿用工具层测试风格）：

- `server/schemas/activity.ts` 新 schema：
  - 绑定 body：缺 `mediaId` → 失败；`description` 超 200 字 → 失败；合法通过
  - 描述更新：空串通过、超长失败
- 媒体查询/转换逻辑（落在 `activity-service`，与 `ActivityView` 组装同处）：
  - 倒序正确、字段裁剪正确
  - 重复绑定冲突、删除后 `ref_count - 1` 不低于 0

**前端门禁**：`bun run type-check` / `bun run lint` / `bun run test:run` 全绿；不新增组件挂载测试。

**手工验收清单**（H5：后端 9999 + 前端 3333）：

1. 组织者上传图片/视频 → 自动入列表，详情页相册即时可见
2. 填写/修改/清空描述 → 详情页刷新生效（验证 `cacheFor = 0`）
3. 删除媒体 → 详情页消失，`ref_count` 归还
4. 游客打开详情 → 可看相册，无管理入口
5. 非组织者直接调 POST/PATCH/DELETE → 403
6. 重复绑定 → 409；绑定 audio 类型 → 422
7. 图片全屏预览可滑动；视频弹层播放可关闭
8. 超 12 条 → 首屏 12 条 + 展开
9. 双端质量门禁全绿（backend `typecheck`/`lint`/`test` + frontend 三件套）

## 7. 明确不做（YAGNI）

- 手动排序 / 置顶
- 上传阶段标签（活动前/中/后）
- 媒体软删除与恢复
- 详情接口分页
- PC 后台管理入口（`activity_admin` 管理动作一律在 App 内）
- 视频转码、服务端封面截取
- 删除活动时回捡 ref_count（沿用孤儿文件由 admin 端清理的现有体系）
