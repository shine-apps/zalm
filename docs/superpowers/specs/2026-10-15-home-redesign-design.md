# 首页重设计 · 设计文档

- 日期：2026-10-15
- 范围：frontend 首页（`pages/index/index`）重构 + backend 新增首页聚合接口、积分动态流公开化
- 状态：已与需求方确认（方案 A 布局 + 行动卡 B，轮播纯图片）

## 1. 背景与目标

当前首页（`frontend/src/pages/index/index.vue`）为纯静态页：使命 Banner、信念条、五个点击后仅弹「即将上线」的业务占位入口，未承载任何业务数据。

目标：以活动为核心重构首页，让访客「一进来就看到往期风采、马上能报名的活动、以及身边人的爱心动态」，缩短报名转化路径。

确认的决策：

1. 首页内容对**未登录游客全部可见**（活动本就公开；积分动态流改为公开，其响应已在序列化层做隐私白名单）。
2. 近期结束活动轮播素材：**相册第一张图片 → 封面 coverUrl → 跳过**，视频不参与轮播。
3. 招募列表只展示**当前真正可报名**的活动；满员活动保留但置灰。
4. 品牌元素精简：压缩使命 Banner（保留「了解我们」），删除五个占位入口，信念条由积分滚动条在冷启动时承担。
5. 积分滚动条展示活动 + 捐献两类动态，右侧带「积分榜 ›」入口。
6. 整页布局采用方案 A（品牌头 → 轮播 → 积分滚动条 → 招募列表）；招募卡片采用方案 B（上图下文行动卡，点击进详情完成报名，不做首页一键报名）。

## 2. 页面结构（自上而下）

1. **压缩品牌头**：组织名 + 一句使命标语 + 「了解我们 ›」（跳现有 about 页）。高度压缩，保证首屏露出轮播。
2. **近期风采轮播**（`fg-home-swiper`）：
   - 数据：近 30 天内结束（`endTime < now` 且 `endTime >= now - 30d`）、`published` 的活动，按 `endTime` 倒序，最多 5 场。
   - 每场取图：相册关联媒体中第一张 `type === 'image'`；无图片则用活动 `coverUrl`；两者皆无则该活动不进轮播。
   - 纯图片 `<swiper>`：4 秒自动切换、可手动滑动、底部圆点指示器；左下角叠「近期风采 · M月D日 已结束」小徽标与活动标题。
   - 点击任意位置 → `/pages/activity/detail?id=xxx`。
   - 全部活动都无图时，**整块不渲染**（不占位）。
3. **爱心动态滚动条**（`fg-points-ticker`）：
   - 数据：`GET /api/points/feed?page=1&pageSize=20`（公开后游客可调）。
   - 奖章图标 + 单条文案纵向无缝轮播，约 3 秒切换一条。
   - 右侧「积分榜 ›」→ `/pages/points/index`；游客点击进入后由该页现有登录流程处理。
   - 冷启动（无任何动态或请求失败）时轮播信念文案：「让每一份善意，一对一精准抵达需要的人」。
4. **招募中列表**：
   - 标题行：「🔥 招募中」+「N 场活动等你参与」+ 右侧「查看全部 ›」→ `uni.switchTab('/pages/activity/activity')`。
   - 数据：`published` 且当前时间不晚于有效报名截止时间（`registerDeadline ?? startTime`）的活动，按 `startTime` 升序，最多 5 条。**满员不剔除**。
   - 行动卡（`fg-recruit-card`）：上方封面（无封面时按分类色底 + Carbon 图标兜底）、左上角标（「报名中 · 剩 N 席」；`remaining === 0` 时「名额已满」）、标题、时间（复用 `formatTimeRange`）、地点、底部「已报 x/上限或不限」+ 名额进度条（不限名额时不显示进度条）+ CTA 按钮。
   - 满员卡整卡半透明置灰，CTA 变灰不可点；其余状态点击卡片或 CTA → 活动详情页（报名在详情页完成）。
   - 空态：虚线卡片「近期暂无招募活动，看看往期风采 ›」→ 活动 Tab。
5. 底部落款「仁心济世 · 善行天下」保留。

## 3. 后端改动

### 3.1 新增公开聚合接口 `GET /api/home`

- 路由：`backend/server/api/home/index.get.ts`，无需任何鉴权（游客可调）。
- 在 `server/utils/path.ts` 的 `isPublicRequest` 中精确放行 `^/api\/home$` 的 GET。
- 新增 service（`server/utils/home-service.ts`）与所需 repository 查询，返回：

```ts
{
  highlights: Array<{
    id: string
    title: string
    endTime: string
    categories: ActivityCategory[]
    imageUrl: string          // 相册第一张图片 URL 或 coverUrl
    imageSource: 'album' | 'cover'
  }>
  recruiting: ActivityView[]  // 复用现有 toActivityView 结构（含统计、media 留空数组）
}
```

选取规则：

- highlights 候选：published、`endTime < now <= endTime + 30 天`，按 endTime 倒序取一个超采样候选集（建议上限 20），批量查相册关联（仅 `type=image`，按 `activity_media.created_at` 升序取每活动第一张），按「相册首图 → coverUrl」生成 `imageUrl`，跳过两者皆无者，截取前 5。
- recruiting：published 且 `COALESCE(register_deadline, start_time) >= now`，按 `startTime` 升序取 5；批量统计报名数（复用 `getActivityStatsMap`），`toActivityView` 序列化（`myRegistration = null`、`media = []`）。
- 时间窗常量 `HIGHLIGHT_WINDOW_MS = 30 * 24 * 60 * 60_000`、`HOME_SECTION_LIMIT = 5`、`HIGHLIGHT_CANDIDATE_LIMIT = 20` 定义在 service 中。
- 响应走现有 `ok(data)` 信封；无分页 meta。

### 3.2 积分动态流公开化

- `server/api/points/feed.get.ts`：移除 `requireUser(event)`；query 解析与 service 调用不变。
- `server/utils/path.ts`：在 GET 公开规则中精确增加 `^/api\/points\/feed$`（不得用前缀匹配，避免误伤 `/points/me`、`/points/leaderboard`）。
- 隐私保障不变：`toFeedItem` 白名单输出（无 note/registrationId），捐献类不带金额、物资名；`listFeed` 已过滤冲正记录与负分。
- 限流：沿用全局默认档，不新增档位。
- 不涉及表结构变更与迁移。

## 4. 前端改动

### 4.1 API 层

- 新增 `frontend/src/api/home.ts`：
  - `HomeHighlight`、`HomeData` 类型；
  - `getHome(): Promise<HomeData>` → `http.Get('/home')`（普通信封解包，非分页）。
- 积分动态复用 `src/api/points.ts` 的 `getPointsFeed(1, undefined, 20)`。
- 图片 URL 统一经 `resolveMediaUrl` 处理。

### 4.2 组件（easycom `fg-*`，放 `src/components/fg-xxx/fg-xxx.vue`）

- `fg-home-swiper`：props `items: HomeHighlight[]`；原生 `<swiper>/<swiper-item>` + `<image mode="aspectFill">`；`autoplay interval=4000 circular indicator-dots`；emit `select(id)`。空数组时由父级控制不挂载（组件自身也以 `v-if="items.length"` 兜底渲染空）。
- `fg-points-ticker`：props `items: PointsFeedItem[]`、可选 `fallbackTexts: string[]`；纯 CSS/JS 纵向轮播当前 index（setInterval 3000，组件卸载 `onUnmounted` 清理；H5/小程序兼容用 `:style` transform 过渡，不依赖 DOM API）；点击右侧 emit `more`；单条文案由组件内 `formatFeedText(item)` 格式化并导出为可单测的纯函数（放在同组件目录的 `format.ts` 或 `src/utils/points-feed.ts`）。
- `fg-recruit-card`：props `activity: ActivityView`；内部计算席位文案、进度百分比、是否满员；emit `select(id)`；满员时不 emit、按钮置灰。封面兜底映射（分类 → 图标/底色）用常量表。

### 4.3 首页 `pages/index/index.vue` 重写

- `definePage` 保持 `type: 'home'`、`layout: 'blank'`。
- `onShow` 触发并发加载 `getHome()` 与 `getPointsFeed`；三板块（轮播、滚动条、招募）各自独立的 error/空态，任一失败不阻塞其余板块（alova 拦截器会 toast，页面内 catch 静默）。
- 跳转：about、activity detail（navigateTo）、活动 Tab（switchTab）、points 页（navigateTo）。
- 样式：UnoCSS 原子类 + 主题变量（`var(--c-*)`），不硬编码色值；分类兜底底色用 `primary-soft` 等已有语义色。
- 沿用项目约定：不注入 token（Cookie 通道）、GET 缓存已全局关闭，无需特殊处理。

### 4.4 文案规则

| source / category | 文案 |
| --- | --- |
| activity + checkin | `{name} 参与「{activityTitle}」签到，获得 {points} 积分` |
| activity + manual_activity | `{name} 参与「{activityTitle}」，获得 {points} 积分` |
| donation（任意 kind） | `{name} 爱心捐献，获得 {points} 积分` |
| 活动名为空 | 活动名兜底为「公益活动」 |

## 5. 错误处理与边界

- 后端：service 内聚合查询不抛业务错（无数据即空数组）；仅复用框架级 500 处理。
- 前端：
  - `/api/home` 失败 → 轮播与招募均显示各自空态（轮播隐藏、招募显示空态卡片），不白屏。
  - feed 失败或为空 → 滚动条轮播信念文案。
  - 图片加载失败 → image 绑定 `@error` 切换分类兜底底图（仅招募卡需要；轮播候选已保证有 URL，但加载失败时该 swiper-item 显示深色占位）。
- 视频媒体不出现在任何首页素材中。

## 6. 测试计划

后端（Vitest，沿用现有测试组织）：

- home-service：
  - highlights 仅取近 30 天结束的 published 活动、按 endTime 倒序、上限 5；
  - 相册首图（仅 image）优先于 coverUrl；相册只有视频时退回 coverUrl；皆无时跳过；超采样候选 20；
  - recruiting 过滤未取消、未过有效报名截止（有 deadline 用 deadline、无则用 start）、按 start 升序、上限 5；满员保留；
  - 响应不含 myRegistration/media 以外的多余字段（结构快照或关键字段断言）。
- feed 公开：模拟无会话 GET `/api/points/feed` 返回 200 且响应元素不含 `note` 键；`/api/points/me` 仍为 401。

前端（Vitest）：

- `formatFeedText` 四种分支 + 活动名空兜底；
- 招募卡派生：剩余席位文案、进度百分比（不限名额为 null）、满员判定；
- 组件其余行为以手工验收为主。

质量门禁：backend `typecheck`/`lint`/`test`，frontend `type-check`/`lint`/`test:run` 全绿。

手工验收：

1. 游客打开首页：轮播、招募、滚动条均可见；
2. 轮播自动播放/手滑/点击进详情；相册只有视频的活动显示封面；
3. 滚动条 3 秒切换、文案正确、「积分榜」可跳转；无数据时显示信念文案；
4. 满员活动置灰且 CTA 不可点；「查看全部」跳到活动 Tab；
5. 详情页报名后返回首页（onShow）数据刷新；
6. 断网/接口报错时三板块独立降级，不白屏。

## 7. 不做的事（YAGNI）

- 不做首页一键报名、不做活动搜索/分类筛选（活动 Tab 已有）。
- 不做轮播视频、不做后台运营位配置（轮播内容完全由真实活动数据派生）。
- 不新增表、不做服务端推送/实时刷新。
- 不改动活动详情、积分页本身的任何功能。
