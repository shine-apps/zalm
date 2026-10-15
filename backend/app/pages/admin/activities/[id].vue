<script setup lang="ts">
interface ActivityDetail {
  id: string
  title: string
  description: string
  coverUrl: string | null
  location: { name: string, address: string, latitude: number | null, longitude: number | null }
  startTime: string
  endTime: string
  registerDeadline: string | null
  capacity: number | null
  points: number
  status: 'published' | 'cancelled'
  state: 'upcoming' | 'ongoing' | 'ended' | 'cancelled'
  registeredCount: number
  checkedInCount: number
  remaining: number | null
}
interface RegistrationRow {
  id: string
  userId: string
  userName: string
  userPhone: string | null
  userImage: string | null
  status: 'registered' | 'cancelled' | 'checked_in'
  checkInAt: string | null
  checkInMethod: 'scan' | 'manual' | null
  createdAt: string
}
interface DetailResponse { code: 'OK', data: ActivityDetail }
interface ListResponse {
  code: 'OK'
  data: RegistrationRow[]
  pagination: { page: number, pageSize: number, total: number, totalPages: number }
  stats: { registeredCount: number, checkedInCount: number, capacity: number | null, remaining: number | null }
}

const route = useRoute()
const toast = useToast()
const activityId = String(route.params.id)

const activity = ref<ActivityDetail | null>(null)
const rows = ref<RegistrationRow[]>([])
const total = ref(0)
const stats = ref({ registeredCount: 0, checkedInCount: 0, capacity: null as number | null, remaining: null as number | null })
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const checkInUserId = ref<string | null>(null)

async function loadActivity() {
  try {
    const res = await $fetch<DetailResponse>(`/api/admin/activities/${activityId}`, {
      credentials: 'include'
    })
    activity.value = res.data
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载活动失败'), color: 'error' })
  }
}

async function loadRegistrations() {
  loading.value = true
  try {
    const res = await $fetch<ListResponse>(`/api/admin/activities/${activityId}/registrations`, {
      credentials: 'include',
      query: { page: page.value, pageSize }
    })
    rows.value = res.data
    total.value = res.pagination.total
    stats.value = res.stats
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载名单失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(page, () => loadRegistrations())

const columns = [
  { accessorKey: 'userName', header: '昵称' },
  { accessorKey: 'userPhone', header: '手机号' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'checkInMethod', header: '签到方式' },
  { accessorKey: 'checkInAt', header: '签到时间' },
  { accessorKey: 'createdAt', header: '报名时间' },
  { id: 'actions', header: '操作' }
]

const STATUS_LABEL: Record<RegistrationRow['status'], string> = {
  registered: '已报名',
  cancelled: '已取消',
  checked_in: '已签到'
}

function statusColor(s: RegistrationRow['status']): string {
  if (s === 'checked_in') return 'success'
  if (s === 'cancelled') return 'neutral'
  return 'primary'
}

async function manualCheckIn(row: RegistrationRow) {
  checkInUserId.value = row.userId
  try {
    await $fetch(`/api/admin/activities/${activityId}/manual-check-in`, {
      method: 'POST',
      credentials: 'include',
      body: { userId: row.userId }
    })
    toast.add({ title: `已为 ${row.userName} 补签`, color: 'success' })
    await loadRegistrations()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    checkInUserId.value = null
  }
}

onMounted(async () => {
  await loadActivity()
  await loadRegistrations()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <NuxtLink
          to="/admin/activities"
          class="text-sm text-primary hover:underline"
        >
          ← 返回活动列表
        </NuxtLink>
        <h1 class="text-xl font-semibold mt-1">
          {{ activity?.title ?? '活动详情' }}
        </h1>
      </div>
    </div>

    <UCard v-if="activity">
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
        <div>
          <dt class="text-muted">
            开始时间
          </dt>
          <dd>{{ formatDateTime(activity.startTime) }}</dd>
        </div>
        <div>
          <dt class="text-muted">
            结束时间
          </dt>
          <dd>{{ formatDateTime(activity.endTime) }}</dd>
        </div>
        <div>
          <dt class="text-muted">
            地点
          </dt>
          <dd>{{ activity.location.name }}（{{ activity.location.address }}）</dd>
        </div>
        <div>
          <dt class="text-muted">
            报名截止
          </dt>
          <dd>{{ formatDateTime(activity.registerDeadline) }}</dd>
        </div>
        <div>
          <dt class="text-muted">
            名额
          </dt>
          <dd>
            已报 {{ stats.registeredCount }} /
            {{ stats.capacity === null ? '不限' : `上限 ${stats.capacity}` }}，
            已签到 {{ stats.checkedInCount }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            参与积分
          </dt>
          <dd>{{ activity.points }} 分</dd>
        </div>
        <div>
          <dt class="text-muted">
            状态
          </dt>
          <dd>{{ activity.status === 'cancelled' ? '已取消' : '进行中/未开始' }}</dd>
        </div>
      </dl>
      <p
        v-if="activity.description"
        class="text-sm mt-4 whitespace-pre-line text-muted"
      >
        {{ activity.description }}
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-base font-medium">
          报名 / 签到名单（{{ total }}）
        </h2>
      </template>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
      >
        <template #userPhone-cell="{ row }">
          {{ row.original.userPhone || '—' }}
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="(statusColor(row.original.status) as 'primary' | 'success' | 'neutral')"
            variant="subtle"
            size="sm"
          >
            {{ STATUS_LABEL[row.original.status] }}
          </UBadge>
        </template>
        <template #checkInMethod-cell="{ row }">
          <span v-if="row.original.checkInMethod === 'manual'">管理员补签</span>
          <span v-else-if="row.original.checkInMethod === 'scan'">扫码签到</span>
          <span
            v-else
            class="text-muted"
          >—</span>
        </template>
        <template #checkInAt-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDateTime(row.original.checkInAt) }}</span>
        </template>
        <template #createdAt-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDateTime(row.original.createdAt) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="row.original.status === 'registered'"
            color="primary"
            variant="ghost"
            size="xs"
            icon="i-lucide-check-check"
            label="补签"
            :loading="checkInUserId === row.original.userId"
            @click="manualCheckIn(row.original)"
          />
          <span
            v-else
            class="text-muted text-xs"
          >—</span>
        </template>
        <template #empty>
          <div class="py-10 text-center text-sm text-muted">
            暂无报名记录
          </div>
        </template>
      </UTable>

      <div
        v-if="total > pageSize"
        class="flex justify-center mt-4"
      >
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="pageSize"
        />
      </div>
    </UCard>
  </div>
</template>
