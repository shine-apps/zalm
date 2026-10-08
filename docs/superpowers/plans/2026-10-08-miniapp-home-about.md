# 众爱联盟小程序 · 总台样式/首页/关于页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 frontend 工程视觉换为「暖心公益红」总台样式，并重写首页、新增活动占位页、重写关于页，底部导航变为 首页/活动/关于/我的 四 tab。

**Architecture:** 仅改 frontend。颜色全部走 `src/style/themes.scss` 的 CSS 变量（浅/深双轴），重定义 default 品牌变量值为公益红暖色体系；页面为纯静态内容（模块顶层 `as const` 数据 + 模板渲染），不接后端、不新增 store/API/公共组件。

**Tech Stack:** uniapp + Vue 3 `<script setup>` + TypeScript、UnoCSS 原子类（语义色映射 CSS 变量）、carbon 图标集（@iconify-json/carbon，经 safelist 保活）、wot-ui v2（经 themes.scss 的 bridge 自动跟随，不直接改动）。

**项目约束（必须遵守，与通用模板的偏差）：**

- 所有命令在 `frontend/` 目录、PowerShell 用 `;` 串联；包管理器只用 **bun**。
- **禁止自动 git commit**（仓库 AGENTS.md §11）：本计划不安排 commit 步骤；每个 Task 结束是「检查点」，由人工决定是否提交。
- 页面颜色只允许语义类 / `var(--c-*)`，禁止写死灰、红色值（Banner 渐变通过新增 CSS 变量实现）。
- 生成物 `src/pages.json` 不手改，由 predev/dev 钩子重新生成。
- 代码风格跟随现有文件：无分号、单引号、2 空格缩进。

设计文档：`docs/superpowers/specs/2026-10-08-miniapp-home-about-design.md`

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `frontend/src/style/themes.scss` | 全站主题变量唯一事实源 | 改：default 品牌浅/深变量换公益红；新增 `--c-primary-gradient` 浅/深两档 |
| `frontend/src/store/theme.ts` | 主题状态与品牌选项 | 改：default 品牌显示名「武协绿」→「公益红」 |
| `frontend/src/tabbar/config.ts` | tabbar 唯一配置源 | 改：自定义 tab 改四项（新增活动、关于公开）；`selectedColor` 改红 |
| `frontend/uno.config.ts` | UnoCSS 配置 | 改：safelist 增加新图标类 |
| `frontend/src/layouts/default.vue` | 自定义头部布局 | 改：`PAGE_TITLES` 增加活动页 |
| `frontend/src/pages/index/index.vue` | 首页 | 整体重写 |
| `frontend/src/pages/activity/activity.vue` | 活动占位页 | 新建 |
| `frontend/src/pages/about/about.vue` | 关于页 | 整体重写 |

已核实：计划中用到的 carbon 图标在本地 `@iconify-json/carbon` 均存在：`education / delivery-parcel / book / location-heart / user-multiple / favorite / calendar / event-schedule / information / phone / email / location / chat / home / user`。`tabbar/store.test.ts` 用 vi.mock 替换了 config，不受配置变更影响；`store/theme.test.ts` 只断言品牌 value（`default`/`blue`），改显示名不破坏测试。

---

### Task 1: 总台样式 —— themes.scss 换公益红暖色体系 + 渐变变量

**Files:**
- Modify: `frontend/src/style/themes.scss`（约 17-59 行的默认组与深色组）

- [ ] **Step 1: 替换浅色默认变量组**

把文件中现有的默认组：

```scss
/* —— 默认：浅色模式 + default 品牌（同时作为未挂 class 时的兜底值） —— */
:root,
page {
  --c-primary: #16a34a;
  --c-primary-soft: #f0fdf4;
  --c-primary-soft-text: #15803d;

  --c-page: #f9fafb;
  --c-card: #ffffff;
  --c-hover: #f3f4f6;

  --c-ink: #111827;
  --c-sub: #4b5563;
  --c-muted: #9ca3af;

  --c-line: #f3f4f6;
  --c-line-strong: #9ca3af;

  --c-danger: #ef4444;
  --c-danger-soft: #fef2f2;
}
```

整体替换为：

```scss
/* —— 默认：浅色模式 + default 品牌（暖心公益红 + 暖米底色，同时作为未挂 class 时的兜底值） —— */
:root,
page {
  --c-primary: #d14328;
  --c-primary-soft: #fdece5;
  --c-primary-soft-text: #b92e17;
  /* 首页使命 Banner / 品牌徽标用的红色渐变（深色组覆盖为提亮档） */
  --c-primary-gradient: linear-gradient(135deg, #ef6a45 0%, #d14328 55%, #b92e17 100%);

  --c-page: #faf5f1;
  --c-card: #ffffff;
  --c-hover: #f6ede7;

  --c-ink: #2c211c;
  --c-sub: #6e5b52;
  --c-muted: #b3a39a;

  --c-line: #f3e9e2;
  --c-line-strong: #d8c9c0;

  --c-danger: #ef4444;
  --c-danger-soft: #fef2f2;
}
```

- [ ] **Step 2: 替换深色模式变量组**

把现有的深色组：

```scss
/* —— 深色模式：只覆盖中性色，品牌主色也调亮以保证深底对比度 —— */
:root.theme-dark,
.theme-dark {
  --c-primary: #22c55e;
  --c-primary-soft: #14331f;
  --c-primary-soft-text: #4ade80;

  --c-page: #0f1115;
  --c-card: #1a1d24;
  --c-hover: #232730;

  --c-ink: #e7eaf0;
  --c-sub: #a7adba;
  --c-muted: #6b7280;

  --c-line: #2a2f3a;
  --c-line-strong: #4b5563;

  --c-danger: #f87171;
  --c-danger-soft: #3b1d1d;
}
```

整体替换为：

```scss
/* —— 深色模式：暖红调亮、中性色改暖深灰，保证深底对比度 —— */
:root.theme-dark,
.theme-dark {
  --c-primary: #f0684a;
  --c-primary-soft: #3a1e18;
  --c-primary-soft-text: #ff9a80;
  --c-primary-gradient: linear-gradient(135deg, #f0684a 0%, #d14328 60%, #b03a22 100%);

  --c-page: #17120f;
  --c-card: #211a16;
  --c-hover: #2d241f;

  --c-ink: #f0e7e1;
  --c-sub: #b8a89e;
  --c-muted: #7d6e66;

  --c-line: #332a25;
  --c-line-strong: #5a4d46;

  --c-danger: #f87171;
  --c-danger-soft: #3b1d1d;
}
```

- [ ] **Step 3: 检查文件其余部分无需改动**

确认 `brand-blue` 组（约 62-75 行）与 `wot-bridge-vars` mixin 及后续 bridge 选择器保持原样：bridge 右侧引用的都是 `var(--c-*)`，换值后 wot-ui 自动跟随。

- [ ] **检查点**

运行（在 `frontend/`）：

```powershell
bun run lint
```

期望：0 error（本任务只改 SCSS 变量值，不影响 lint 结论；若命令报与本文件无关的预存问题，记录但不在本任务扩散修改）。

---

### Task 2: 品牌显示名改为「公益红」

**Files:**
- Modify: `frontend/src/store/theme.ts:21-24`

- [ ] **Step 1: 修改选项 label**

把：

```ts
export const THEME_BRAND_OPTIONS: ReadonlyArray<{ value: ThemeBrand, label: string }> = [
  { value: 'default', label: '武协绿' },
  { value: 'blue', label: '商务蓝' },
]
```

改为：

```ts
export const THEME_BRAND_OPTIONS: ReadonlyArray<{ value: ThemeBrand, label: string }> = [
  { value: 'default', label: '公益红' },
  { value: 'blue', label: '商务蓝' },
]
```

注意：`ThemeBrand` 联合类型（`'default' | 'blue'`）与 value 不动，持久化数据与 `theme.test.ts` 均不受影响。

- [ ] **检查点**

```powershell
bun run test:run -- src/store/theme.test.ts
```

期望：theme store 用例全部 PASS（若该 CLI 形式不支持过滤，则先跳过，Task 9 跑全量）。

---

### Task 3: 底部导航改为 首页 / 活动 / 关于 / 我的

**Files:**
- Modify: `frontend/src/tabbar/config.ts`

- [ ] **Step 1: 替换 customTabbarList**

把从 `export const customTabbarList: CustomTabBarItem[] = [` 到其对应结束 `]`（当前文件约 43-110 行，含三段注释示例）的整段替换为：

```ts
export const customTabbarList: CustomTabBarItem[] = [
  {
    text: '首页',
    pagePath: 'pages/index/index',
    // 注意 unocss 图标需要如下处理：（二选一）
    // 1）在 fg-tabbar.vue 页面上引入一下并注释掉（见 tabbar/index.vue 代码第2行）
    // 2）配置到 uno.config.ts 的 safelist 中
    iconType: 'unocss',
    icon: 'i-carbon-home',
  },
  {
    text: '活动',
    pagePath: 'pages/activity/activity',
    iconType: 'unocss',
    icon: 'i-carbon-calendar',
  },
  {
    text: '关于',
    pagePath: 'pages/about/about',
    iconType: 'unocss',
    icon: 'i-carbon-information',
  },
  {
    text: '我的',
    pagePath: 'pages/me/me',
    iconType: 'unocss',
    icon: 'i-carbon-user',
  },
]
```

关键差异：新增「活动」项；「关于」删除 `roles: ['admin']`（对所有用户可见）；顺序为 首页 → 活动 → 关于 → 我的。

- [ ] **Step 2: tabbar 选中色改红**

把同文件 `_tabbar` 常量中的：

```ts
  selectedColor: '#018d71',
```

改为：

```ts
  selectedColor: '#d14328',
```

（自定义 tabbar 实际着色走 `tabbar/index.vue` 的 `var(--c-primary)`，此处仅保证切换到原生策略或兜底时颜色一致。）

- [ ] **Step 3: nativeTabbarList 保持不动（已确认的偏差）**

`nativeTabbarList`（当前仅首页/我的两项且引用 `static/tabbar/*.png`）**不修改**：当前策略常量是 `CUSTOM_TABBAR`，该列表不参与渲染；新增活动/关于没有对应 PNG 图标资源，强行同步会产生残缺配置。若未来切回原生策略，需先补齐四个 tab 的 PNG 再同步此表（已在 spec §10 精神内，不属本轮）。

- [ ] **检查点**

无独立命令；类型检查在 Task 9 统一执行。确认 `pages/activity/activity` 页面文件将在 Task 7 创建——在此之前不要运行依赖 pages.json 的小程序构建。

---

### Task 4: UnoCSS safelist 增加新图标

**Files:**
- Modify: `frontend/uno.config.ts:80-86`

- [ ] **Step 1: 扩充 safelist**

把：

```ts
  safelist: [
    'i-carbon-code',
    'i-carbon-home',
    'i-carbon-user',
    'i-carbon-ibm-watson-language-translator',
    'i-carbon-menu',
  ],
```

改为：

```ts
  safelist: [
    'i-carbon-code',
    'i-carbon-home',
    'i-carbon-user',
    'i-carbon-ibm-watson-language-translator',
    'i-carbon-menu',
    // 众爱联盟总台：tabbar / 首页 / 活动 / 关于 中经数据绑定渲染的图标
    'i-carbon-calendar',
    'i-carbon-information',
    'i-carbon-event-schedule',
    'i-carbon-favorite',
    'i-carbon-education',
    'i-carbon-delivery-parcel',
    'i-carbon-book',
    'i-carbon-location-heart',
    'i-carbon-user-multiple',
    'i-carbon-phone',
    'i-carbon-email',
    'i-carbon-location',
    'i-carbon-chat',
  ],
```

- [ ] **检查点**

无。图标类名已逐个在本地 `node_modules/@iconify-json/carbon/icons.json` 核实存在。

---

### Task 5: 布局标题表增加「活动」

**Files:**
- Modify: `frontend/src/layouts/default.vue:24-30`

- [ ] **Step 1: 修改 PAGE_TITLES**

把：

```ts
const PAGE_TITLES: Record<string, string> = {
  '/pages/index/index': '首页',
  '/pages/about/about': '关于',
  '/pages/login/index': '登录',
  '/pages/me/me': '我的',
  '/pages/me/profile': '个人信息',
}
```

改为：

```ts
const PAGE_TITLES: Record<string, string> = {
  '/pages/index/index': '首页',
  '/pages/activity/activity': '活动',
  '/pages/about/about': '关于',
  '/pages/login/index': '登录',
  '/pages/me/me': '我的',
  '/pages/me/profile': '个人信息',
}
```

- [ ] **检查点**

无。

---

### Task 6: 重写首页（品牌展示）

**Files:**
- Modify（整体覆盖）: `frontend/src/pages/index/index.vue`

- [ ] **Step 1: 用以下完整内容覆盖文件**

```vue
<script lang="ts" setup>
defineOptions({
  name: 'Home',
})
definePage({
  // 使用 type: "home" 属性设置首页，其他页面不需要设置，默认为page
  type: 'home',
  style: {
    navigationBarTitleText: '首页',
  },
})

/**
 * 五大业务入口。本轮均无落地页，点击统一提示「即将上线」；
 * 后续二级页就绪后，把 tap 行为换成 uni.navigateTo 即可。
 */
const entries = [
  { key: 'aiding', label: '助学帮扶', icon: 'i-carbon-education' },
  { key: 'supplies', label: '爱心物资', icon: 'i-carbon-delivery-parcel' },
  { key: 'culture', label: '传统文化', icon: 'i-carbon-book' },
  { key: 'village', label: '乡村振兴', icon: 'i-carbon-location-heart' },
  { key: 'care', label: '关爱群体', icon: 'i-carbon-user-multiple' },
] as const

/** Banner 主按钮：去关于 tab 了解组织 */
function goAbout() {
  uni.switchTab({ url: '/pages/about/about' })
}

/** 业务入口本期均未上线 */
function comingSoon() {
  uni.showToast({ title: '板块即将上线，敬请期待', icon: 'none' })
}
</script>

<template>
  <view class="min-h-screen bg-page px-3 py-3">
    <!-- 使命 Banner：渐变走主题变量，深浅色自动跟随 -->
    <view class="mission-banner relative overflow-hidden rounded-4 p-5">
      <!-- 右下角「众」字水印，纯文字装饰，不新增图片资源 -->
      <view
        class="pointer-events-none absolute -right-1 -bottom-6 font-bold text-white"
        style="font-size: 120rpx; opacity: 0.08"
      >
        众
      </view>

      <view class="text-3 tracking-widest text-white" style="opacity: 0.9">
        众爱联盟 · ZHONG AI LIAN MENG
      </view>
      <view class="mt-2 text-6 leading-8 font-bold text-white">
        一对一助力
        <br />
        困境学生安心学业
      </view>
      <view class="mt-2 text-3.5 leading-6 text-white" style="opacity: 0.85">
        承接爱心物资发送 · 弘扬传统文化
        <br />
        助力乡村振兴 · 关爱弱势群体
      </view>
      <view
        class="mt-4 inline-block rounded-full bg-white px-4 py-1.5 text-3.5 font-semibold text-primary-soft-text"
        @click="goAbout"
      >
        了解我们 ›
      </view>
    </view>

    <!-- 信念条 -->
    <view class="mt-3 flex items-center rounded-2 bg-primary-soft px-3 py-2.5">
      <view class="i-carbon-favorite mr-2 text-4 text-primary-soft-text" />
      <text class="text-3.5 text-primary-soft-text">
        让每一份善意，一对一精准抵达需要的人
      </text>
    </view>

    <!-- 五大业务入口：flex 五等宽，兼容小程序；点击均为占位提示 -->
    <view class="mt-3 flex rounded-3 bg-card py-4 shadow-sm">
      <view
        v-for="item in entries"
        :key="item.key"
        class="flex-1"
        @click="comingSoon"
      >
        <view class="flex flex-col items-center">
          <view class="h-40px w-40px center rounded-2 bg-primary-soft">
            <view :class="item.icon" class="text-20px text-primary-soft-text" />
          </view>
          <text class="mt-1.5 text-3.5 text-sub">
            {{ item.label }}
          </text>
        </view>
      </view>
    </view>

    <!-- 底部落款 -->
    <view class="mt-8 pb-4 text-center text-3 tracking-widest text-muted">
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

说明：
- 不使用 `wd-*` 组件，纯原子类 + 一个 scoped class 承载渐变；`text-white` 是「白色文字出现在主色渐变上」的固定语义，与 `me.vue` 现有用法一致。
- 白色文字透明度用内联 `opacity` 控制，避免裸 var 不支持 `/透明度` 修饰符的问题（见 uno.config.ts 注释）。
- 五等宽用 `flex` + `flex-1`，不用 `grid`/百分比宽度类，保证小程序端一致。

- [ ] **检查点**

无独立命令（Task 9 统一类型检查/lint）。

---

### Task 7: 新增活动占位页

**Files:**
- Create: `frontend/src/pages/activity/activity.vue`

- [ ] **Step 1: 创建页面文件，内容如下**

```vue
<script lang="ts" setup>
definePage({
  style: {
    navigationBarTitleText: '活动',
  },
})
</script>

<template>
  <view class="min-h-screen flex flex-col items-center justify-center bg-page px-6" style="padding-bottom: 80px">
    <view class="h-80px w-80px center rounded-full bg-primary-soft">
      <view class="i-carbon-event-schedule text-40px text-primary-soft-text" />
    </view>
    <view class="mt-5 text-5 font-semibold text-ink">
      活动板块即将上线
    </view>
    <view class="mt-2 text-3.5 text-muted">
      公益活动报名与志愿者招募正在筹备中
    </view>
  </view>
</template>
```

说明：`padding-bottom: 80px` 让视觉中心避开底部固定 tabbar；不请求任何接口；页面在 tabbar 配置中已注册（Task 3），底栏自动渲染并高亮「活动」。

- [ ] **检查点**

无。

---

### Task 8: 重写关于页

**Files:**
- Modify（整体覆盖）: `frontend/src/pages/about/about.vue`

- [ ] **Step 1: 用以下完整内容覆盖文件（删除全部 wot-ui 冒烟样例）**

```vue
<script lang="ts" setup>
definePage({
  style: {
    navigationBarTitleText: '关于',
  },
})

/** 使命与愿景（静态运营文案，后续可配化时迁移到接口） */
const mission = '一对一助力困境学生安心学业'
const vision = '让每一份善意精准抵达，让弱势群体被看见'

/**
 * 联系方式。value 为空串时渲染「待提供」且整行不可点。
 * 未来提供真实信息后的点击约定：
 * - phone：uni.makePhoneCall({ phoneNumber: value })
 * - email / address / wechat：uni.setClipboardData 复制后 toast 提示
 */
type ContactType = 'phone' | 'address' | 'email' | 'wechat'

interface ContactItem {
  type: ContactType
  label: string
  icon: string
  value: string
}

const contacts: ContactItem[] = [
  { type: 'phone', label: '联系电话', icon: 'i-carbon-phone', value: '' },
  { type: 'address', label: '联系地址', icon: 'i-carbon-location', value: '' },
  { type: 'email', label: '电子邮箱', icon: 'i-carbon-email', value: '' },
  { type: 'wechat', label: '微信公众号', icon: 'i-carbon-chat', value: '' },
]
</script>

<template>
  <view class="min-h-screen bg-page px-3 py-3">
    <!-- 品牌头部 -->
    <view class="flex flex-col items-center py-5">
      <view class="brand-badge h-60px w-60px center rounded-4 text-8 font-bold text-white">
        众
      </view>
      <view class="mt-3 text-6 font-bold text-ink">
        众爱联盟
      </view>
      <view class="mt-1 text-3.5 tracking-widest text-muted">
        仁心济世 · 善行天下
      </view>
    </view>

    <!-- 组织简介 -->
    <view class="rounded-3 bg-card p-4 shadow-sm">
      <view class="mb-2 flex items-center text-4.5 font-semibold text-ink">
        <view class="mr-2 h-12px w-3px rounded-full bg-primary" />
        组织简介
      </view>
      <text class="text-3.5 leading-7 text-sub">
        众爱联盟是社会公益组织，以「一对一」结对帮扶为核心，助力困境学生安心学业；同时承接爱心物资发送，弘扬中华优秀传统文化，助力乡村振兴，关爱老人、儿童及贫困、孱弱、残疾人群。
      </text>
    </view>

    <!-- 使命与愿景 -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <view class="mb-3 flex items-center text-4.5 font-semibold text-ink">
        <view class="mr-2 h-12px w-3px rounded-full bg-primary" />
        使命与愿景
      </view>
      <view class="flex gap-2">
        <view class="flex-1 rounded-2 bg-primary-soft p-3">
          <view class="text-3.5 font-semibold text-primary-soft-text">
            使命
          </view>
          <view class="mt-1.5 text-3.5 leading-6 text-sub">
            {{ mission }}
          </view>
        </view>
        <view class="flex-1 rounded-2 bg-primary-soft p-3">
          <view class="text-3.5 font-semibold text-primary-soft-text">
            愿景
          </view>
          <view class="mt-1.5 text-3.5 leading-6 text-sub">
            {{ vision }}
          </view>
        </view>
      </view>
    </view>

    <!-- 联系我们（信息未提供前均为「待提供」，不可点） -->
    <view class="mt-3 rounded-3 bg-card px-4 py-1 shadow-sm">
      <view
        v-for="(item, index) in contacts"
        :key="item.type"
        class="flex items-center py-3"
        :class="index > 0 ? 'border-t border-line' : ''"
      >
        <view class="h-8 w-8 center rounded-lg bg-primary-soft">
          <view :class="item.icon" class="text-4 text-primary-soft-text" />
        </view>
        <text class="ml-3 text-4 text-sub">
          {{ item.label }}
        </text>
        <text class="ml-auto text-3.5 text-muted">
          {{ item.value || '待提供' }}
        </text>
      </view>
    </view>

    <!-- 版本号 -->
    <view class="py-5 text-center text-3 text-muted">
      众爱联盟 v1.0.0
    </view>
  </view>
</template>

<style scoped lang="scss">
.brand-badge {
  background: var(--c-primary-gradient);
}
</style>
```

- [ ] **检查点**

无。

---

### Task 9: 质量门禁与手动验证

**Files:** 无新增改动（如门禁报错，回到对应 Task 修复）。

- [ ] **Step 1: 重新生成 pages.json 并启动 H5**

在 `frontend/` 运行：

```powershell
bun run dev:h5
```

期望：启动成功（http://localhost:3333），准备阶段生成的 `src/pages.json` 中包含 `pages/activity/activity`，tabBar list 为四项。用 grep 或直接在浏览器网络面板确认；**不要手改 src/pages.json**。启动成功后保持 dev server 运行供后续手动验证。

- [ ] **Step 2: 静态门禁三连**

另开一个终端，在 `frontend/` 运行：

```powershell
bun run type-check; bun run lint; bun run test:run
```

期望：type-check 0 error；lint 0 error（warning 可接受）；vitest 全部 PASS（含 theme.test.ts、tabbar/* 全部既有用例）。

若 type-check 报 TS2688（找不到 `src/types/*.d.ts`），按仓库 AGENTS.md §10 的说明处理：该目录生成物被 gitignore，放置仅含 `export {}` 的占位文件后重跑（build/dev 会覆盖为真实内容）。

- [ ] **Step 3: H5 手动验证（浏览器 http://localhost:3333）**

逐项验证：

1. 首屏为暖米底 + 红色渐变 Banner；底部四个 tab：首页 / 活动 / 关于 / 我的，选中态为公益红。
2. 四个 tab 互相切换正常、高亮跟随；**游客（未登录）可见「活动」与「关于」**。
3. 首页点「了解我们」→ switchTab 到关于页；五个业务入口各点一次 → 均弹出「板块即将上线，敬请期待」。
4. 关于页：品牌徽标红色渐变；简介/使命愿景/联系方式四卡片齐全；四行联系信息均显示「待提供」且点击无反应；底部版本号 `众爱联盟 v1.0.0`。
5. 活动页：圆形浅红图标 + 「活动板块即将上线」+ 副文案，底栏高亮「活动」。
6. 主题跟随：「我的 → 外观模式」切深色/浅色/跟随系统，首页与关于页均正常（Banner 渐变变深档、文字可读、无白底残留）；「主题色」切「商务蓝」全站变蓝、切回「公益红」全站变红。
7. 「我的」页既有功能（资料卡、菜单、登出）视觉随新暖色体系正常，无回归。

- [ ] **Step 4: 小程序端构建冒烟（条件允许时）**

```powershell
bun run dev:mp
```

期望：构建成功无报错；在微信开发者工具中检查：首页五等分入口不换行错位、Banner 渐变与水印正常、自定义 tabbar 四项正常（若环境不具备，记录为待验证项并在交付说明中注明）。

- [ ] **Step 5: 交付汇总**

向需求方汇报：改动文件清单、门禁结果、手动验证结果、待办（真实联系方式、活动/业务二级页、内容接口化）。停止 brainstorming 可视化服务器（如仍在运行）。**不执行 git commit；如需提交由用户明确指示。**

---

## Self-Review 记录

- **Spec 覆盖**：spec §3 主题换色（Task 1）、§3.3 显示名与选中色（Task 2/3）、§4.1 四 tab 与关于公开（Task 3）、safelist（Task 4）、PAGE_TITLES（Task 5）、§5.1 首页（Task 6）、§5.2 活动页（Task 7）、§5.3 关于页含联系方式占位与数据结构预留（Task 8）、§9 门禁与手动验证（Task 9）；spec §4.1 nativeTabbarList 同步一项在 Task 3 Step 3 明确为「不动」并记录理由（缺 PNG 资源、当前 CUSTOM 策略不渲染）。
- **占位扫描**：无 TBD/TODO；所有代码步骤均给完整代码；联系方式的「待提供」是产品文案而非计划占位。
- **类型一致**：首页 `entries` 的 key/label/icon 与模板 `item.key/item.label/item.icon` 一致；关于页 `ContactItem.type/label/icon/value` 与模板一致；tabbar pagePath `pages/activity/activity` 与 Task 7 文件路径、Task 5 标题表键 `/pages/activity/activity` 三处一致；渐变变量名 `--c-primary-gradient` 在 Task 1（浅/深各一声明）与 Task 6/8 的 scoped SCSS 中拼写一致。
