<script setup lang="ts">
interface ApplicantInfo {
  name: string
  email: string
}

interface VerificationRow {
  id: string
  kind: 'personal' | 'enterprise'
  status: 'pending' | 'approved' | 'rejected'
  payload: Record<string, string>
  createdAt: string
  applicant?: ApplicantInfo
}

interface ListResponse {
  code: 'OK'
  data: VerificationRow[]
  pagination: { page: number, pageSize: number, total: number, totalPages: number }
}

const toast = useToast()
const router = useRouter()

const rows = ref<VerificationRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const status = ref<'pending' | 'approved' | 'rejected' | 'all'>('pending')
const kind = ref<'personal' | 'enterprise' | 'all'>('all')

const statusItems = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
  { label: '全部状态', value: 'all' }
]
const kindItems = [
  { label: '个人认证', value: 'personal' },
  { label: '企业认证', value: 'enterprise' },
  { label: '全部类型', value: 'all' }
]

async function load() {
  loading.value = true
  try {
    const res = await $fetch<ListResponse>('/api/admin/verifications', {
      credentials: 'include',
      query: {
        page: page.value,
        pageSize,
        ...(status.value !== 'all' ? { status: status.value } : {}),
        ...(kind.value !== 'all' ? { kind: kind.value } : {})
      }
    })
    rows.value = res.data
    total.value = res.pagination.total
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载认证申请失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

watch([status, kind], () => {
  page.value = 1
  load()
})
watch(page, () => load())

const KIND_LABEL: Record<VerificationRow['kind'], string> = {
  personal: '个人认证',
  enterprise: '企业认证'
}
const STATUS_LABEL: Record<VerificationRow['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回'
}
const STATUS_COLOR: Record<VerificationRow['status'], 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error'
}

const columns = [
  { id: 'applicant', header: '申请人' },
  { accessorKey: 'kind', header: '类型' },
  { id: 'summary', header: '证件信息' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'createdAt', header: '提交时间' },
  { id: 'actions', header: '操作' }
]

function summaryOf(row: VerificationRow): string {
  return row.payload.realName ?? row.payload.companyName ?? '—'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function openDetail(id: string) {
  router.push(`/admin/verifications/${id}`)
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-semibold">
        认证审核
      </h1>
      <p class="text-sm text-muted mt-1">
        共 {{ total }} 条申请
      </p>
    </div>

    <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <USelect
        v-model="status"
        :items="statusItems"
        class="w-full sm:w-36"
      />
      <USelect
        v-model="kind"
        :items="kindItems"
        class="w-full sm:w-36"
      />
    </div>

    <UCard>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
        class="hidden md:block"
      >
        <template #applicant-cell="{ row }">
          <div class="text-sm">
            {{ row.original.applicant?.name ?? '—' }}
          </div>
          <div class="text-xs text-muted">
            {{ row.original.applicant?.email ?? '' }}
          </div>
        </template>

        <template #kind-cell="{ row }">
          <span class="text-sm">{{ KIND_LABEL[row.original.kind] }}</span>
        </template>

        <template #summary-cell="{ row }">
          <span class="text-sm">{{ summaryOf(row.original) }}</span>
        </template>

        <template #status-cell="{ row }">
          <UBadge
            :color="STATUS_COLOR[row.original.status]"
            variant="subtle"
            size="sm"
          >
            {{ STATUS_LABEL[row.original.status] }}
          </UBadge>
        </template>

        <template #createdAt-cell="{ row }">
          <span class="text-sm text-muted">{{ formatTime(row.original.createdAt) }}</span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-eye"
              label="审核"
              @click="openDetail(row.original.id)"
            />
          </div>
        </template>

        <template #empty>
          <div class="py-10 text-center text-sm text-muted">
            暂无认证申请
          </div>
        </template>
      </UTable>

      <!-- 移动端卡片列表 -->
      <div class="md:hidden">
        <div
          v-if="loading && !rows.length"
          class="py-10 text-center text-sm text-muted"
        >
          加载中…
        </div>
        <div
          v-else-if="!rows.length"
          class="py-10 text-center text-sm text-muted"
        >
          暂无认证申请
        </div>
        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="row in rows"
            :key="row.id"
            class="py-4 space-y-2"
          >
            <div class="flex items-start justify-between gap-3">
              <p class="font-medium min-w-0">
                {{ row.applicant?.name ?? '—' }} · {{ KIND_LABEL[row.kind] }}
              </p>
              <UBadge
                :color="STATUS_COLOR[row.status]"
                variant="subtle"
                size="sm"
                class="shrink-0"
              >
                {{ STATUS_LABEL[row.status] }}
              </UBadge>
            </div>
            <p class="text-sm text-muted">
              {{ summaryOf(row) }}
            </p>
            <p class="text-sm text-muted">
              {{ formatTime(row.createdAt) }}
            </p>
            <div class="flex gap-2 pt-1">
              <UButton
                color="primary"
                variant="soft"
                size="sm"
                icon="i-lucide-eye"
                label="审核"
                class="flex-1"
                @click="openDetail(row.id)"
              />
            </div>
          </li>
        </ul>
      </div>

      <div
        v-if="total > pageSize"
        class="flex justify-center border-t border-default px-4 pt-4"
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
