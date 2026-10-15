<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface UserOption {
  id: string
  name: string
  phoneNumber: string | null
  email: string
}
interface ActivityOption {
  id: string
  title: string
  startTime: string
  status: string
  points: number
}
interface LedgerRow {
  id: string
  userId: string
  userName: string
  userImage: string | null
  userPhone: string | null
  points: number
  category: 'activity' | 'donation'
  source: 'checkin' | 'manual_activity' | 'manual_donation' | 'reversal'
  activityId: string | null
  activityTitle: string | null
  donationKind: 'money' | 'goods' | null
  note: string
  reversalOf: string | null
  operatorName: string | null
  reversalId: string | null
  createdAt: string
}
interface PagedEnvelope<T> {
  code: 'OK'
  data: T[]
  pagination: { page: number, pageSize: number, total: number, totalPages: number }
}

const toast = useToast()
const loading = ref(false)
const rows = ref<LedgerRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

// Reka UI 的 Select 不允许空字符串 value，「全部」用 'all' 哨兵值，请求时剔除
const filters = ref({ category: 'all', source: 'all', keyword: '' })

const columns = [
  { accessorKey: 'createdAt', header: '时间' },
  { accessorKey: 'userName', header: '用户' },
  { accessorKey: 'category', header: '类别' },
  { accessorKey: 'source', header: '来源' },
  { accessorKey: 'points', header: '积分' },
  { accessorKey: 'target', header: '活动/类型' },
  { accessorKey: 'note', header: '备注' },
  { accessorKey: 'operatorName', header: '操作人' },
  { accessorKey: 'actions', header: '操作' }
]

const SOURCE_LABEL: Record<string, string> = {
  checkin: '签到奖励',
  manual_activity: '活动补录',
  manual_donation: '捐献录入',
  reversal: '冲正'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  loading.value = true
  try {
    const res = await $fetch<PagedEnvelope<LedgerRow>>('/api/admin/points/ledger', {
      credentials: 'include',
      query: {
        page: page.value,
        pageSize,
        ...(filters.value.category !== 'all' ? { category: filters.value.category } : {}),
        ...(filters.value.source !== 'all' ? { source: filters.value.source } : {}),
        ...(filters.value.keyword.trim() ? { keyword: filters.value.keyword.trim() } : {})
      }
    })
    rows.value = res.data
    total.value = res.pagination.total
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载积分流水失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  load()
}

// —— 录入弹窗 ——
const modalOpen = ref(false)
const submitting = ref(false)
const form = ref({
  category: 'donation' as 'activity' | 'donation',
  userId: '',
  points: 0,
  activityId: '',
  donationKind: 'money' as 'money' | 'goods',
  note: '',
  createdAt: ''
})
const userKeyword = ref('')
const userResults = ref<UserOption[]>([])
const activityKeyword = ref('')
const activityResults = ref<ActivityOption[]>([])
const selectedUser = ref<UserOption | null>(null)
const selectedActivity = ref<ActivityOption | null>(null)
let userSearchTimer: ReturnType<typeof setTimeout> | undefined
let activitySearchTimer: ReturnType<typeof setTimeout> | undefined

function openCreate() {
  form.value = {
    category: 'donation',
    userId: '',
    points: 0,
    activityId: '',
    donationKind: 'money',
    note: '',
    createdAt: ''
  }
  selectedUser.value = null
  selectedActivity.value = null
  userKeyword.value = ''
  userResults.value = []
  activityKeyword.value = ''
  activityResults.value = []
  modalOpen.value = true
}

function watchUserKeyword() {
  clearTimeout(userSearchTimer)
  userSearchTimer = setTimeout(searchUsers, 300)
}

async function searchUsers() {
  const kw = userKeyword.value.trim()
  if (!kw) {
    userResults.value = []
    return
  }
  try {
    const res = await $fetch<PagedEnvelope<UserOption>>('/api/admin/users', {
      credentials: 'include',
      query: { keyword: kw, page: 1, pageSize: 8 }
    })
    userResults.value = res.data
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '搜索用户失败'), color: 'error' })
  }
}

function watchActivityKeyword() {
  clearTimeout(activitySearchTimer)
  activitySearchTimer = setTimeout(searchActivities, 300)
}

async function searchActivities() {
  try {
    const res = await $fetch<{ code: 'OK', data: ActivityOption[] }>('/api/admin/points/activities', {
      credentials: 'include',
      query: activityKeyword.value.trim() ? { keyword: activityKeyword.value.trim() } : {}
    })
    activityResults.value = res.data
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '搜索活动失败'), color: 'error' })
  }
}

function pickUser(u: UserOption) {
  selectedUser.value = u
  form.value.userId = u.id
  userKeyword.value = u.phoneNumber ? `${u.name}（${u.phoneNumber}）` : u.name
  userResults.value = []
}

function pickActivity(a: ActivityOption) {
  selectedActivity.value = a
  form.value.activityId = a.id
  form.value.points = a.points
  activityKeyword.value = a.title
  activityResults.value = []
}

const formErrors = computed(() => {
  const errs: { name: string, message: string }[] = []
  if (!form.value.userId)
    errs.push({ name: 'user', message: '请选择用户' })
  if (!Number.isInteger(form.value.points) || form.value.points < 1 || form.value.points > 9999)
    errs.push({ name: 'points', message: '积分需为 1~9999 的整数' })
  if (form.value.category === 'activity' && !form.value.activityId)
    errs.push({ name: 'activity', message: '请选择活动' })
  if (form.value.note.length > 200)
    errs.push({ name: 'note', message: '备注不能超过 200 字' })
  return errs
})

async function submitForm() {
  if (formErrors.value.length) {
    toast.add({ title: formErrors.value[0]!.message, color: 'error' })
    return
  }
  submitting.value = true
  try {
    await $fetch('/api/admin/points', {
      method: 'POST',
      credentials: 'include',
      body: {
        category: form.value.category,
        userId: form.value.userId,
        points: form.value.points,
        ...(form.value.category === 'activity'
          ? { activityId: form.value.activityId }
          : { donationKind: form.value.donationKind }),
        ...(form.value.note.trim() ? { note: form.value.note.trim() } : {}),
        ...(form.value.createdAt ? { createdAt: new Date(form.value.createdAt).toISOString() } : {})
      }
    })
    toast.add({ title: '录入成功', color: 'success' })
    modalOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '积分录入失败'), color: 'error' })
  } finally {
    submitting.value = false
  }
}

// —— 冲正确认 ——
const reverseTarget = ref<LedgerRow | null>(null)
const reverseReason = ref('')
const reversing = ref(false)
const reverseOpen = ref(false)

function openReverse(row: LedgerRow) {
  reverseTarget.value = row
  reverseReason.value = ''
  reverseOpen.value = true
}

async function submitReverse() {
  if (!reverseTarget.value)
    return
  if (!reverseReason.value.trim()) {
    toast.add({ title: '请填写冲正原因', color: 'error' })
    return
  }
  reversing.value = true
  try {
    await $fetch(`/api/admin/points/${reverseTarget.value.id}/reverse`, {
      method: 'POST',
      credentials: 'include',
      body: { reason: reverseReason.value.trim() }
    })
    toast.add({ title: '冲正成功', color: 'success' })
    reverseOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '冲正失败'), color: 'error' })
  } finally {
    reversing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <h1 class="text-xl font-semibold">
        积分管理
      </h1>
      <UButton
        icon="i-lucide-plus"
        label="录入积分"
        @click="openCreate"
      />
    </div>

    <UCard>
      <div class="flex gap-2 items-end flex-wrap">
        <label class="text-sm space-y-1">
          <span class="text-muted">类别</span>
          <USelect
            v-model="filters.category"
            :items="[{ label: '全部', value: 'all' }, { label: '活动积分', value: 'activity' }, { label: '捐献积分', value: 'donation' }]"
            class="w-32"
          />
        </label>
        <label class="text-sm space-y-1">
          <span class="text-muted">来源</span>
          <USelect
            v-model="filters.source"
            :items="[{ label: '全部', value: 'all' }, { label: '签到奖励', value: 'checkin' }, { label: '活动补录', value: 'manual_activity' }, { label: '捐献录入', value: 'manual_donation' }, { label: '冲正', value: 'reversal' }]"
            class="w-36"
          />
        </label>
        <UInput
          v-model="filters.keyword"
          placeholder="用户姓名/手机号"
          class="w-52"
        />
        <UButton
          label="筛选"
          variant="soft"
          @click="applyFilters"
        />
      </div>
    </UCard>

    <UCard>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
      >
        <template #createdAt-cell="{ row }">
          {{ formatTime(row.original.createdAt) }}
        </template>
        <template #category-cell="{ row }">
          <UBadge
            :color="row.original.category === 'activity' ? 'success' : 'warning'"
            variant="subtle"
          >
            {{ row.original.category === 'activity' ? '活动' : '捐献' }}
          </UBadge>
        </template>
        <template #source-cell="{ row }">
          {{ SOURCE_LABEL[row.original.source] }}
        </template>
        <template #points-cell="{ row }">
          <span :class="row.original.points < 0 ? 'text-error font-medium' : 'text-success font-medium'">
            {{ row.original.points > 0 ? '+' : '' }}{{ row.original.points }}
          </span>
        </template>
        <template #target-cell="{ row }">
          <span v-if="row.original.activityTitle">{{ row.original.activityTitle }}</span>
          <span v-else-if="row.original.donationKind === 'money'">捐款</span>
          <span v-else-if="row.original.donationKind === 'goods'">物资</span>
          <span
            v-else
            class="text-muted"
          >—</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="row.original.source !== 'reversal' && !row.original.reversalId"
            label="冲正"
            color="error"
            variant="ghost"
            size="xs"
            @click="openReverse(row.original)"
          />
          <span
            v-else
            class="text-muted text-xs"
          >
            {{ row.original.source === 'reversal' ? '冲正记录' : '已冲正' }}
          </span>
        </template>
      </UTable>
      <div class="mt-4 flex justify-end">
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="pageSize"
          @update:page="load"
        />
      </div>
    </UCard>

    <!-- 录入弹窗：正文必须放 #body -->
    <UModal
      v-model:open="modalOpen"
      title="录入积分"
    >
      <template #body>
        <div class="p-4 space-y-4">
          <UFormField
            label="积分类别"
            name="category"
          >
            <URadioGroup
              v-model="form.category"
              :items="[{ label: '捐献积分', value: 'donation' }, { label: '活动积分', value: 'activity' }]"
            />
          </UFormField>

          <UFormField
            label="用户（姓名/手机号搜索）"
            name="user"
            :error="formErrors.find(e => e.name === 'user')?.message"
          >
            <div class="relative">
              <UInput
                v-model="userKeyword"
                placeholder="输入姓名或手机号搜索"
                class="w-full"
                @input="watchUserKeyword"
              />
              <div
                v-if="userResults.length"
                class="absolute z-10 mt-1 w-full rounded-md border border-default bg-default shadow-lg"
              >
                <button
                  v-for="u in userResults"
                  :key="u.id"
                  type="button"
                  class="w-full px-3 py-2 text-left text-sm hover:bg-elevated"
                  @click="pickUser(u)"
                >
                  {{ u.name }}<span
                    v-if="u.phoneNumber"
                    class="text-muted ml-2"
                  >{{ u.phoneNumber }}</span>
                </button>
              </div>
            </div>
          </UFormField>

          <template v-if="form.category === 'activity'">
            <UFormField
              label="活动（选中后自动带出配置积分，可修改）"
              name="activity"
              :error="formErrors.find(e => e.name === 'activity')?.message"
            >
              <div class="relative">
                <UInput
                  v-model="activityKeyword"
                  placeholder="输入活动标题搜索"
                  class="w-full"
                  @input="watchActivityKeyword"
                  @focus="searchActivities"
                />
                <div
                  v-if="activityResults.length"
                  class="absolute z-10 mt-1 w-full rounded-md border border-default bg-default shadow-lg"
                >
                  <button
                    v-for="a in activityResults"
                    :key="a.id"
                    type="button"
                    class="w-full px-3 py-2 text-left text-sm hover:bg-elevated"
                    @click="pickActivity(a)"
                  >
                    {{ a.title }}
                    <span class="text-muted ml-2">{{ new Date(a.startTime).toLocaleDateString('zh-CN') }} · {{ a.points }} 分{{ a.status === 'cancelled' ? ' · 已取消' : '' }}</span>
                  </button>
                </div>
              </div>
            </UFormField>
          </template>
          <UFormField
            v-else
            label="捐献类型"
          >
            <URadioGroup
              v-model="form.donationKind"
              :items="[{ label: '捐款', value: 'money' }, { label: '物资', value: 'goods' }]"
            />
          </UFormField>

          <UFormField
            label="积分值（1~9999）"
            name="points"
            :error="formErrors.find(e => e.name === 'points')?.message"
          >
            <UInput
              v-model.number="form.points"
              type="number"
              :min="1"
              :max="9999"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="备注（金额/物资名称等，仅后台与本人可见）"
            name="note"
          >
            <UTextarea
              v-model="form.note"
              :rows="2"
              maxlength="200"
              class="w-full"
            />
          </UFormField>
          <UFormField label="录入时间（留空为当前时间，可补录历史）">
            <UInput
              v-model="form.createdAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              label="取消"
              color="neutral"
              variant="ghost"
              @click="modalOpen = false"
            />
            <UButton
              label="提交"
              :loading="submitting"
              @click="submitForm"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- 冲正弹窗 -->
    <UModal
      v-model:open="reverseOpen"
      title="冲正确认"
    >
      <template #body>
        <div
          v-if="reverseTarget"
          class="p-4 space-y-4"
        >
          <p class="text-sm">
            将为 <b>{{ reverseTarget.userName }}</b> 的
            {{ reverseTarget.category === 'activity' ? '活动' : '捐献' }}积分
            <b :class="reverseTarget.points < 0 ? 'text-error' : 'text-success'">
              {{ reverseTarget.points > 0 ? '+' : '' }}{{ reverseTarget.points }}
            </b>
            生成等额扣减，操作不可撤销。
          </p>
          <UFormField label="冲正原因（必填）">
            <UTextarea
              v-model="reverseReason"
              :rows="2"
              maxlength="200"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              label="取消"
              color="neutral"
              variant="ghost"
              @click="reverseOpen = false"
            />
            <UButton
              label="确认冲正"
              color="error"
              :loading="reversing"
              @click="submitReverse"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
