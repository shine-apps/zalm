<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

interface TemplateLocation {
  name: string
  address: string
  latitude: number | null
  longitude: number | null
}

interface TemplateRow {
  id: string
  name: string
  title: string | null
  description: string
  coverUrl: string | null
  location: TemplateLocation | null
  categories: string[]
  startTime: string | null
  endTime: string | null
  registerDeadline: string | null
  capacity: number | null
  points: number | null
  createdBy: string
  createdAt: string
  updatedAt: string
  creatorName: string
  creatorEmail: string
}

interface ListResponse {
  code: 'OK'
  data: TemplateRow[]
  pagination: { page: number, pageSize: number, total: number, totalPages: number }
}

const CATEGORIES = ['爱心物资', '助学帮扶', '传统文化', '乡村振兴', '关爱群体']

const toast = useToast()
const rows = ref<TemplateRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(false)
const searchInput = ref('')
const keyword = ref('')

async function load() {
  loading.value = true
  try {
    const res = await $fetch<ListResponse>('/api/admin/activity-templates', {
      credentials: 'include',
      query: {
        page: page.value,
        pageSize,
        ...(keyword.value ? { keyword: keyword.value } : {})
      }
    })
    rows.value = res.data
    total.value = res.pagination.total
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载模板列表失败'), color: 'error' })
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
watch(page, () => load())

const columns = [
  { accessorKey: 'name', header: '模板名称' },
  { accessorKey: 'title', header: '预设标题' },
  { accessorKey: 'categories', header: '分类' },
  { accessorKey: 'creatorName', header: '创建人' },
  { accessorKey: 'updatedAt', header: '更新时间' },
  { id: 'actions', header: '操作' }
]

// —— 新建 / 编辑 ——
const formOpen = ref(false)
const formSubmitting = ref(false)
const editingId = ref<string | null>(null)

function emptyForm() {
  return {
    name: '',
    title: '',
    description: '',
    coverUrl: '',
    categories: [] as string[],
    locName: '',
    locAddress: '',
    locLatitude: '',
    locLongitude: '',
    startTime: '',
    endTime: '',
    registerDeadline: '',
    capacity: '',
    points: ''
  }
}
const formState = reactive(emptyForm())

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openCreate() {
  editingId.value = null
  Object.assign(formState, emptyForm())
  formOpen.value = true
}

function openEdit(row: TemplateRow) {
  editingId.value = row.id
  Object.assign(formState, {
    ...emptyForm(),
    name: row.name,
    title: row.title ?? '',
    description: row.description ?? '',
    coverUrl: row.coverUrl ?? '',
    categories: [...row.categories],
    locName: row.location?.name ?? '',
    locAddress: row.location?.address ?? '',
    locLatitude: row.location?.latitude != null ? String(row.location.latitude) : '',
    locLongitude: row.location?.longitude != null ? String(row.location.longitude) : '',
    startTime: isoToLocalInput(row.startTime),
    endTime: isoToLocalInput(row.endTime),
    registerDeadline: isoToLocalInput(row.registerDeadline),
    capacity: row.capacity != null ? String(row.capacity) : '',
    points: row.points != null ? String(row.points) : ''
  })
  formOpen.value = true
}

function toggleCategory(c: string) {
  const i = formState.categories.indexOf(c)
  if (i >= 0) formState.categories.splice(i, 1)
  else formState.categories.push(c)
}

function validateForm(s: typeof formState): FormError[] {
  const errors: FormError[] = []
  const name = s.name.trim()
  if (name.length < 2 || name.length > 30) errors.push({ name: 'name', message: '模板名称需 2~30 个字' })
  const title = s.title.trim()
  if (title && (title.length < 2 || title.length > 50)) {
    errors.push({ name: 'title', message: '预设标题需 2~50 个字（留空表示不预设）' })
  }
  if (s.description.length > 2000) errors.push({ name: 'description', message: '活动详情不能超过 2000 字' })
  if (s.coverUrl.trim() && !/^https?:\/\/.+/.test(s.coverUrl.trim())) {
    errors.push({ name: 'coverUrl', message: '封面需为合法 http(s) 链接（留空表示不预设）' })
  }
  const locName = s.locName.trim()
  const locAddress = s.locAddress.trim()
  if (locName.length > 100) errors.push({ name: 'locName', message: '地点名称不超过 100 字' })
  if (locAddress.length > 200) errors.push({ name: 'locAddress', message: '详细地址不超过 200 字' })
  if (locName || locAddress) {
    if (!locName) errors.push({ name: 'locName', message: '预设地点时名称必填（或清空整组地点字段）' })
    if (!locAddress) errors.push({ name: 'locAddress', message: '预设地点时地址必填（或清空整组地点字段）' })
  }
  const lat = s.locLatitude.trim()
  const lng = s.locLongitude.trim()
  if ((lat === '') !== (lng === '')) {
    errors.push({ name: 'locLatitude', message: '经纬度必须同时提供或同时留空' })
  }
  if (lat && (Number.isNaN(Number(lat)) || Number(lat) < -90 || Number(lat) > 90)) {
    errors.push({ name: 'locLatitude', message: '纬度范围 -90 ~ 90' })
  }
  if (lng && (Number.isNaN(Number(lng)) || Number(lng) < -180 || Number(lng) > 180)) {
    errors.push({ name: 'locLongitude', message: '经度范围 -180 ~ 180' })
  }
  if (s.startTime && Number.isNaN(new Date(s.startTime).getTime())) {
    errors.push({ name: 'startTime', message: '开始时间格式不正确' })
  }
  if (s.endTime && Number.isNaN(new Date(s.endTime).getTime())) {
    errors.push({ name: 'endTime', message: '结束时间格式不正确' })
  }
  if (s.capacity.trim() !== '') {
    const cap = Number(s.capacity)
    if (!Number.isInteger(cap) || cap < 1 || cap > 99999) {
      errors.push({ name: 'capacity', message: '人数上限需为 1~99999 的整数（留空不预设）' })
    }
  }
  if (s.points.trim() !== '') {
    const pts = Number(s.points)
    if (!Number.isInteger(pts) || pts < 0 || pts > 9999) {
      errors.push({ name: 'points', message: '参与积分需为 0~9999 的整数（留空不预设）' })
    }
  }
  return errors
}

/** 组装请求体；留空字段统一映射为 null（不预设/清空），分类空数组表示未预设。 */
function buildPayload() {
  const s = formState
  const locName = s.locName.trim()
  const locAddress = s.locAddress.trim()
  const hasLocation = !!locName || !!locAddress
  const lat = s.locLatitude.trim()
  const lng = s.locLongitude.trim()
  const toIso = (v: string) => (v ? new Date(v).toISOString() : null)
  return {
    name: s.name.trim(),
    title: s.title.trim() ? s.title.trim() : null,
    description: s.description,
    coverUrl: s.coverUrl.trim() || null,
    categories: [...s.categories],
    location: hasLocation
      ? {
          name: locName,
          address: locAddress,
          latitude: lat ? Number(lat) : null,
          longitude: lng ? Number(lng) : null
        }
      : null,
    startTime: toIso(s.startTime),
    endTime: toIso(s.endTime),
    registerDeadline: toIso(s.registerDeadline),
    capacity: s.capacity.trim() === '' ? null : Number(s.capacity),
    points: s.points.trim() === '' ? null : Number(s.points)
  }
}

async function onSubmit(_e: FormSubmitEvent<typeof formState>) {
  formSubmitting.value = true
  const payload = buildPayload()
  try {
    if (editingId.value) {
      await $fetch(`/api/admin/activity-templates/${editingId.value}`, {
        method: 'PUT',
        credentials: 'include',
        body: payload
      })
      toast.add({ title: '模板已更新', color: 'success' })
    } else {
      await $fetch('/api/admin/activity-templates', {
        method: 'POST',
        credentials: 'include',
        body: payload
      })
      toast.add({ title: '模板创建成功', color: 'success' })
    }
    formOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    formSubmitting.value = false
  }
}

// —— 地图选点 ——
const mapPickerOpen = ref(false)

function openMapPicker() {
  mapPickerOpen.value = true
}

function onMapPicked(loc: { name: string, address: string, latitude: number, longitude: number }) {
  formState.locName = loc.name
  formState.locAddress = loc.address
  formState.locLatitude = String(loc.latitude)
  formState.locLongitude = String(loc.longitude)
}

/** 已有合法坐标时作为地图初始中心。 */
const mapInitial = computed(() => {
  const lat = Number(formState.locLatitude)
  const lng = Number(formState.locLongitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && formState.locLatitude.trim() !== ''
    ? { latitude: lat, longitude: lng }
    : null
})

// —— 删除 ——
const deleteOpen = ref(false)
const deleteTarget = ref<TemplateRow | null>(null)
const deleteSubmitting = ref(false)

function askDelete(row: TemplateRow) {
  deleteTarget.value = row
  deleteOpen.value = true
}

async function onDelete() {
  if (!deleteTarget.value) return
  deleteSubmitting.value = true
  try {
    await $fetch(`/api/admin/activity-templates/${deleteTarget.value.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    toast.add({ title: '模板已删除', color: 'success' })
    deleteOpen.value = false
    await load()
  } catch (err) {
    toast.add({ title: apiErrorMessage(err), color: 'error' })
  } finally {
    deleteSubmitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">
          活动模板
        </h1>
        <p class="text-sm text-muted mt-1">
          组织者发布活动时可套用模板预填信息；除模板名称外所有字段均可留空
        </p>
      </div>
      <UButton
        label="新建模板"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </div>

    <UInput
      v-model="searchInput"
      placeholder="搜索模板名称 / 预设标题"
      icon="i-lucide-search"
      class="w-full sm:w-80"
      clearable
    />

    <UCard>
      <UTable
        :data="rows"
        :columns="columns"
        :loading="loading"
      >
        <template #name-cell="{ row }">
          <span class="font-medium">{{ row.original.name }}</span>
        </template>

        <template #title-cell="{ row }">
          <span class="text-sm">{{ row.original.title || '—' }}</span>
        </template>

        <template #categories-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="c in row.original.categories"
              :key="c"
              color="primary"
              variant="subtle"
              size="xs"
            >
              {{ c }}
            </UBadge>
            <span
              v-if="!row.original.categories.length"
              class="text-sm text-muted"
            >—</span>
          </div>
        </template>

        <template #creatorName-cell="{ row }">
          <span class="text-sm">{{ row.original.creatorName || row.original.creatorEmail }}</span>
        </template>

        <template #updatedAt-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDateTime(row.original.updatedAt) }}</span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-pencil"
              label="编辑"
              @click="openEdit(row.original)"
            />
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              label="删除"
              @click="askDelete(row.original)"
            />
          </div>
        </template>

        <template #empty>
          <div class="py-10 text-center text-sm text-muted">
            暂无活动模板
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

    <!-- 新建 / 编辑模板 -->
    <UModal
      v-model:open="formOpen"
      :title="editingId ? '编辑活动模板' : '新建活动模板'"
      class="w-full max-w-2xl"
    >
      <template #body>
        <UForm
          :state="formState"
          :validate="validateForm"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            label="模板名称"
            name="name"
            required
            hint="仅用于后台和模板选择列表，2~30 字"
          >
            <UInput
              v-model="formState.name"
              class="w-full"
              placeholder="例如：常规社区敬老活动"
            />
          </UFormField>

          <UFormField
            label="预设活动标题"
            name="title"
            hint="留空表示不预设，创建活动时手填"
          >
            <UInput
              v-model="formState.title"
              class="w-full"
              placeholder="2~50 字"
            />
          </UFormField>

          <UFormField label="预设分类（可多选，可不选）">
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="c in CATEGORIES"
                :key="c"
                :color="formState.categories.includes(c) ? 'primary' : 'neutral'"
                :variant="formState.categories.includes(c) ? 'solid' : 'outline'"
                size="xs"
                :label="c"
                @click="toggleCategory(c)"
              />
            </div>
          </UFormField>

          <UFormField
            label="预设活动详情"
            name="description"
          >
            <UTextarea
              v-model="formState.description"
              :rows="3"
              maxlength="2000"
              class="w-full"
              placeholder="介绍活动内容、注意事项等（不超过 2000 字）"
            />
          </UFormField>

          <UFormField
            label="预设封面图 URL"
            name="coverUrl"
          >
            <UInput
              v-model="formState.coverUrl"
              class="w-full"
              placeholder="https://…（留空表示不预设）"
            />
          </UFormField>

          <div class="rounded-md border border-default p-3 space-y-3">
            <div class="flex items-center">
              <p class="text-sm font-medium">
                预设活动地点
                <span class="text-muted font-normal">（整组留空表示不预设）</span>
              </p>
              <UButton
                label="地图选点"
                icon="i-lucide-map-pinned"
                size="xs"
                color="neutral"
                variant="outline"
                class="ml-auto"
                @click="openMapPicker"
              />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UFormField
                label="地点名称"
                name="locName"
              >
                <UInput
                  v-model="formState.locName"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="详细地址"
                name="locAddress"
              >
                <UInput
                  v-model="formState.locAddress"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="纬度"
                name="locLatitude"
              >
                <UInput
                  v-model="formState.locLatitude"
                  type="number"
                  step="0.000001"
                  class="w-full"
                  placeholder="-90 ~ 90"
                />
              </UFormField>
              <UFormField
                label="经度"
                name="locLongitude"
              >
                <UInput
                  v-model="formState.locLongitude"
                  type="number"
                  step="0.000001"
                  class="w-full"
                  placeholder="-180 ~ 180"
                />
              </UFormField>
            </div>
          </div>

          <div class="rounded-md border border-default p-3 space-y-3">
            <p class="text-sm font-medium">
              预设时间
              <span class="text-muted font-normal">（通常留空，由组织者创建活动时填写）</span>
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <UFormField
                label="开始时间"
                name="startTime"
              >
                <UInput
                  v-model="formState.startTime"
                  type="datetime-local"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="结束时间"
                name="endTime"
              >
                <UInput
                  v-model="formState.endTime"
                  type="datetime-local"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="报名截止"
                name="registerDeadline"
              >
                <UInput
                  v-model="formState.registerDeadline"
                  type="datetime-local"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UFormField
              label="预设人数上限"
              name="capacity"
              hint="留空表示不预设"
            >
              <UInput
                v-model="formState.capacity"
                type="number"
                min="1"
                max="99999"
                class="w-full"
                placeholder="1~99999"
              />
            </UFormField>
            <UFormField
              label="预设参与积分"
              name="points"
              hint="留空表示不预设，0 = 不计分"
            >
              <UInput
                v-model="formState.points"
                type="number"
                min="0"
                max="9999"
                class="w-full"
                placeholder="0~9999"
              />
            </UFormField>
          </div>

          <div class="flex justify-end gap-2 pt-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              label="取消"
              @click="formOpen = false"
            />
            <UButton
              type="submit"
              :label="editingId ? '保存' : '创建'"
              :loading="formSubmitting"
            />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- 删除确认 -->
    <UModal
      v-model:open="deleteOpen"
      title="删除活动模板"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            确定删除模板
            <span class="font-medium">{{ deleteTarget?.name }}</span>
            吗？已基于该模板创建的活动不受影响。
          </p>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              label="取消"
              @click="deleteOpen = false"
            />
            <UButton
              color="error"
              label="确认删除"
              :loading="deleteSubmitting"
              @click="onDelete"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- 地图选点（key 来自 GET /api/settings 的 map.qqmap_key） -->
    <MapLocationPickerModal
      v-model:open="mapPickerOpen"
      :initial="mapInitial"
      @select="onMapPicked"
    />
  </div>
</template>
