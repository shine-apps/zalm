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
