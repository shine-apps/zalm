<script lang="ts" setup>
import type { ActivityMediaItem, ActivityView } from '@/api/activity'
import {
  cancelActivity as cancelActivityApi,
  cancelMyRegistration,
  getActivity,
  registerToActivity,
} from '@/api/activity'
import { createTemplateFromActivity } from '@/api/activity-template'
import { resolveMediaUrl } from '@/api/profile'
import { useShare } from '@/share/useShare'
import { useAuthStore } from '@/store/auth'
import { formatDateTime, formatTimeRange } from '@/utils/datetime'
import { openActivityNavigation } from '@/utils/location'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: {
    navigationBarTitleText: '活动详情',
  },
})

const auth = useAuthStore()
const activityId = ref('')
const detail = ref<ActivityView | null>(null)
const loading = ref(false)
const acting = ref(false)

const myReg = computed(() => detail.value?.myRegistration ?? null)
const isCancelled = computed(() => detail.value?.state === 'cancelled')
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null

/** 客户端仅做按钮置灰，最终规则以后端 409 message 为准。 */
const registerClosedReason = computed<string | null>(() => {
  const a = detail.value
  if (!a || a.status !== 'published')
    return null
  if (a.state === 'ended')
    return '活动已结束'
  if (a.remaining === 0)
    return '名额已满'
  const deadline = a.registerDeadline ?? a.startTime
  if (now.value >= new Date(deadline).getTime())
    return '报名已截止'
  return null
})
const canCancelReg = computed(() =>
  myReg.value?.status === 'registered'
  && !!detail.value
  && now.value < new Date(detail.value.startTime).getTime(),
)

/** 分享标题后的活动状态标签；依赖 now，报名截止后自动切换。 */
const shareStateLabel = computed(() => {
  const a = detail.value
  if (!a)
    return ''
  if (a.state === 'cancelled' || a.status === 'cancelled')
    return '已取消'
  if (a.state === 'ended')
    return '已结束'
  if (a.state === 'ongoing')
    return '进行中'
  if (a.remaining === 0)
    return '名额已满'
  const deadline = a.registerDeadline ?? a.startTime
  if (now.value >= new Date(deadline).getTime())
    return '报名已截止'
  return '招募中'
})

async function load() {
  if (!activityId.value)
    return
  loading.value = true
  try {
    detail.value = await getActivity(activityId.value)
  }
  finally {
    loading.value = false
  }
}

function ensureLogin(): boolean {
  if (auth.isLoggedIn)
    return true
  toLoginPage()
  return false
}

/** 昵称缺失/为手机号格式（OTP 自动注册场景）时需先完善资料。 */
const needsProfileFix = computed(() => {
  const user = auth.user
  if (!user)
    return false
  const name = (user.name || '').trim()
  if (!name)
    return true
  if (name === user.phoneNumber)
    return true
  if (/^1\d{10}$/.test(name))
    return true
  return false
})

const profilePopupVisible = ref(false)

function doRegister() {
  if (!ensureLogin() || !detail.value)
    return

  // 资料不完善时先弹资料完善窗，保存成功后再继续报名
  if (needsProfileFix.value) {
    profilePopupVisible.value = true
    return
  }

  confirmRegister()
}

function confirmRegister() {
  if (!detail.value)
    return
  const a = detail.value
  uni.showModal({
    title: '确认报名',
    content: `${formatTimeRange(a.startTime, a.endTime)}\n${a.location.name}`,
    confirmText: '确认报名',
    success: (res) => {
      if (!res.confirm)
        return
      void submitRegister()
    },
  })
}

function onProfileConfirmed() {
  // 资料保存成功后继续报名
  confirmRegister()
}

async function submitRegister() {
  if (acting.value)
    return
  acting.value = true
  try {
    await registerToActivity(activityId.value)
    uni.showToast({ title: '报名成功', icon: 'success' })
    await load()
  }
  catch {
    // 409/422 message 已由拦截器 toast
  }
  finally {
    acting.value = false
  }
}

function doCancelRegistration() {
  uni.showModal({
    title: '取消报名',
    content: '确定取消本次活动报名吗？',
    confirmText: '取消报名',
    success: (res) => {
      if (!res.confirm)
        return
      void submitCancelRegistration()
    },
  })
}

async function submitCancelRegistration() {
  if (acting.value)
    return
  acting.value = true
  try {
    await cancelMyRegistration(activityId.value)
    uni.showToast({ title: '已取消报名', icon: 'none' })
    await load()
  }
  catch {
    // 拦截器已提示
  }
  finally {
    acting.value = false
  }
}

function goCheckIn() {
  if (!ensureLogin())
    return
  uni.navigateTo({ url: `/pages/activity/checkin?a=${activityId.value}` })
}

// —— 组织者动作 ——
function goEdit() {
  uni.navigateTo({ url: `/pages/activity/edit?id=${activityId.value}` })
}

function goCode() {
  uni.navigateTo({ url: `/pages/activity/checkin-code?id=${activityId.value}` })
}

function goRegistrations() {
  uni.navigateTo({ url: `/pages/activity/registrations?id=${activityId.value}` })
}

function goMedia() {
  uni.navigateTo({ url: `/pages/activity/media?id=${activityId.value}` })
}

/** 组织者把当前活动存为模板：只复制非排期字段，时间留空、相册不带入。 */
function saveAsTemplate() {
  if (!detail.value)
    return
  const fallbackName = detail.value.title
  uni.showModal({
    title: '存为活动模板',
    content: '将复制标题、分类、详情、封面、地点、人数上限、积分；活动时间不会保存。',
    editable: true,
    placeholderText: `模板名称，留空则用活动标题「${fallbackName}」`,
    confirmText: '保存模板',
    success: (res) => {
      if (!res.confirm)
        return
      const name = (res.content ?? '').trim() || fallbackName
      if (name.length < 2 || name.length > 30) {
        uni.showToast({ title: '模板名称需 2~30 个字', icon: 'none' })
        return
      }
      void submitSaveAsTemplate(name)
    },
  })
}

async function submitSaveAsTemplate(name: string) {
  if (acting.value)
    return
  acting.value = true
  uni.showLoading({ title: '保存中', mask: true })
  try {
    await createTemplateFromActivity(activityId.value, name)
    uni.showToast({ title: '已存为模板', icon: 'success' })
  }
  catch {
    // 拦截器已提示
  }
  finally {
    acting.value = false
    uni.hideLoading()
  }
}

function doCancelActivity() {
  uni.showModal({
    title: '取消活动',
    content: '活动取消后不可恢复，已报名用户需自行知悉。确定取消该活动吗？',
    confirmText: '确认取消',
    confirmColor: '#ef4444',
    success: (res) => {
      if (!res.confirm)
        return
      void submitCancelActivity()
    },
  })
}

async function submitCancelActivity() {
  if (acting.value)
    return
  acting.value = true
  try {
    await cancelActivityApi(activityId.value)
    uni.showToast({ title: '活动已取消', icon: 'none' })
    await load()
  }
  catch {
    // 拦截器已提示
  }
  finally {
    acting.value = false
  }
}

// —— 活动相册 ——
const GALLERY_PREVIEW_LIMIT = 12
const galleryExpanded = ref(false)
const playingVideo = ref<ActivityMediaItem | null>(null)

const galleryImages = computed(() =>
  (detail.value?.media ?? []).filter(m => m.type === 'image'),
)
const galleryShown = computed(() => {
  const list = detail.value?.media ?? []
  return galleryExpanded.value ? list : list.slice(0, GALLERY_PREVIEW_LIMIT)
})

function previewImage(current: ActivityMediaItem) {
  uni.previewImage({
    urls: galleryImages.value.map(m => resolveMediaUrl(m.url)),
    current: resolveMediaUrl(current.url),
  })
}

function closeVideo() {
  playingVideo.value = null
}

function formatDuration(seconds?: number): string {
  if (!seconds)
    return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const progressPercent = computed(() => {
  const a = detail.value
  if (!a || a.capacity === null || a.capacity <= 0)
    return a?.capacity === null ? 0 : 0
  return Math.min(100, Math.round((a.registeredCount / a.capacity) * 100))
})

// —— 分享（小程序 onShareAppMessage/onShareTimeline + H5 分享面板）——
const {
  show: shareShow,
  payload: sharePayload,
  panelId: sharePanelId,
  openShare,
} = useShare(() => ({
  title: detail.value ? `${detail.value.title}【${shareStateLabel.value}】` : '活动详情',
  desc: detail.value
    ? `${formatTimeRange(detail.value.startTime, detail.value.endTime)} · ${detail.value.location.name}`
    : '',
  page: '/pages/activity/detail',
  query: activityId.value ? { id: activityId.value } : {},
  imageUrl: detail.value?.coverUrl,
  targetType: 'activity',
  targetId: activityId.value || undefined,
}))

onLoad((options) => {
  activityId.value = options?.id ?? ''
  void load()
})

onShow(() => {
  // 从编辑/签到页返回时刷新
  void load()
  nowTimer = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
})

onHide(() => {
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
})

onUnload(() => {
  if (nowTimer)
    clearInterval(nowTimer)
})
</script>

<template>
  <view class="min-h-screen bg-page" style="padding-bottom: 140px">
    <view v-if="detail">
      <!-- 取消提示条 -->
      <view v-if="isCancelled" class="bg-danger-soft px-4 py-2 text-3.5 text-danger">
        该活动已取消，报名与签到已关闭
      </view>

      <!-- 封面 -->
      <image
        v-if="detail.coverUrl"
        :src="resolveMediaUrl(detail.coverUrl)"
        mode="widthFix"
        class="w-full bg-hover"
      />

      <view class="px-3 pt-3">
        <!-- 标题与时间 -->
        <view class="rounded-3 bg-card p-4 shadow-sm">
          <view class="flex items-start">
            <text class="flex-1 text-5 text-ink font-semibold leading-7">
              {{ detail.title }}
            </text>
            <view
              class="ml-3 mt-0.5 h-32px w-32px flex shrink-0 items-center justify-center rounded-full bg-hover text-muted"
              @click="openShare"
            >
              <view class="i-carbon-share text-18px" />
            </view>
          </view>
          <view v-if="detail.categories.length" class="mt-2 flex flex-wrap">
            <text
              v-for="c in detail.categories"
              :key="c"
              class="text-primary-soft-text mr-1.5 rounded bg-primary-soft px-2 py-0.5 text-3"
            >
              {{ c }}
            </text>
          </view>
          <view class="mt-3 flex items-start">
            <view class="i-carbon-time mt-0.5 text-16px text-muted" />
            <view class="ml-2">
              <text class="block text-3.5 text-sub">{{ formatTimeRange(detail.startTime, detail.endTime) }}</text>
              <text class="mt-1 block text-3 text-muted">
                报名截止：{{ detail.registerDeadline ? formatDateTime(detail.registerDeadline) : '活动开始前' }}
              </text>
            </view>
          </view>
        </view>

        <!-- 位置 -->
        <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
          <view class="flex items-start">
            <view class="i-carbon-location mt-0.5 text-16px text-muted" />
            <view class="ml-2 flex-1">
              <text class="block text-4 text-ink">
                {{ detail.location.name }}
              </text>
              <text class="mt-1 block text-3.5 text-sub">
                {{ detail.location.address }}
              </text>
              <text v-if="!detail.location.latitude" class="mt-1 block text-3 text-muted">
                （未提供精确坐标）
              </text>
            </view>
            <view
              v-if="detail.location.latitude"
              class="text-primary-soft-text ml-2 shrink-0 rounded-full bg-primary-soft px-3 py-1 text-3.5"
              @click="openActivityNavigation(detail.location)"
            >
              导航
            </view>
          </view>
        </view>

        <!-- 名额 -->
        <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
          <view class="flex items-center text-3.5">
            <text class="text-sub">已报名 {{ detail.registeredCount }} 人</text>
            <text class="ml-2 text-muted">
              / {{ detail.capacity === null ? '不限' : `上限 ${detail.capacity} 人` }}
            </text>
            <text class="ml-auto text-muted">已签到 {{ detail.checkedInCount }} 人</text>
          </view>
          <view v-if="detail.points > 0" class="text-primary-soft-text mt-2 flex items-center text-3.5">
            <view class="i-carbon-trophy mr-1 text-14px" />
            参与活动可得 {{ detail.points }} 积分
          </view>
          <view v-if="detail.capacity !== null" class="mt-2 h-8px overflow-hidden rounded-full bg-hover">
            <view
              class="h-full rounded-full bg-primary transition-all"
              :style="{ width: `${progressPercent}%` }"
            />
          </view>

          <view
            v-if="detail.registeredCount > 0"
            class="text-primary-soft-text mt-3 flex items-center text-3.5 justify-end"
            @click="goRegistrations"
          >
            <text>查看报名名单 &gt;</text>
          </view>
        </view>

        <!-- 详情 -->
        <view v-if="detail.description" class="mt-3 rounded-3 bg-card p-4 shadow-sm">
          <text class="text-4 text-ink font-medium">活动详情</text>
          <text class="mt-2 block whitespace-pre-wrap text-3.5 text-sub leading-6">
            {{ detail.description }}
          </text>
        </view>

        <!-- 组织者区 -->
        <view v-if="auth.canManageActivity" class="mt-3 rounded-3 bg-card p-4 shadow-sm">
          <text class="text-4 text-ink font-medium">组织者操作</text>
          <view class="mt-3 flex flex-wrap">
            <view class="text-primary-soft-text mb-2 mr-3 flex items-center rounded-full bg-primary-soft px-4 py-1.5 text-3.5" @click="goEdit">
              <view class="i-carbon-edit mr-1 text-14px" /> 编辑活动
            </view>
            <view class="text-primary-soft-text mb-2 mr-3 flex items-center rounded-full bg-primary-soft px-4 py-1.5 text-3.5" @click="goCode">
              <view class="i-carbon-qr-code mr-1 text-14px" /> 出示签到码
            </view>
            <view class="text-primary-soft-text mb-2 mr-3 flex items-center rounded-full bg-primary-soft px-4 py-1.5 text-3.5" @click="goRegistrations">
              <view class="i-carbon-list mr-1 text-14px" /> 报名名单
            </view>
            <view
              class="text-primary-soft-text mb-2 mr-3 flex items-center rounded-full bg-primary-soft px-4 py-1.5 text-3.5"
              @click="goMedia"
            >
              <view class="i-carbon-cloud-upload mr-1 text-14px" /> 上传相册
            </view>
            <view
              class="text-primary-soft-text mb-2 mr-3 flex items-center rounded-full bg-primary-soft px-4 py-1.5 text-3.5"
              @click="saveAsTemplate"
            >
              <view class="i-carbon-template mr-1 text-14px" /> 存为模板
            </view>
            <view
              v-if="!isCancelled"
              class="mb-2 flex items-center rounded-full bg-danger-soft px-4 py-1.5 text-3.5 text-danger"
              @click="doCancelActivity"
            >
              <view class="i-carbon-stop-sign mr-1 text-14px" /> 取消活动
            </view>
          </view>
        </view>

        <!-- 活动相册 -->
        <view v-if="detail.media.length" class="mt-3 rounded-3 bg-card p-4 shadow-sm">
          <view class="flex items-center">
            <text class="text-4 text-ink font-medium">活动相册</text>
            <text class="ml-auto text-3 text-muted">{{ detail.media.length }} 项</text>
          </view>
          <view class="mt-3 flex flex-col gap-3">
            <view
              v-for="item in galleryShown"
              :key="item.id"
              class="overflow-hidden border border-line rounded-2"
            >
              <view
                class="relative aspect-[4/3] w-full overflow-hidden"
                :class="item.type === 'video' ? 'bg-black' : 'bg-hover'"
                @click="item.type === 'image' ? previewImage(item) : playingVideo = item"
              >
                <image
                  v-if="item.type === 'image'"
                  :src="resolveMediaUrl(item.url)"
                  mode="aspectFill"
                  class="h-full w-full"
                />
                <view
                  v-if="item.type === 'video'"
                  class="absolute inset-0 flex items-center justify-center"
                >
                  <view class="i-carbon-play-circle text-24px text-white" />
                  <text
                    v-if="item.duration"
                    class="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-2.5 text-white"
                  >
                    {{ formatDuration(item.duration) }}
                  </text>
                </view>
              </view>
              <text
                v-if="item.description"
                class="block whitespace-pre-wrap px-2.5 py-2 text-3 text-sub leading-5"
              >
                {{ item.description }}
              </text>
            </view>
          </view>
          <view
            v-if="detail.media.length > GALLERY_PREVIEW_LIMIT && !galleryExpanded"
            class="text-primary-soft-text mt-3 text-center text-3.5"
            @click="galleryExpanded = true"
          >
            查看全部 {{ detail.media.length }} 项
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="!loading" class="pt-30 text-center text-4 text-muted">
      活动不存在或已下线
    </view>

    <!-- 底部操作条 -->
    <view
      v-if="detail && !isCancelled"
      class="fixed bottom-0 left-0 right-0 flex items-center border-t border-line bg-card px-3 py-2"
      style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px)"
    >
      <!-- 分享入口（游客可用，所有状态分支共用） -->
      <view
        class="mr-2 h-44px w-44px flex shrink-0 flex-col items-center justify-center border border-line-strong rounded-2 text-sub"
        @click="openShare"
      >
        <view class="i-carbon-share text-18px" />
        <text class="mt-0.5 text-2.5">分享</text>
      </view>

      <!-- 游客 -->
      <button
        v-if="!auth.isLoggedIn"
        class="h-44px flex-1 rounded-2 bg-primary text-4 text-white"
        @click="ensureLogin()"
      >
        登录后报名
      </button>

      <!-- 已签到 -->
      <button
        v-else-if="myReg?.status === 'checked_in'"
        disabled
        class="h-44px flex-1 rounded-2 bg-hover text-4 text-muted"
      >
        已签到
      </button>

      <!-- 已报名 -->
      <template v-else-if="myReg?.status === 'registered'">
        <button
          class="mr-2 h-44px flex-1 rounded-2 bg-primary text-4 text-white"
          @click="goCheckIn"
        >
          活动签到
        </button>
        <button
          :disabled="!canCancelReg || acting"
          class="h-44px flex-1 border border-line-strong rounded-2 text-4"
          :class="canCancelReg ? 'text-danger bg-card' : 'text-muted bg-hover'"
          @click="doCancelRegistration"
        >
          取消报名
        </button>
      </template>

      <!-- 未报名 / 已取消 -->
      <template v-else>
        <button
          :disabled="!!registerClosedReason || acting"
          class="h-44px flex-1 rounded-2 text-4 text-white"
          :class="registerClosedReason ? 'bg-hover text-muted' : 'bg-primary'"
          @click="doRegister"
        >
          {{ registerClosedReason || (myReg?.status === 'cancelled' ? '重新报名' : '立即报名') }}
        </button>
      </template>
    </view>

    <!-- 分享面板（H5 宫格/微信引导遮罩；小程序内转为系统引导弹窗） -->
    <share-sheet
      v-model:show="shareShow"
      :payload="sharePayload"
      :panel-id="sharePanelId"
    />

    <!-- 资料完善弹窗：报名时昵称缺失/为手机号格式自动弹出 -->
    <profile-edit-popup
      v-model:visible="profilePopupVisible"
      title="完善资料"
      hint="报名活动前请先设置您的头像和昵称"
      @confirmed="onProfileConfirmed"
    />

    <!-- 视频播放弹层 -->
    <view
      v-if="playingVideo"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      @click.self="closeVideo"
    >
      <view class="relative w-full">
        <video
          :src="resolveMediaUrl(playingVideo.url)"
          controls
          autoplay
          class="w-full"
          style="height: 220px"
        />
        <view
          class="absolute right-2 top-2 h-7 w-7 flex items-center justify-center rounded-full bg-black/60"
          @click="closeVideo"
        >
          <view class="i-carbon-close text-16px text-white" />
        </view>
      </view>
    </view>
  </view>
</template>
