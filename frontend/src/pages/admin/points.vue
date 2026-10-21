<script lang="ts" setup>
import type { ActivityPickerItem, AdminLedgerRow, ManualPointsPayload, PointsCategory, PointsSource } from '@/api/points'
import type { AdminUserOption } from '@/api/users'
import { createManualPoints, getActivitiesForPicker, getAdminLedger, reversePointsLedger } from '@/api/points'
import { searchAdminUsers } from '@/api/users'
import { useAuthStore } from '@/store/auth'
import { toLoginPage } from '@/utils/toLoginPage'

definePage({
  style: { navigationBarTitleText: '积分管理' },
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

const SOURCE_LABEL: Record<PointsSource, string> = {
  checkin: '签到奖励',
  manual_activity: '活动补录',
  manual_donation: '捐献录入',
  reversal: '冲正',
}

// —— 筛选 ——
const category = ref<PointsCategory | ''>('')
const source = ref<PointsSource | ''>('')
const keyword = ref('')
const categoryTabs: { label: string, value: PointsCategory | '' }[] = [
  { label: '全部', value: '' },
  { label: '活动', value: 'activity' },
  { label: '捐献', value: 'donation' },
]
const sourceColumns = [
  { label: '全部来源', value: '' },
  { label: '签到奖励', value: 'checkin' },
  { label: '活动补录', value: 'manual_activity' },
  { label: '捐献录入', value: 'manual_donation' },
  { label: '冲正', value: 'reversal' },
]
const sourceValue = ref<(string | number)[]>([''])

function switchCategory(c: PointsCategory | '') {
  if (category.value === c)
    return
  category.value = c
  load(true)
}

function onSourceConfirm(e: { value: (string | number)[] }) {
  source.value = (e.value?.[0] ?? '') as PointsSource | ''
  load(true)
}

function applyKeyword() {
  load(true)
}

// —— 流水列表（加载更多 + 请求世代号防筛选切换竞态） ——
const rows = ref<AdminLedgerRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
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
    const res = await getAdminLedger(reqPage, {
      ...(category.value ? { category: category.value } : {}),
      ...(source.value ? { source: source.value } : {}),
      ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
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

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function targetLabel(row: AdminLedgerRow) {
  if (row.activityTitle)
    return row.activityTitle
  if (row.donationKind === 'money')
    return '捐款'
  if (row.donationKind === 'goods')
    return '物资'
  return '—'
}

onMounted(() => load(true))

// —— 录入弹层 ——
const createShow = ref(false)
const submitting = ref(false)
const form = ref({
  category: 'donation' as PointsCategory,
  userId: '',
  points: '',
  activityId: '',
  donationKind: 'money' as 'money' | 'goods',
  note: '',
})
const createdAtTs = ref(Date.now())
const datePickerShow = ref(false)

const userKeyword = ref('')
const userResults = ref<AdminUserOption[]>([])
const selectedUser = ref<AdminUserOption | null>(null)
let userTimer: ReturnType<typeof setTimeout> | undefined

const activityKeyword = ref('')
const activityResults = ref<ActivityPickerItem[]>([])
const selectedActivity = ref<ActivityPickerItem | null>(null)
let activityTimer: ReturnType<typeof setTimeout> | undefined

function userDisplay(u: AdminUserOption) {
  return u.phoneNumber ? `${u.name}（${u.phoneNumber}）` : u.name
}

// 点选回填展示文本时不触发搜索；改词则清空已选、需重新选择
watch(userKeyword, (v) => {
  if (selectedUser.value && v === userDisplay(selectedUser.value))
    return
  selectedUser.value = null
  form.value.userId = ''
  clearTimeout(userTimer)
  userTimer = setTimeout(searchUsers, 300)
})

async function searchUsers() {
  const kw = userKeyword.value.trim()
  if (!kw) {
    userResults.value = []
    return
  }
  try {
    const res = await searchAdminUsers(kw)
    userResults.value = res.data
  }
  catch {
    // alova 层已统一 toast
  }
}

function pickUser(u: AdminUserOption) {
  selectedUser.value = u
  form.value.userId = u.id
  userResults.value = []
  userKeyword.value = userDisplay(u)
}

watch(activityKeyword, (v) => {
  if (selectedActivity.value && v === selectedActivity.value.title)
    return
  selectedActivity.value = null
  form.value.activityId = ''
  clearTimeout(activityTimer)
  activityTimer = setTimeout(searchActivities, 300)
})

async function searchActivities() {
  try {
    activityResults.value = await getActivitiesForPicker(activityKeyword.value.trim() || undefined)
  }
  catch {
    // alova 层已统一 toast
  }
}

function pickActivity(a: ActivityPickerItem) {
  selectedActivity.value = a
  form.value.activityId = a.id
  form.value.points = String(a.points)
  activityResults.value = []
  activityKeyword.value = a.title
}

function openCreate() {
  form.value = {
    category: 'donation',
    userId: '',
    points: '',
    activityId: '',
    donationKind: 'money',
    note: '',
  }
  selectedUser.value = null
  selectedActivity.value = null
  userKeyword.value = ''
  userResults.value = []
  activityKeyword.value = ''
  activityResults.value = []
  createdAtTs.value = Date.now()
  createShow.value = true
}

// 客户端校验与 PC 后台 formErrors 口径一致
function validateForm(): string {
  if (!form.value.userId)
    return '请选择用户'
  const pts = Number(form.value.points)
  if (!Number.isInteger(pts) || pts < 1 || pts > 9999)
    return '积分需为 1~9999 的整数'
  if (form.value.category === 'activity' && !form.value.activityId)
    return '请选择活动'
  if (form.value.note.length > 200)
    return '备注不能超过 200 字'
  return ''
}

async function submitCreate() {
  const err = validateForm()
  if (err) {
    uni.showToast({ title: err, icon: 'none' })
    return
  }
  submitting.value = true
  try {
    const payload: ManualPointsPayload = {
      category: form.value.category,
      userId: form.value.userId,
      points: Number(form.value.points),
      ...(form.value.category === 'activity'
        ? { activityId: form.value.activityId }
        : { donationKind: form.value.donationKind }),
      ...(form.value.note.trim() ? { note: form.value.note.trim() } : {}),
      createdAt: new Date(createdAtTs.value).toISOString(),
    }
    await createManualPoints(payload)
    uni.showToast({ title: '录入成功', icon: 'success' })
    createShow.value = false
    await load(true)
  }
  catch {
    // alova 层已统一 toast
  }
  finally {
    submitting.value = false
  }
}

// —— 冲正弹层 ——
const reverseShow = ref(false)
const reverseTarget = ref<AdminLedgerRow | null>(null)
const reverseReason = ref('')
const reversing = ref(false)

function openReverse(row: AdminLedgerRow) {
  reverseTarget.value = row
  reverseReason.value = ''
  reverseShow.value = true
}

async function submitReverse() {
  if (!reverseTarget.value)
    return
  if (!reverseReason.value.trim()) {
    uni.showToast({ title: '请填写冲正原因', icon: 'none' })
    return
  }
  reversing.value = true
  try {
    await reversePointsLedger(reverseTarget.value.id, reverseReason.value.trim())
    uni.showToast({ title: '冲正成功', icon: 'success' })
    reverseShow.value = false
    await load(true)
  }
  catch {
    // alova 层已统一 toast
  }
  finally {
    reversing.value = false
  }
}
</script>

<template>
  <view class="min-h-screen bg-page px-3 pb-6 pt-3">
    <!-- 筛选卡：类别分段 + 关键词搜索 + 来源下拉 -->
    <view class="rounded-3 bg-card shadow-sm">
      <view class="flex rounded-2 bg-hover px-6">
        <view
          v-for="t in categoryTabs" :key="t.value"
          class="flex-1 rounded-2 py-2 text-center text-4"
          :class="category === t.value ? 'bg-primary text-white font-medium' : 'text-sub'"
          @click="switchCategory(t.value)"
        >
          {{ t.label }}
        </view>
      </view>
      <wd-search
        v-model="keyword" placeholder="用户姓名/手机号" hide-cancel
        @search="applyKeyword" @clear="applyKeyword"
      />
      <wd-picker
        v-model="sourceValue" :columns="sourceColumns" title="来源筛选"
        @confirm="onSourceConfirm"
      />
    </view>

    <view class="mt-3 flex justify-end">
      <wd-button size="small" @click="openCreate">
        录入积分
      </wd-button>
    </view>

    <!-- 流水列表 -->
    <view class="mt-3 overflow-hidden rounded-3 bg-card shadow-sm">
      <view
        v-for="(row, i) in rows" :key="row.id"
        class="px-4 py-3" :class="i > 0 ? 'border-t border-line' : ''"
      >
        <view class="flex items-center">
          <text class="flex-1 truncate text-4 text-ink font-medium">
            {{ row.userName }}
          </text>
          <text class="rounded bg-hover px-1.5 py-0.5 text-3 text-muted">
            {{ row.category === 'activity' ? '活动' : '捐献' }}
          </text>
          <text class="ml-2 text-4 font-semibold" :class="row.points < 0 ? 'text-danger' : 'text-primary-soft-text'">
            {{ row.points > 0 ? '+' : '' }}{{ row.points }}
          </text>
        </view>
        <view class="mt-1 text-3 text-muted">
          {{ formatTime(row.createdAt) }}
        </view>
        <view class="mt-1 text-3 text-muted">
          来源：{{ SOURCE_LABEL[row.source] }} · {{ targetLabel(row) }}
        </view>
        <text v-if="row.note" class="mt-1 block text-3.5 text-sub">
          备注：{{ row.note }}
        </text>
        <text v-if="row.operatorName" class="mt-1 block text-3 text-muted">
          操作人：{{ row.operatorName }}
        </text>
        <view v-if="row.source !== 'reversal' && !row.reversalId" class="mt-2">
          <button
            class="h-8 border border-danger rounded-2 bg-card px-4 text-3.5 text-danger"
            @click="openReverse(row)"
          >
            冲正
          </button>
        </view>
        <text v-else class="mt-1 block text-3 text-muted">
          {{ row.source === 'reversal' ? '冲正记录' : '已冲正' }}
        </text>
      </view>
      <view v-if="rows.length < total" class="py-3 text-center text-3.5 text-muted" @click="more">
        {{ loading ? '加载中…' : '加载更多' }}
      </view>
      <view v-else-if="!rows.length && !loading" class="py-8 text-center text-4 text-muted">
        暂无积分流水
      </view>
    </view>

    <!-- 录入弹层 -->
    <wd-popup v-model="createShow" position="bottom" round safe-area-inset-bottom custom-class="points-popup">
      <view class="flex flex-col">
        <view class="flex items-center px-4 pt-4">
          <text class="text-4 text-ink font-medium">
            录入积分
          </text>
          <view class="i-carbon-close ml-auto text-5 text-muted" @click="createShow = false" />
        </view>
        <view class="px-4">
          <view class="pt-3">
            <text class="text-3.5 text-muted">积分类别</text>
            <wd-radio-group v-model="form.category" direction="horizontal" class="mt-1">
              <wd-radio value="donation">
                捐献积分
              </wd-radio>
              <wd-radio value="activity">
                活动积分
              </wd-radio>
            </wd-radio-group>
          </view>

          <view class="mt-3">
            <text class="text-3.5 text-muted">用户（姓名/手机号搜索）</text>
            <view class="mt-1 overflow-hidden border border-line-strong rounded-2 border-solid">
              <wd-input v-model="userKeyword" placeholder="输入姓名或手机号搜索" />
            </view>
            <view v-if="userResults.length" class="mt-1 overflow-hidden border border-line rounded-2 bg-card">
              <view
                v-for="u in userResults" :key="u.id"
                class="px-3 py-2 text-4 text-sub" hover-class="bg-hover"
                @click="pickUser(u)"
              >
                {{ u.name }}<text v-if="u.phoneNumber" class="ml-2 text-3 text-muted">{{ u.phoneNumber }}</text>
              </view>
            </view>
          </view>

          <view v-if="form.category === 'activity'" class="mt-3">
            <text class="text-3.5 text-muted">活动（选中后自动带出配置积分，可修改）</text>
            <view class="mt-1 overflow-hidden border border-line-strong rounded-2 border-solid">
              <wd-input v-model="activityKeyword" placeholder="输入活动标题搜索" @focus="searchActivities" />
            </view>
            <view v-if="activityResults.length" class="mt-1 overflow-hidden border border-line rounded-2 bg-card">
              <view
                v-for="a in activityResults" :key="a.id"
                class="px-3 py-2 text-4 text-sub" hover-class="bg-hover"
                @click="pickActivity(a)"
              >
                {{ a.title }}
                <text class="ml-2 text-3 text-muted">
                  {{ new Date(a.startTime).toLocaleDateString() }} · {{ a.points }} 分{{ a.status === 'cancelled' ? ' · 已取消' : '' }}
                </text>
              </view>
            </view>
          </view>
          <view v-else class="mt-3">
            <text class="text-3.5 text-muted">捐献类型</text>
            <wd-radio-group v-model="form.donationKind" direction="horizontal" class="mt-1">
              <wd-radio value="money">
                捐款
              </wd-radio>
              <wd-radio value="goods">
                物资
              </wd-radio>
            </wd-radio-group>
          </view>

          <view class="mt-3">
            <text class="text-3.5 text-muted">积分值（1~9999）</text>
            <view class="mt-1 overflow-hidden border border-line-strong rounded-2 border-solid">
              <wd-input v-model="form.points" type="number" placeholder="1~9999" />
            </view>
          </view>

          <view class="mt-3">
            <text class="text-3.5 text-muted">备注（金额/物资名称等，仅后台与本人可见）</text>
            <view class="mt-1 overflow-hidden border border-line-strong rounded-2 border-solid">
              <wd-textarea auto-height v-model="form.note" :maxlength="200" show-word-limit />
            </view>
          </view>

          <view class="mt-3 flex items-center py-1" @click="datePickerShow = true">
            <text class="text-3.5 text-muted flex-1">录入时间</text>
            <text class="text-4 text-ink">{{ formatTime(new Date(createdAtTs).toISOString()) }}</text>
            <view class="i-carbon-chevron-right ml-2 text-4 text-muted" />
          </view>
          <view class="h-3" />
        </view>
        <view class="flex gap-3 border-t border-line px-4 py-3">
          <button class="h-10 flex-1 border border-line rounded-2 bg-card text-4 text-sub" @click="createShow = false">
            取消
          </button>
          <button class="h-10 flex-1 rounded-2 bg-primary text-4 text-white" :loading="submitting" @click="submitCreate">
            提交
          </button>
        </view>
      </view>
    </wd-popup>

    <!-- 冲正弹层 -->
    <wd-popup v-model="reverseShow" position="bottom" round safe-area-inset-bottom custom-class="points-popup">
      <view v-if="reverseTarget" class="px-4 pb-4 pt-4">
        <text class="text-4 text-ink font-medium">
          冲正确认
        </text>
        <view class="mt-3 text-3.5 text-sub">
          将为 {{ reverseTarget.userName }} 的{{ reverseTarget.category === 'activity' ? '活动' : '捐献' }}积分
          <text :class="reverseTarget.points < 0 ? 'text-danger' : 'text-primary-soft-text'">
            {{ reverseTarget.points > 0 ? '+' : '' }}{{ reverseTarget.points }}
          </text>
          生成等额扣减，操作不可撤销。
        </view>
        <view class="mt-3">
          <text class="text-3.5 text-muted">冲正原因（必填）</text>
          <view class="mt-1 overflow-hidden border border-line-strong rounded-2 border-solid">
            <wd-textarea v-model="reverseReason" :maxlength="200" show-word-limit />
          </view>
        </view>
        <view class="mt-4 flex gap-3">
          <button class="h-10 flex-1 border border-line rounded-2 bg-card text-4 text-sub" @click="reverseShow = false">
            取消
          </button>
          <button class="h-10 flex-1 rounded-2 bg-danger text-4 text-white" :loading="reversing" @click="submitReverse">
            确认冲正
          </button>
        </view>
      </view>
    </wd-popup>

    <wd-datetime-picker v-model="createdAtTs" v-model:visible="datePickerShow" type="datetime" title="录入时间" />
  </view>
</template>

<style lang="scss">
/* #ifdef H5 */
// 桌面宽屏下与 tabbar/布局导航栏一致：收窄到 768px 并居中，避免 fixed 弹层横跨视口。
// 居中用 margin auto 而非 tabbar 的 translateX(-50%)，因 wd-popup 开合动画会在同一节点上
// 覆盖 transform（slide-up 的 translate3d），用 transform 居中会导致动画期间横向跳动。
.points-popup {
  @media (min-width: 1024px) {
    width: 100%;
    max-width: 768px;
    left: 0;
    right: 0;
    margin: 0 auto;
  }
}
/* #endif */
</style>
