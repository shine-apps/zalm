<script lang="ts" setup>
import type { ActivityCategory, ActivityPayload } from '@/api/activity'
import type { MediaItem } from '@/api/media'
import type { ActivityTemplate, ActivityTemplateSummary } from '@/api/activity-template'
import { getActivityTemplate, listActivityTemplates } from '@/api/activity-template'
import { ACTIVITY_CATEGORIES, createActivity, getActivity, updateActivity } from '@/api/activity'
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
  categories: [] as ActivityCategory[],
  startTs: 0,
  endTs: 0,
  hasDeadline: false,
  deadlineTs: 0,
  capacityText: '',
  pointsText: '0',
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
  markPristine()
})

// —— 活动模板（仅新建模式）：选用后把模板已预设的字段并入表单，缺失项保持当前值 ——
const templatePanelShow = ref(false)
const templateLoading = ref(false)
const templateListLoaded = ref(false)
const templateList = ref<ActivityTemplateSummary[]>([])
const selectedTemplate = ref<ActivityTemplateSummary | null>(null)
/** 表单快照：用于判断切换模板前用户是否已手动改过内容。 */
let pristineSnapshot = ''

function markPristine() {
  pristineSnapshot = JSON.stringify(form.value)
}

function isFormPristine() {
  return JSON.stringify(form.value) === pristineSnapshot
}

async function openTemplatePanel() {
  templatePanelShow.value = true
  if (!templateListLoaded.value)
    await loadTemplates()
}

async function loadTemplates() {
  templateLoading.value = true
  try {
    templateList.value = await listActivityTemplates()
    templateListLoaded.value = true
  }
  catch {
    // 拦截器已提示
  }
  finally {
    templateLoading.value = false
  }
}

function chooseNoTemplate() {
  selectedTemplate.value = null
  templatePanelShow.value = false
}

function clearTemplate() {
  // 只解除模板关联，不清空已填入表单的内容
  selectedTemplate.value = null
}

function pickTemplate(t: ActivityTemplateSummary) {
  if (selectedTemplate.value?.id === t.id) {
    templatePanelShow.value = false
    return
  }
  if (isFormPristine()) {
    void applyTemplate(t)
    return
  }
  uni.showModal({
    title: '套用模板',
    content: '套用模板将覆盖当前已填写的内容，确定继续吗？',
    confirmText: '覆盖填写',
    success: (res) => {
      if (res.confirm)
        void applyTemplate(t)
    },
  })
}

async function applyTemplate(t: ActivityTemplateSummary) {
  try {
    const detail = await getActivityTemplate(t.id)
    mergeTemplateIntoForm(detail)
    selectedTemplate.value = t
    templatePanelShow.value = false
    markPristine()
  }
  catch {
    // 拦截器已提示
  }
}

function mergeTemplateIntoForm(t: ActivityTemplate) {
  if (t.title)
    form.value.title = t.title
  form.value.description = t.description ?? ''
  if (t.coverUrl)
    form.value.coverUrl = t.coverUrl
  if (t.location)
    form.value.location = { ...t.location }
  if (t.categories.length)
    form.value.categories = [...t.categories]
  if (t.startTime)
    form.value.startTs = new Date(t.startTime).getTime()
  if (t.endTime)
    form.value.endTs = new Date(t.endTime).getTime()
  if (t.registerDeadline) {
    form.value.hasDeadline = true
    form.value.deadlineTs = new Date(t.registerDeadline).getTime()
  }
  form.value.capacityText = t.capacity === null ? '' : String(t.capacity)
  if (t.points !== null)
    form.value.pointsText = String(t.points)
}

async function prefill(id: string) {
  try {
    const a = await getActivity(id)
    form.value.title = a.title
    form.value.description = a.description
    form.value.coverUrl = a.coverUrl ?? ''
    form.value.categories = [...a.categories]
    form.value.startTs = new Date(a.startTime).getTime()
    form.value.endTs = new Date(a.endTime).getTime()
    form.value.hasDeadline = !!a.registerDeadline
    form.value.deadlineTs = a.registerDeadline
      ? new Date(a.registerDeadline).getTime()
      : form.value.startTs
    form.value.capacityText = a.capacity === null ? '' : String(a.capacity)
    form.value.pointsText = String(a.points ?? 0)
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
  // 空数组守卫：reset() 换新空数组会再次触发 change，防止对 [] 重复 reset 失控循环
  if (!items.length)
    return
  const file = items[0]
  if (file?.status === 'done') {
    form.value.coverUrl = file.url
    coverUploader.value?.reset()
  }
  else if (file?.status === 'error') {
    // bare 模式没有重试 UI，清掉失败占位，允许重新选择封面
    coverUploader.value?.reset()
  }
}

function removeCover() {
  form.value.coverUrl = ''
}

// —— 活动分类（多选 toggle）——
function toggleCategory(c: ActivityCategory) {
  const list = form.value.categories
  const i = list.indexOf(c)
  if (i >= 0)
    list.splice(i, 1)
  else
    list.push(c)
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
  // 先处理失败分支：写入 form.value（ref getter）会让 TS 失效化此前的判别收窄
  if (result.ok === false) {
    if (!result.cancelled)
      uni.showToast({ title: result.message, icon: 'none' })
    return
  }
  form.value.location = result.location
}

// —— 校验（与后端 Zod 规则对齐；错误先在前端拦一道）——
function validate(): string | null {
  const f = form.value
  const title = f.title.trim()
  if (title.length < 2 || title.length > 50)
    return '标题需 2~50 个字'
  if (f.categories.length === 0)
    return '请至少选择一个活动分类'
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
  const points = Number(f.pointsText)
  if (!Number.isInteger(points) || points < 0 || points > 9999)
    return '参与积分需为 0~9999 的整数'
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
  const points = Number(f.pointsText) || 0
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
    categories: [...f.categories],
    startTime: new Date(f.startTs).toISOString(),
    endTime: new Date(f.endTs).toISOString(),
    registerDeadline: f.hasDeadline ? new Date(f.deadlineTs).toISOString() : null,
    capacity: f.capacityText.trim() === '' ? null : Number(f.capacityText),
    points,
  }
}

// —— 相册管理（仅编辑模式：新活动尚无 id）——
function goMedia() {
  uni.navigateTo({ url: `/pages/activity/media?id=${editingId.value}` })
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
    <!-- 活动模板（仅新建模式） -->
    <view v-if="!editingId" class="rounded-3 bg-card p-4 shadow-sm">
      <view class="flex items-center">
        <text class="text-4 text-ink font-medium">活动模板</text>
        <view v-if="selectedTemplate" class="ml-auto flex items-center text-3.5">
          <text class="text-primary-soft-text mr-3" @click="openTemplatePanel">重新选择</text>
          <text class="text-muted" @click="clearTemplate">清除</text>
        </view>
      </view>
      <view
        class="mt-3 flex items-center rounded-2 bg-hover px-3 py-2.5"
        @click="openTemplatePanel"
      >
        <template v-if="selectedTemplate">
          <view class="i-carbon-template mr-2 shrink-0 text-16px text-primary" />
          <view class="min-w-0 flex-1">
            <text class="block text-4 text-ink">{{ selectedTemplate.name }}</text>
            <view v-if="selectedTemplate.categories.length" class="mt-1 flex flex-wrap">
              <text
                v-for="c in selectedTemplate.categories"
                :key="c"
                class="text-primary-soft-text mr-1 rounded bg-primary-soft px-1.5 py-0.5 text-2.5"
              >
                {{ c }}
              </text>
            </view>
          </view>
        </template>
        <template v-else>
          <view class="i-carbon-template mr-2 shrink-0 text-16px text-muted" />
          <text class="flex-1 text-3.5 text-muted">点击选择模板，自动填充常用信息（时间仍需自行确认）</text>
        </template>
        <view class="i-carbon-chevron-right ml-2 shrink-0 text-4 text-muted" />
      </view>
    </view>

    <!-- 标题 -->
    <view class="rounded-3 bg-card p-4 shadow-sm" :class="{ 'mt-3': !editingId }">
      <text class="text-4 text-ink font-medium">活动标题</text>
      <input
        v-model="form.title"
        :maxlength="50"
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
          class="h-140px w-220px center flex-col border border-line-strong rounded-2 border-dashed"
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
      <!-- 上传前先按 16:9 裁剪 -->
      <media-uploader ref="coverUploader" type="image" bare crop-aspect="16:9" @change="onCoverChange" />
    </view>

    <!-- 活动分类（必选，可多选） -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <view class="flex items-center">
        <text class="text-4 text-ink font-medium">活动分类</text>
        <text v-if="form.categories.length" class="ml-auto text-3 text-muted">
          已选 {{ form.categories.length }}/{{ ACTIVITY_CATEGORIES.length }}
        </text>
      </view>
      <text class="mt-0.5 block text-3 text-muted">必选，可多选</text>
      <view class="mt-3 flex flex-wrap">
        <view
          v-for="c in ACTIVITY_CATEGORIES"
          :key="c"
          class="mb-2 mr-2 rounded-full px-3 py-1.5 text-3.5"
          :class="form.categories.includes(c) ? 'bg-primary text-white' : 'bg-hover text-sub'"
          @click="toggleCategory(c)"
        >
          {{ c }}
        </view>
      </view>
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
      <view class="flex items-center border-t border-line px-4 py-3.5">
        <text class="text-4 text-sub">参与积分</text>
        <input
          v-model="form.pointsText"
          type="number"
          placeholder="签到可得积分，0 表示不计分"
          class="ml-auto h-32px w-220px rounded-2 bg-hover px-3 text-right text-4 text-ink"
        >
      </view>
    </view>

    <!-- 位置 -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <view class="flex items-center">
        <text class="text-4 text-ink font-medium">活动地点</text>
        <view
          class="text-primary-soft-text ml-auto flex items-center rounded-full bg-primary-soft px-3 py-1.5 text-3.5"
          @click="chooseOnMap"
        >
          <view class="i-carbon-location mr-1 text-14px" /> 地图选点
        </view>
      </view>
      <input
        v-model="form.location.name"
        :maxlength="100"
        placeholder="地点名称（必填）"
        class="mt-3 h-40px rounded-2 bg-hover px-3 text-4 text-ink"
      >
      <input
        v-model="form.location.address"
        :maxlength="200"
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
        :maxlength="2000"
        placeholder="介绍活动内容、注意事项等（不超过 2000 字）"
        class="mt-2 h-200px w-full rounded-2 bg-hover p-3 text-4 text-ink"
      />
    </view>

    <!-- 相册管理入口（编辑模式） -->
    <view
      v-if="editingId"
      class="mt-4 flex items-center rounded-3 bg-card p-4 shadow-sm"
      @click="goMedia"
    >
      <view class="i-carbon-image text-16px text-muted" />
      <text class="ml-2 text-4 text-ink">管理活动相册</text>
      <text class="ml-auto text-3 text-muted">照片 / 视频</text>
      <view class="i-carbon-chevron-right ml-2 text-16px text-muted" />
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

    <!-- 活动模板选择面板（仅新建模式） -->
    <wd-popup
      v-if="!editingId"
      v-model="templatePanelShow"
      position="bottom"
      round
      safe-area-inset-bottom
    >
      <view class="max-h-[70vh] flex flex-col">
        <view class="flex items-center px-4 pt-4">
          <text class="text-4 text-ink font-medium">选择活动模板</text>
          <view
            class="i-carbon-close ml-auto text-18px text-muted"
            @click="templatePanelShow = false"
          />
        </view>
        <scroll-view scroll-y class="mt-2 px-3 pb-3" style="max-height: 56vh">
          <!-- 空白创建 -->
          <view
            class="mb-2 flex items-center rounded-2 bg-hover p-3"
            @click="chooseNoTemplate"
          >
            <view class="i-carbon-document-blank mr-2 text-16px text-muted" />
            <text class="flex-1 text-4 text-ink">不使用模板（空白创建）</text>
            <view
              v-if="!selectedTemplate"
              class="i-carbon-checkmark text-18px text-primary"
            />
          </view>

          <view v-if="templateLoading" class="py-8 text-center text-3.5 text-muted">
            加载中…
          </view>
          <view
            v-else-if="!templateList.length"
            class="px-2 py-8 text-center text-3.5 text-muted leading-6"
          >
            暂无模板
            <text class="block">可在活动详情页把已有活动「存为模板」</text>
          </view>

          <view
            v-for="t in templateList"
            :key="t.id"
            class="mb-2 rounded-2 bg-hover p-3"
            @click="pickTemplate(t)"
          >
            <view class="flex items-center">
              <text class="text-4 text-ink font-medium">{{ t.name }}</text>
              <view
                v-if="selectedTemplate?.id === t.id"
                class="i-carbon-checkmark ml-auto text-18px text-primary"
              />
            </view>
            <text v-if="t.title" class="mt-1 block text-3 text-sub">
              标题：{{ t.title }}
            </text>
            <view v-if="t.categories.length" class="mt-1.5 flex flex-wrap">
              <text
                v-for="c in t.categories"
                :key="c"
                class="text-primary-soft-text mb-1 mr-1 rounded bg-primary-soft px-1.5 py-0.5 text-2.5"
              >
                {{ c }}
              </text>
            </view>
          </view>
        </scroll-view>
      </view>
    </wd-popup>
  </view>
</template>
