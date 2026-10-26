# 用户实名认证（个人 + 企业，OCR 预填 + 人工审核）设计文档

日期：2026-10-26
状态：已确认（数据模型经用户修订：单张证件照 + 展示媒体 + 介绍文字）

## 1. 背景与目标

平台用户可申请两类实名认证，**同一用户两类可并存、独立审核**：

- **个人认证**：上传身份证人像面照片，OCR 识别姓名与身份证号
- **企业认证**：上传营业执照照片，OCR 识别企业名称、统一社会信用代码、法定代表人

认证流程：**OCR 预填 + 人工审核**。OCR 仅用于预填表单，用户校对修改后提交，后台管理员人工核对证件照与表单信息（含 OCR 原始结果比对）后决定通过或驳回。

除证件信息外，申请时还需提交：

- **展示媒体**：个人展示或公司展示的照片/视频（多个）
- **介绍文字**：个人介绍或公司介绍

状态规则：**驳回可重提（不限次数），通过即锁定**。同类型在 `pending` 状态不可重复提交；通过后用户不可自行修改（变更流程本期不做）。

## 2. 范围

做：

- 用户端：两类认证的 OCR 预填、申请提交、状态查看（含驳回原因）
- 管理端：审核列表、详情比对、通过/驳回、结果站内通知
- 腾讯云 OCR 接入（身份证 + 营业执照），含开发环境 mock
- 公开用户主页（user-home）展示：认证徽标 + 已通过认证的展示相册（照片/视频）与介绍文字

不做（YAGNI）：

- 认证通过后的变更/注销流程
- 人脸识别、银行卡核验等增强核验
- 独立"审核员"角色（复用现有 `admin` 角色判据）

## 3. 总体架构

采用**方案 A：复用 COS 直传 + 独立 OCR 预填端点**。

```
用户端 (H5)
  │ ① 现有 COS 直传链路（STS 凭证 + 服务端登记），scope 新增 verification
  │    POST /api/media/credentials → 直传 COS → POST /api/media/register
  │ ② POST /api/verification/ocr { kind, imageUrl }
  │    后端从 COS 拉图 → 腾讯云 OCR → 返回结构化预填字段
  │ ③ 用户校对表单 + 补充展示媒体/介绍 → POST /api/verification
  ▼
后端 (Nuxt)
  │ user_verification 表落库（pending）
  ▼
管理端 (PC admin)
  │ GET /api/admin/verifications（分页/筛选）
  │ POST /api/admin/verifications/[id]/review { action, rejectReason? }
  │ 审核结论写入表 + notification 表发站内通知
```

证件照与展示媒体**统一走 COS 直传链路**（不走 `upload/avatar` 本地上传），服务端登记时 `headObject` 权威核实。

## 4. 数据模型

### 4.1 新表 `user_verification`（schema.ts）

| 列（snake_case） | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | 默认 `gen_random_uuid()`（与现有表一致） |
| `user_id` | uuid → user.id | `onDelete: cascade` |
| `kind` | text | `'personal' \| 'enterprise'` |
| `status` | text | `'pending' \| 'approved' \| 'rejected'`，默认 `'pending'` |
| `payload` | jsonb | 用户确认后的表单，见 4.2 |
| `verification_image` | text | 单张证件照 media URL（身份证人像面 / 营业执照） |
| `showcase_media` | jsonb | 展示媒体数组：`[{ url, type }]`，`type ∈ image|video`，上限 9 个 |
| `introduction` | text | 个人/公司介绍文字，上限 2000 字 |
| `ocr_result` | jsonb \| null | 腾讯云 OCR 原始结构化返回（供审核员比对） |
| `reviewed_by` | uuid → user.id \| null | 审核人 |
| `reviewed_at` | timestamptz \| null | 审核时间 |
| `reject_reason` | text \| null | 驳回原因（驳回时必填） |
| `created_at` / `updated_at` | timestamptz | 统一 `timestamp({ withTimezone: true })` |

约束与索引：

- 普通索引：`(user_id)`、`(status, created_at)`（审核列表按状态筛选 + 时间排序）
- **防重复 pending**：同一 `(user_id, kind)` 仅允许一条 `pending`。Postgres 部分唯一索引 drizzle-kit 支持有限，采用应用层校验（提交时查询 + 409 CONFLICT），并发兜底由审核端只处理最早一条 pending 保证
- 历史记录保留：驳回/通过后的旧记录不删除，新申请插入新行；查询用户当前状态时取该 `(user_id, kind)` 最新一条

### 4.2 payload 结构

个人（`kind = 'personal'`）：

```json
{ "realName": "张三", "idCardNumber": "110101199001011234" }
```

企业（`kind = 'enterprise'`）：

```json
{ "companyName": "某某科技有限公司", "creditCode": "91110108MA01XXXXXX", "legalPerson": "张三" }
```

Zod schema 放 `server/schemas/verification.ts`：身份证号 18 位格式校验（含校验位算法）、统一信用代码 18 位格式校验。

### 4.3 媒体 scope 扩展

- `server/utils/media.ts` 的 `MEDIA_SCOPES` 新增 `'verification'`
- 前端 `src/api/media.ts` 的 `MediaScope` 同步新增
- 证件照与展示媒体均使用 `verification` scope；image ≤10MB、video ≤500MB 沿用现有 `MEDIA_TYPE_CONFIG`

### 4.4 迁移

按仓库规则：`bun run db:generate -- --name add_user_verification`，生成带语义名的 SQL 迁移并提交。

## 5. 后端 API

### 5.1 用户端（`/api/verification/**`，登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/verification/ocr` | 入参 `{ kind, imageUrl }`（Zod 校验，imageUrl 必须是已登记的 verification scope media URL）。后端按 key 从 COS 取图 → 调腾讯云 OCR：personal → `IDCardOCR`，enterprise → `BizLicenseOCR` → 返回 `{ fields: {...}, raw: {...} }`。OCR 失败返回 200 + `{ fields: null }`（前端降级为纯手填），不阻断流程 |
| POST | `/api/verification` | 提交申请。入参 `{ kind, payload, verificationImage, showcaseMedia, introduction }`，全部 Zod 校验；media URL 必须已登记。同 `(userId, kind)` 存在 pending → 409 CONFLICT；已有 approved → 409（本期不允许变更）。成功后创建 pending 记录，`ocrResult` 取提交时前端回传的 OCR raw（可选） |
| GET | `/api/verification/me` | 返回 `{ personal: latestRecord \| null, enterprise: latestRecord \| null }`，含 status、rejectReason、createdAt，驱动前端状态展示 |

OCR 端点加入敏感端点限流档（10/min，`getRateLimitTier` 增加 `verification/ocr` 匹配，阈值可经环境变量调整）。提交与查询走全局默认档。

### 5.1a 公开展示端点（游客可访问）

新增 `GET /api/users/[id]/verification`，经现有 `isPublicRequest` 白名单对游客公开，返回该用户**已通过（approved）**的认证展示信息：

```json
{
  "personal": { "approvedAt": "...", "showcaseMedia": [{ "url": "...", "type": "image" }], "introduction": "..." } | null,
  "enterprise": { "approvedAt": "...", "showcaseMedia": [...], "introduction": "...", "companyName": "..." } | null,
  "verified": { "personal": true, "enterprise": false }
}
```

**隐私红线**：公开端点只暴露 `approvedAt / showcaseMedia / introduction`（企业额外 `companyName`，属公开工商信息）；**绝不暴露** `payload` 其余字段（真实姓名、身份证号、信用代码、法人）、`ocrResult`、`rejectReason` 及 pending/rejected 记录。用户不存在或被封禁按 `/api/users/[id]` 同样规则 404。

### 5.2 管理端（`/api/admin/verifications/**`，仅 admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/verifications` | 分页列表（`page/pageSize` + 统一 `pagination` 响应），query 支持 `status`、`kind` 筛选，默认按 createdAt 升序（先申请先审） |
| GET | `/api/admin/verifications/[id]` | 详情：payload + verificationImage + showcaseMedia + introduction + ocrResult + 申请用户基础信息（id/name/email） |
| POST | `/api/admin/verifications/[id]/review` | 入参 `{ action: 'approve' \| 'reject', rejectReason? }`（reject 时 rejectReason 必填）。仅 pending 可审，非 pending → 409。写入 reviewedBy/reviewedAt/status，并插入 notification 通知申请人（新增通知类型码 `verification.approved` / `verification.rejected`，驳回通知携带原因） |

### 5.3 错误处理

沿用统一错误序列化：Zod 失败 422 `VALIDATION_ERROR`（带 issues）；未登录 401；非 admin 访问管理端 403；记录不存在 404；重复 pending / 已 approved 再提交 / 非 pending 审核 → 409 `CONFLICT`；OCR 上游异常按 5.1 降级，不向用户暴露 500。

### 5.4 OCR 服务封装

新建 `server/utils/ocr.ts`：

- `recognizeIdCard(imageBuffer): Promise<IdCardFields | null>`
- `recognizeBizLicense(imageBuffer): Promise<BizLicenseFields | null>`
- 密钥复用 `TENCENT_COS_SECRET_ID` / `TENCENT_COS_SECRET_KEY`（同一腾讯云账号开通 OCR 即可），新增环境变量：
  - `OCR_MOCK=true`：开发/CI 返回固定假数据，不调真实 API（对齐 `WECHAT_MOCK` 模式）
  - `TENCENT_OCR_REGION`（可选，默认复用 COS region）
- `.env.example` 补充上述变量及说明

## 6. 前端设计（H5，unibest + wot-ui）

1. **`pages/me/verification/index.vue`** — 认证入口页：个人认证 / 企业认证两个卡片，各自状态徽标（未认证 / 审核中 / 已认证 / 已驳回 + 驳回原因），点击进入申请页（已认证/审核中则只读查看）
2. **`pages/me/verification/apply.vue`** — 申请流程：
   - 步骤 1：上传证件照（COS 直传，verification scope）→ 自动调 OCR（loading 态）→ 表单预填，全部字段可编辑；OCR 失败 toast 提示后手填
   - 步骤 2：补充展示照片/视频（多选，≤9，复用 COS 直传）+ 介绍文字（textarea）
   - 步骤 3：确认提交；成功后返回入口页显示"审核中"
3. **`pages/me/me.vue`** "我的"页菜单新增"实名认证"入口
4. **`pages/user-home/index.vue`** 公开用户主页增加认证展示（self / other / 游客三种模式一致，数据来自 `GET /api/users/:id/verification`，与 profile/points 并行加载）：
   - 用户名旁显示认证徽标：`已个人认证` / `已企业认证`（仅 approved，样式参考现有 `roleBadge`）
   - 新增"认证相册与介绍"模块（放在积分模块之后、活动记录之前）：任一类型 approved 时展示——介绍文字（企业认证标题带公司名）+ 展示媒体网格（图片点击预览，视频点击播放，`resolveMediaUrl` 解析 URL）；两类都 approved 时分两段展示；均未认证则整个模块不渲染
5. 新增 `src/api/verification.ts`：`submitVerification / getMyVerifications / recognizeVerificationImage / getUserVerification(userId)`，响应解包与 401 处理沿用 alova 现有约定；409 冲突 toast 提示

## 7. 管理端设计（Nuxt admin）

1. **`app/pages/admin/verifications/index.vue`** — UTable 列表：申请人、类型、状态、申请时间；状态/类型筛选 + UPagination（`v-model:page` + `:total` + `:items-per-page`）
2. **`app/pages/admin/verifications/[id].vue`** — 详情页：证件照大图、OCR 原始结果、用户确认表单三栏并排比对；展示媒体预览（图/视频）与介绍文字；底部"通过 / 驳回"操作，驳回用 UModal（正文 `<template #body>`）填驳回原因
3. 侧边栏 `layouts/default.vue` 新增"认证审核"导航项

## 8. 测试

后端（Vitest，对齐现有工具层单测）：

- `server/schemas/verification.ts`：身份证号校验位、信用代码格式、showcaseMedia 上限、introduction 长度
- `server/utils/ocr.ts`：OCR_MOCK 下返回固定结构；OCR 失败返回 null 不抛错
- 处理器层：提交时重复 pending → 409；非 pending 审核 → 409；review 后 notification 写入
- 公开端点 `GET /api/users/[id]/verification`：只返回 approved 记录；断言响应中不含 payload 敏感字段（idCardNumber/creditCode/realName/legalPerson）、ocrResult；封禁用户 404

前端（Vitest）：`api/verification.ts` 请求路径与响应解包单测（沿用现有 api 层测试模式）。

手工验证清单：OCR_MOCK 下全流程（个人/企业各一遍：上传 → 预填 → 提交 → 审核通过/驳回 → 站内通知 → 驳回后重提）。

## 9. 质量门禁

合入前 backend `bun run typecheck / lint / test`、frontend `bun run type-check / lint / test:run` 全绿。
