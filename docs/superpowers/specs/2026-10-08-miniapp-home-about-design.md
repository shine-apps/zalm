# 众爱联盟小程序 · 总台样式 / 首页 / 关于页 设计文档

日期：2026-10-08
范围：frontend（uniapp + Vue3 + wot-ui v2 + UnoCSS），不涉及后端改动。
状态：已与需求方口头确认，待书面评审。

## 1. 背景与目标

众爱联盟是社会公益组织，业务为：以「一对一」结对方式助力困境学生安心学业，承接爱心物资发送，弘扬传统文化，助力乡村振兴，关爱老人、儿童及贫困、孱弱、残疾人群。

现有前端工程是带认证体系的 unibest 模板，首页仅有 logo 与名称，关于页是 wot-ui 组件冒烟样例，整体视觉仍是模板的「武协绿」。本轮交付：

1. **总台样式**：全站视觉换为「暖心公益红」暖色体系（含深色模式），延续 logo 中的红色（#d14328）。
2. **首页**：以品牌展示为首要目标 —— 使命 Banner + 五大业务入口。
3. **活动 tab 占位页**：样式化空状态，可点不报错。
4. **关于页**：组织简介 + 使命愿景 + 联系方式，对所有用户可见。
5. **底部导航**：首页 / 活动 / 关于 / 我的，四个 tab，关于页去掉管理员限制。

## 2. 不做什么（YAGNI）

- 不做后端内容接口、数据表、后台管理；全部文案静态写在前端（页面内 `as const` 数据数组）。
- 不做公益动态资讯流、公信力数据栏、活动报名、志愿者招募、五大业务的二级落地页。
- 不引入新的 UI 库、不安装 `@wot-ui/unocss-preset`。
- 不新增品牌主题；商务蓝作为已有备选保留，用户可在「我的」中切换。
- 联系方式信息未提供，首版为占位行、不绑定点击行为。

## 3. 总台样式（主题系统改动）

落地方式：**重定义 default 品牌的变量值为公益红暖色体系**（品牌 value `default` 不变，只换值与显示名）。全部颜色仍只走 `src/style/themes.scss` 的 CSS 变量，wot-ui 经现有 `wot-bridge-vars` 自动跟随，页面代码不出现硬编码色值。

### 3.1 浅色模式（`$:root, page` 默认组）

| 变量 | 现值（武协绿/冷灰） | 新值（公益红/暖米） | 用途 |
|------|------|------|------|
| `--c-primary` | `#16a34a` | `#d14328` | 主色，与 logo 红一致 |
| `--c-primary-soft` | `#f0fdf4` | `#fdece5` | 浅红底（图标衬底、标签） |
| `--c-primary-soft-text` | `#15803d` | `#b92e17` | 浅红底上的文字/深色按压 |
| `--c-page` | `#f9fafb` | `#faf5f1` | 页面暖米底 |
| `--c-card` | `#ffffff` | `#ffffff` | 卡片（不变） |
| `--c-hover` | `#f3f4f6` | `#f6ede7` | 按压态暖灰 |
| `--c-ink` | `#111827` | `#2c211c` | 主文字（暖近黑） |
| `--c-sub` | `#4b5563` | `#6e5b52` | 次要文字 |
| `--c-muted` | `#9ca3af` | `#b3a39a` | 弱文字/占位 |
| `--c-line` | `#f3f4f6` | `#f3e9e2` | 分隔线 |
| `--c-line-strong` | `#9ca3af` | `#d8c9c0` | 强描边 |
| `--c-danger` / `--c-danger-soft` | `#ef4444` / `#fef2f2` | 不变 | 功能性危险色，保持跨语义可辨识 |

### 3.2 深色模式（`.theme-dark` 组）

| 变量 | 新值 |
|------|------|
| `--c-primary` | `#f0684a`（深底上提亮的暖红） |
| `--c-primary-soft` | `#3a1e18` |
| `--c-primary-soft-text` | `#ff9a80` |
| `--c-page` | `#17120f` |
| `--c-card` | `#211a16` |
| `--c-hover` | `#2d241f` |
| `--c-ink` | `#f0e7e1` |
| `--c-sub` | `#b8a89e` |
| `--c-muted` | `#7d6e66` |
| `--c-line` | `#332a25` |
| `--c-line-strong` | `#5a4d46` |
| `--c-danger` / `--c-danger-soft` | `#f87171` / `#3b1d1d`（不变） |

### 3.3 主题显示名与 tabbar 选中色

- `src/store/theme.ts`：`THEME_BRAND_OPTIONS` 中 default 的 label `武协绿` → `公益红`；联合类型与 value（`'default' | 'blue'`）不变，持久化数据与现有单测不受影响。
- `src/tabbar/config.ts`：原生 tabbar 配置块的 `selectedColor` 由 `#018d71` 改为 `#d14328`（自定义 tabbar 以 CSS 变量着色，此处仅兜底一致）。

## 4. 信息架构与导航

### 4.1 底部 tab（自定义 tabbar，`src/tabbar/config.ts` 的 `customTabbarList`）

| 顺序 | 文案 | pagePath | 图标（carbon，最终以本地 @iconify-json/carbon 实际存在为准） | 角色 |
|------|------|----------|------|------|
| 1 | 首页 | `pages/index/index` | `i-carbon-home` | 所有人 |
| 2 | 活动 | `pages/activity/activity` | `i-carbon-calendar` | 所有人（新增） |
| 3 | 关于 | `pages/about/about` | `i-carbon-information` | 所有人（**删除现有 `roles: ['admin']`**） |
| 4 | 我的 | `pages/me/me` | `i-carbon-user` | 所有人 |

- 新增动态图标类名需加入 `uno.config.ts` 的 `safelist`（沿用本项目既有约定）：`i-carbon-calendar`、`i-carbon-information` 及五大入口图标（见 5.2）。
- `src/layouts/default.vue` 的 `PAGE_TITLES` 增加 `'/pages/activity/activity': '活动'`。
- 「我的」页与头部菜单中既有的「关于众爱联盟」入口保持不变。

### 4.2 页面清单

| 页面 | 路径 | 本轮动作 |
|------|------|----------|
| 首页 | `pages/index/index` | 整体重写 |
| 活动 | `pages/activity/activity` | 新增（占位页） |
| 关于 | `pages/about/about` | 整体重写（替换冒烟样例） |

## 5. 页面设计

所有页面沿用 `layouts/default.vue`（自定义头部导航 + 底部自定义 tabbar），内容区只写主体；颜色用语义类（`bg-page`/`bg-card`/`text-ink`/`text-sub`/`text-muted`/`border-line`/`bg-primary-soft`/`text-primary-soft-text` 等），间距与圆角风格对齐「我的」页现有卡片（`rounded-3`、`shadow-sm`、`px-3` 系）。

### 5.1 首页（品牌展示）

自上而下：

1. **使命 Banner**（圆角约 16r*4 的卡片，红色渐变 `linear-gradient(135deg, #ef6a45, #d14328 55%, #b92e17)`，白字）
   - 小字眉标：`众爱联盟 · ZHONG AI LIAN MENG`
   - 主标题（两行）：`一对一助力` / `困境学生安心学业`
   - 副文案：`承接爱心物资发送 · 弘扬传统文化` / `助力乡村振兴 · 关爱弱势群体`
   - 白色胶囊按钮「了解我们 ›」：`uni.switchTab` → `/pages/about/about`。
   - 装饰：右下角大号半透明「众」字水印（纯 CSS/伪元素或绝对定位文字，不新增图片资源）。
   - 渐变实现：在 `themes.scss` 同文件内新增可跟随主题的 CSS 变量（如 `--c-primary-gradient`，浅/深各一档），页面不写死色值；深色模式对应渐变 `linear-gradient(135deg, #f0684a, #d14328 60%, #b03a22)`（实现时按对比度微调，右端取深暖红）。
2. **信念条**（浅红底卡片，小字号）：`♥ 让每一份善意，一对一精准抵达需要的人`。心形用 carbon 图标 `i-carbon-favorite`（红色），不用 emoji。
3. **五大业务入口**（白色卡片，5 列等宽网格；图标 34px 方形容器、圆角 11px、浅暖底；文案 7.5px 级小字）：

   | 入口 | 语义 | 拟用 carbon 图标（实现时校验存在性，缺失则从同集合选近义） |
   |------|------|------|
   | 助学帮扶 | 一对一助学 | `i-carbon-education` |
   | 爱心物资 | 物资承接发送 | `i-carbon-delivery-parcel`（备选 `i-carbon-package`） |
   | 传统文化 | 文化弘扬 | `i-carbon-book`（备选 `i-carbon-tradition-chinese*` 若存在） |
   | 乡村振兴 | 乡村/农业发展 | `i-carbon-location-heart`（备选 `i-carbon-tree-view`） |
   | 关爱群体 | 老人儿童残弱 | `i-carbon-user-multiple`（备选 `i-carbon-heart`） |

   五个入口本轮均无落地页，点击统一 `uni.showToast({ title: '板块即将上线，敬请期待', icon: 'none' })`。入口数据在页面内以 `as const` 数组声明（key/label/icon），模板渲染。
4. **底部落款**：`仁心济世 · 善行天下`，弱化灰字、居中、字间距拉开。

### 5.2 活动页（样式化占位）

- 页面主体垂直水平居中：圆形浅红底图标（`i-carbon-event-schedule` 或 `i-carbon-calendar`，约 72px 圆）、标题「活动板块即将上线」、副文案「公益活动报名与志愿者招募正在筹备中」。
- `definePage` 标题「活动」；不请求任何接口。
- 属于 tabbar 页，正常渲染四 tab 底栏并高亮「活动」。

### 5.3 关于页

自上而下（内容在卡片内，卡片风格同「我的」页分组卡片）：

1. **品牌头部**：52px 红色渐变圆角方块，白色「众」字；下方名称「众爱联盟」与口号「仁心济世 · 善行天下」。
2. **组织简介卡**：
   > 众爱联盟是社会公益组织，以「一对一」结对帮扶为核心，助力困境学生安心学业；同时承接爱心物资发送，弘扬中华优秀传统文化，助力乡村振兴，关爱老人、儿童及贫困、孱弱、残疾人群。
3. **使命与愿景卡**：两个等宽浅红底子块横排 —— 使命「一对一助力困境学生安心学业」；愿景「让每一份善意精准抵达，让弱势群体被看见」。
4. **联系我们卡**：四行（图标 + 文案 + 右侧箭头位留空）：联系电话 / 联系地址 / 电子邮箱 / 微信公众号，值统一显示「待提供」且为 `text-muted`，整行不可点击。
   - 数据结构预留 `type`（phone/address/email/wechat）与 `value` 字段；未来提供真实信息后，点击行为：电话 → `uni.makePhoneCall`；邮箱 → `uni.setClipboardData`（小程序无统一邮件协议，复制邮箱最稳）；地址 → 复制；公众号 → 复制微信号/提示。首版 value 为空串时渲染「待提供」且不绑定点击。
5. **版本号**：底部「众爱联盟 v1.0.0」弱字。版本号暂硬编码，不接 manifest 读取。
- 删除现有关于页中全部 wot-ui 冒烟样例内容。

## 6. 组件与代码组织

- 本轮页面少、内容静态，**不新增公共组件**（YAGNI）；卡片、入口网格在各页面内以 UnoCSS 原子类实现。
- 页面内的静态数据（五大入口、联系方式、简介文案）以模块顶层 `const xxx = [...] as const` 声明并带 TS 类型，模板 `v-for` 渲染；后续接接口时替换数据来源即可。
- 不新增 store、不新增 API 模块、不新增请求。

## 7. 深色模式与跨端

- 所有颜色必须来自 UnoCSS 语义类或 `var(--c-*)`；Banner 渐变通过新增 CSS 变量跟随深浅模式；禁止在页面写死红/灰色值。
- 不使用条件编译差异逻辑：本轮页面 H5 与微信小程序表现一致（flex/grid 在目标端均可；如小程序端 grid 五列有兼容问题，降级为 `flex flex-wrap`，每项宽度 20%）。
- 图标全部用 carbon 图标类，经 safelist 保证动态类被生成；不使用 emoji 作为正式图标。
- 自定义导航栏高度/状态栏处理沿用 layout，不在页面重复处理。

## 8. 受影响文件清单

| 文件 | 改动 |
|------|------|
| `frontend/src/style/themes.scss` | 替换 default 品牌浅/深两组变量为公益红暖色体系；新增主色渐变变量（浅/深） |
| `frontend/src/store/theme.ts` | default 品牌 label 改「公益红」（1 行） |
| `frontend/src/tabbar/config.ts` | tabbar 列表新增活动项、关于去掉 roles、顺序调整；`selectedColor` 改红；同步 `nativeTabbarList`（保持与自定义列表一致，避免切换策略时遗漏） |
| `frontend/uno.config.ts` | safelist 增加活动/关于/五大入口使用的 carbon 图标类 |
| `frontend/src/layouts/default.vue` | `PAGE_TITLES` 增加活动页标题 |
| `frontend/src/pages/index/index.vue` | 整体重写 |
| `frontend/src/pages/activity/activity.vue` | 新增占位页 |
| `frontend/src/pages/about/about.vue` | 整体重写 |
| `frontend/src/pages/me/me.vue` | 无需改动（关于入口已存在；如移除「活动报名」开发中入口需另行确认，本轮不动） |

生成物：`src/pages.json` 等由 predev 钩子自动重新生成，不手改。

## 9. 验证计划

门禁（frontend 目录，PowerShell 用 `;` 串联）：

```powershell
bun run type-check
bun run lint
bun run test:run
```

- 现有单测：`theme.test.ts` 断言的是品牌 value 与 class，不受 label/换色影响；`tabbar/*` 测试为通用渲染测试。若 tabbar 配置数量被断言引用，则同步更新测试。
- 手动验证（H5，`bun run dev:h5`，http://localhost:3333）：
  1. 四个 tab 均可切换、高亮正确；游客可见「关于」与「活动」。
  2. 首页 Banner「了解我们」跳到关于 tab；五个入口点击均出 toast。
  3. 「我的 → 主题色」切到商务蓝再切回公益红，全站跟随；深色/浅色/跟随系统三档下首页与关于页均无对比度问题、无写死色残留。
  4. 关于页联系行显示「待提供」且不可点。
  5. 微信小程序构建（`bun run dev:mp`）页面与 grid 布局正常。

## 10. 后续待办（明确不在本轮）

- 组织提供真实联系方式后填充并启用点击行为。
- 五大业务二级页、活动列表/报名/招募、公益动态资讯流、公信力数据与公示。
- 内容改由后端可配（数据表 + API + 后台管理）时，再将页面静态数组替换为接口数据。
- Banner 如需真实照片主视觉，走项目 text_to_image 资源流程，本轮仅用纯色渐变 + 文字水印。
