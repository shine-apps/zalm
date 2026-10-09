<script setup lang="ts">
interface ActivityRow {
  id: string
  title: string
  location: { name: string, address: string, latitude: number | null, longitude: number | null }
  startTime: string
  endTime: string
  status: 'published' | 'cancelled'
  state: 'upcoming' | 'ongoing' | 'ended' | 'cancelled'
  capacity: number | null
  registeredCount: number
  checkedInCount: number
  remaining: number | null
}
interface ListResponse {
  code: 'OK'
  data: ActivityRow[]
  pagination: { page: number, pageSize: number, total: number, totalPages: number }
}

const toast = useToast()
const route = useRoute()
const router = useRouter()

const rows = ref<ActivityRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(false)
const searchInput = ref('')
const keyword = ref('')
const state = ref<'active' | 'past' | 'cancelled'>('active')

const stateItems = [
  { label: '未开始/进行中', value: 'active' },
  { label: '已结束', value: 'past' },
  { label: '已取消', value: 'cancelled' }
]

async function load() {
  loading.value = true
  try {
    const res = await $fetch<ListResponse>('/api/admin/activities', {
      credentials: 'include',
      query: {
        page: page.value,
        pageSize,
        state: state.value,
        ...(keyword.value ? { keyword: keyword.value } : {})
      }
    })
    rows.value = res.data
    total.value = res.pagination.total
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载活动列表失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (val) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    keyword.value = val.trim()
    page.value = 1
    load()
  }, 300)
})
watch([page, state], () => load())

const columns = [
  { accessorKey: 'title', header: '活动' },
  { accessorKey: 'startTime', header: '开始时间' },
  { accessorKey: 'location', header: '地点' },
  { accessorKey: 'state', header: '状态' },
  { accessorKey: 'registeredCount', header: '报名/上限' },
  { accessorKey: 'checkedInCount', header: '已签到' },
  { id: 'actions', header: '操作' }
]

const STATE_LABEL: Record<ActivityRow['state'], string> = {
  upcoming: '未开始',
  ongoing: '进行中',
  ended: '已结束',
  cancelled: '已取消'
}

function stateColor(s: ActivityRow['state']): string {
  if (s === 'ongoing') return 'success'
  if (s === 'cancelled' || s === 'ended') return 'neutral'
  return 'primary'
}

function capacityText(row: ActivityRow): string {
  return row.capacity === null ? `${row.registeredCount} / 不限` : `${row.registeredCount} / ${row.capacity}`
}

function openDetail(id: string) {
  router.push(`/admin/activities/${id}`)
}

// 取消确认
const cancelOpen = ref(false)
const cancelTarget = ref<ActivityRow | null>(null)
const cancelSubmitting = ref(false)

function askCancel(row: ActivityRow) {
  cancelTarget.value = row
  cancelOpen.value = true
}

async function onCancel() {
  if (!cancelTarget.value) return
  cancelSubmitting.value = true
  try {
    await $fetch(`/api/admin/activities/${cancelTarget.value.id}/cancel`, {
      method: 'POST',
      credentials: 'include'
    })
    toast.add({ title: '活动已取消', color: 'success' })
    cancelOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    cancelSubmitting.value = false
  }
}

onMounted(() => {
  if (route.query.state === 'cancelled') state.value = 'cancelled'
  load()
})
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-semibold">
        活动管理
      </h1>
      <p class="text-sm text-muted mt-1">
        共 {{ total }} 个活动
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <USelect
        v-model="state"
        :items="stateItems"
        class="w-40"
      />
      <UInput
        v-model="searchInput"
        placeholder="搜索标题 / 地点"
        icon="i-lucide-search"
        class="w-56 sm:w-64"
        clearable
      />
    </div>

    <UCard>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
      >
        <template #startTime-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDateTime(row.original.startTime) }}</span>
        </template>

        <template #location-cell="{ row }">
          <span class="text-sm">{{ row.original.location.name }}</span>
        </template>

        <template #registeredCount-cell="{ row }">
          <span class="text-sm">{{ capacityText(row.original) }}</span>
        </template>

        <template #state-cell="{ row }">
          <UBadge
            :color="(stateColor(row.original.state) as 'primary' | 'success' | 'neutral')"
            variant="subtle"
            size="sm"
          >
            {{ STATE_LABEL[row.original.state] }}
          </UBadge>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-eye"
              label="查看/名单"
              @click="openDetail(row.original.id)"
            />
            <UButton
              v-if="row.original.status === 'published'"
              color="error"
              variant="ghost"
              size="xs"
              icon="i-lucide-ban"
              label="取消活动"
              @click="askCancel(row.original)"
            />
          </div>
        </template>

        <template #empty>
          <div class="py-10 text-center text-sm text-muted">
            暂无活动数据
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

    <UModal
      v-model:open="cancelOpen"
      title="取消活动"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            确定取消活动
            <span class="font-medium">{{ cancelTarget?.title }}</span>
            吗？取消后活动不能再报名或签到，此操作不可恢复。
          </p>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              label="再想想"
              @click="cancelOpen = false"
            />
            <UButton
              color="error"
              label="确认取消"
              :loading="cancelSubmitting"
              @click="onCancel"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
