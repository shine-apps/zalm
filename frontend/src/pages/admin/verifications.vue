<script lang="ts" setup>
// 图标 safelist 占位：i-carbon-certificate-check i-carbon-image i-carbon-play
import type { AdminVerificationView, VerificationKind, VerificationStatus } from '@/api/verification'
import { getAdminVerifications, reviewVerification } from '@/api/verification'
import { useAuthStore } from '@/store/auth'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: { navigationBarTitleText: '认证审核' },
})

const auth = useAuthStore()

// 守卫：未登录引导登录；非 admin 提示无权限并返回（最终鉴权以后端 requireAdmin 为准）
onLoad(() => {
  if (!auth.isLoggedIn) {
    toLoginPage()
    return
  }
  if (!auth.isAdmin) {
    uni.showToast({ title: '无权限访问', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 800)
  }
})

const KIND_LABEL: Record<VerificationKind, string> = {
  personal: '个人认证',
  enterprise: '企业认证',
}
const STATUS_LABEL: Record<VerificationStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
}
const STATUS_CLS: Record<VerificationStatus, string> = {
  pending: 'bg-hover text-sub',
  approved: 'bg-primary-soft text-primary-soft-text',
  rejected: 'bg-danger-soft text-danger',
}
const statusTabs: { label: string, value: VerificationStatus | '' }[] = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
  { label: '全部', value: '' },
]

// 用户填写 vs OCR 识别比对字段
const FIELD_KEYS: Record<VerificationKind, { key: string, label: string }[]> = {
  personal: [
    { key: 'realName', label: '真实姓名' },
    { key: 'idCardNumber', label: '身份证号' },
  ],
  enterprise: [
    { key: 'companyName', label: '企业名称' },
    { key: 'creditCode', label: '信用代码' },
    { key: 'legalPerson', label: '法定代表人' },
  ],
}

// —— 筛选 ——
const status = ref<VerificationStatus | ''>('pending')

function switchStatus(s: VerificationStatus | '') {
  if (status.value === s)
    return
  status.value = s
  load(true)
}

// —— 列表（加载更多 + 请求世代号防竞态） ——
const rows = ref<AdminVerificationView[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(false)
let seq = 0

async function load(reset = false) {
  if (!reset && loading.value)
    return
  if (reset) {
    page.value = 1
    rows.value = []
  }
  const requestSeq = ++seq
  const reqPage = page.value
  loading.value = true
  try {
    const res = await getAdminVerifications(reqPage, {
      ...(status.value ? { status: status.value } : {}),
    }, pageSize)
    if (requestSeq !== seq)
      return
    rows.value = reset ? res.data : [...rows.value, ...res.data]
    total.value = res.pagination.total
  }
  finally {
    if (requestSeq === seq)
      loading.value = false
  }
}

function more() {
  if (loading.value || rows.value.length >= total.value)
    return
  page.value += 1
  load()
}

onReachBottom(() => more())
onShow(() => load(true))

// —— 展示辅助 ——
function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function payloadText(row: AdminVerificationView, key: string) {
  return String(row.payload[key as keyof typeof row.payload] ?? '')
}

function ocrText(row: AdminVerificationView, key: string) {
  const v = row.ocrResult?.[key]
  return v == null ? '' : String(v)
}

function differs(row: AdminVerificationView, key: string) {
  const ocr = ocrText(row, key)
  return ocr !== '' && ocr !== payloadText(row, key)
}

function imageUrlsOf(row: AdminVerificationView) {
  return row.showcaseMedia.filter(m => m.type === 'image').map(m => m.url)
}

function previewImage(urls: string[], current: string) {
  uni.previewImage({ urls, current })
}

// —— 审核操作 ——
const reviewing = ref(false)
const rejectShow = ref(false)
const rejectReason = ref('')
const rejectTarget = ref<AdminVerificationView | null>(null)

async function approve(row: AdminVerificationView) {
  if (reviewing.value)
    return
  reviewing.value = true
  try {
    await reviewVerification(row.id, 'approve')
    uni.showToast({ title: '已通过', icon: 'success' })
    load(true)
  }
  catch {
    // alova 层已 toast（409 并发审核由后端 message 透出）
  }
  finally {
    reviewing.value = false
  }
}

function askReject(row: AdminVerificationView) {
  rejectTarget.value = row
  rejectReason.value = ''
  rejectShow.value = true
}

async function confirmReject() {
  const target = rejectTarget.value
  if (!target || reviewing.value)
    return
  if (!rejectReason.value.trim()) {
    uni.showToast({ title: '请填写驳回原因', icon: 'none' })
    return
  }
  reviewing.value = true
  try {
    await reviewVerification(target.id, 'reject', rejectReason.value.trim())
    uni.showToast({ title: '已驳回', icon: 'success' })
    rejectShow.value = false
    load(true)
  }
  catch {
    // alova 层已 toast
  }
  finally {
    reviewing.value = false
  }
}
</script>

<template>
  <view class="min-h-screen px-4 py-4">
    <!-- 状态筛选 -->
    <view class="mb-3 flex rounded-3 bg-card p-1 shadow-sm">
      <view
        v-for="tab in statusTabs"
        :key="tab.value"
        class="h-8 flex flex-1 items-center justify-center rounded-2 text-3.5"
        :class="status === tab.value ? 'bg-primary text-white font-medium' : 'text-sub'"
        @click="switchStatus(tab.value)"
      >
        {{ tab.label }}
      </view>
    </view>

    <!-- 加载中 / 空态 -->
    <view v-if="loading && rows.length === 0" class="py-20 text-center text-3.5 text-muted">
      加载中…
    </view>
    <view v-else-if="rows.length === 0" class="py-20 text-center text-3.5 text-muted">
      暂无{{ status ? STATUS_LABEL[status] : '' }}申请
    </view>

    <!-- 申请卡片 -->
    <view
      v-for="row in rows"
      :key="row.id"
      class="mb-3 rounded-3 bg-card p-4 shadow-sm"
    >
      <!-- 头部：申请人 + 状态 -->
      <view class="flex items-center justify-between">
        <view class="min-w-0 flex-1">
          <text class="text-4 text-ink font-medium">{{ row.applicant?.name ?? '—' }}</text>
          <text class="ml-2 text-3 text-sub">{{ KIND_LABEL[row.kind] }}</text>
        </view>
        <text class="rounded px-2 py-0.5 text-3" :class="STATUS_CLS[row.status]">
          {{ STATUS_LABEL[row.status] }}
        </text>
      </view>
      <view class="mt-1 text-3 text-muted">
        {{ row.applicant?.email ?? '' }} · {{ formatTime(row.createdAt) }}
      </view>

      <!-- 证件照 -->
      <view class="mt-3">
        <image
          :src="row.verificationImage"
          mode="widthFix"
          class="w-full rounded-2 bg-hover"
          @click="previewImage([row.verificationImage], row.verificationImage)"
        />
      </view>

      <!-- 用户填写 vs OCR 识别 -->
      <view class="mt-3 rounded-2 bg-page p-3">
        <view
          v-for="f in FIELD_KEYS[row.kind]"
          :key="f.key"
          class="flex items-start justify-between py-1 text-3.5"
        >
          <text class="w-16 shrink-0 text-muted">{{ f.label }}</text>
          <text class="flex-1 text-ink" :class="differs(row, f.key) ? 'text-danger font-medium' : ''">
            {{ payloadText(row, f.key) }}
          </text>
          <text v-if="row.ocrResult" class="ml-2 max-w-24 truncate text-3 text-sub">
            OCR: {{ ocrText(row, f.key) || '—' }}
          </text>
        </view>
        <view v-if="!row.ocrResult" class="pt-1 text-3 text-muted">
          无 OCR 识别记录（用户手动填写）
        </view>
      </view>

      <!-- 展示相册与介绍 -->
      <view v-if="row.showcaseMedia.length > 0" class="grid grid-cols-3 mt-3 gap-2">
        <template v-for="m in row.showcaseMedia" :key="m.url">
          <image
            v-if="m.type === 'image'"
            :src="m.url"
            mode="aspectFill"
            class="h-20 w-full rounded bg-hover"
            @click="previewImage(imageUrlsOf(row), m.url)"
          />
          <video
            v-else
            :src="m.url"
            :show-center-play-btn="true"
            class="h-20 w-full rounded bg-hover"
            object-fit="cover"
          />
        </template>
      </view>
      <view v-if="row.introduction" class="mt-3 rounded-2 bg-page p-3 text-3.5 text-ink leading-relaxed">
        {{ row.introduction }}
      </view>

      <!-- 驳回原因（已驳回时展示） -->
      <view
        v-if="row.status === 'rejected' && row.rejectReason"
        class="mt-3 rounded-2 bg-danger-soft px-3 py-2 text-3 text-danger"
      >
        驳回原因：{{ row.rejectReason }}
      </view>

      <!-- 操作 -->
      <view v-if="row.status === 'pending'" class="mt-3 flex gap-3">
        <wd-button size="small" custom-class="flex-1" :loading="reviewing" @click="approve(row)">
          通过
        </wd-button>
        <wd-button size="small" variant="soft" custom-class="flex-1" @click="askReject(row)">
          驳回
        </wd-button>
      </view>
    </view>

    <!-- 加载更多 -->
    <view v-if="rows.length > 0" class="py-4 text-center text-3 text-muted">
      <text v-if="loading">加载中…</text>
      <text v-else-if="rows.length >= total">没有更多了</text>
      <text v-else @click="more">点击加载更多</text>
    </view>

    <!-- 驳回原因弹层 -->
    <wd-popup v-model="rejectShow" position="bottom" round safe-area-inset-bottom>
      <view class="p-4">
        <view class="mb-3 text-4 text-ink font-medium">
          驳回 {{ rejectTarget?.applicant?.name ?? '' }} 的{{ rejectTarget ? KIND_LABEL[rejectTarget.kind] : '' }}
        </view>
        <wd-textarea
          v-model="rejectReason"
          :maxlength="500"
          show-word-limit
          placeholder="请填写驳回原因（将通知申请人）"
        />
        <view class="mt-4 flex gap-3">
          <wd-button size="small" variant="soft" custom-class="flex-1" @click="rejectShow = false">
            取消
          </wd-button>
          <wd-button size="small" custom-class="flex-1" :loading="reviewing" @click="confirmReject">
            确认驳回
          </wd-button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>
