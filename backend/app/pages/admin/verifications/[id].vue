<script setup lang="ts">
interface ApplicantInfo {
  name: string
  email: string
}

interface VerificationDetail {
  id: string
  kind: 'personal' | 'enterprise'
  status: 'pending' | 'approved' | 'rejected'
  payload: Record<string, string>
  verificationImage: string
  showcaseMedia: { url: string, type: 'image' | 'video' }[]
  introduction: string
  ocrResult: Record<string, unknown> | null
  rejectReason: string | null
  createdAt: string
  applicant?: ApplicantInfo
}

interface DetailResponse {
  code: 'OK'
  data: VerificationDetail
}

const toast = useToast()
const route = useRoute()
const router = useRouter()
const id = route.params.id as string

const detail = ref<VerificationDetail | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await $fetch<DetailResponse>(`/api/admin/verifications/${id}`, {
      credentials: 'include'
    })
    detail.value = res.data
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '加载认证详情失败'), color: 'error' })
  } finally {
    loading.value = false
  }
}

const FIELD_LABELS: Record<string, string> = {
  realName: '真实姓名',
  idCardNumber: '身份证号',
  companyName: '企业名称',
  creditCode: '统一社会信用代码',
  legalPerson: '法定代表人'
}

// 用户填写 vs OCR 识别比对：OCR 有值且与用户不一致的行高亮
const compareFields = computed(() => {
  const d = detail.value
  if (!d) return [] as { key: string, label: string, user: string, ocr: string, differs: boolean }[]
  const keys = d.kind === 'personal' ? ['realName', 'idCardNumber'] : ['companyName', 'creditCode', 'legalPerson']
  return keys.map((key) => {
    const user = String(d.payload[key] ?? '')
    const ocr = d.ocrResult?.[key] == null ? '—' : String(d.ocrResult[key])
    return { key, label: FIELD_LABELS[key] ?? key, user, ocr, differs: ocr !== '—' && user !== ocr }
  })
})

const reviewing = ref(false)
const rejectOpen = ref(false)
const rejectReason = ref('')

async function review(action: 'approve' | 'reject') {
  if (reviewing.value) return
  reviewing.value = true
  try {
    await $fetch(`/api/admin/verifications/${id}/review`, {
      method: 'POST',
      credentials: 'include',
      body: action === 'reject' ? { action, rejectReason: rejectReason.value.trim() } : { action }
    })
    toast.add({ title: action === 'approve' ? '已通过' : '已驳回', color: 'success' })
    rejectOpen.value = false
    router.push('/admin/verifications')
  } catch (err) {
    toast.add({ title: apiErrorMessage(err, '操作失败'), color: 'error' })
  } finally {
    reviewing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-left"
        label="返回列表"
        @click="router.push('/admin/verifications')"
      />
      <h1 class="text-xl font-semibold">
        认证审核详情
      </h1>
    </div>

    <div
      v-if="loading && !detail"
      class="py-10 text-center text-sm text-muted"
    >
      加载中…
    </div>

    <template v-else-if="detail">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <span>
              申请人：{{ detail.applicant?.name ?? '—' }}
              <span class="text-sm text-muted">（{{ detail.applicant?.email ?? '' }}）</span>
            </span>
            <UBadge
              :color="detail.status === 'pending' ? 'warning' : detail.status === 'approved' ? 'success' : 'error'"
              variant="subtle"
            >
              {{ detail.status === 'pending' ? '待审核' : detail.status === 'approved' ? '已通过' : '已驳回' }}
            </UBadge>
          </div>
        </template>

        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 class="mb-2 text-sm font-medium">
              {{ detail.kind === 'personal' ? '身份证照片（人像面）' : '营业执照照片' }}
            </h3>
            <img
              :src="detail.verificationImage"
              class="max-h-64 rounded border border-default"
              alt="证件照"
            >
          </div>
          <div>
            <h3 class="mb-2 text-sm font-medium">
              用户填写 vs OCR 识别
            </h3>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted">
                  <th class="py-1 pr-2 font-normal">
                    字段
                  </th>
                  <th class="py-1 pr-2 font-normal">
                    用户填写
                  </th>
                  <th class="py-1 font-normal">
                    OCR 识别
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="f in compareFields"
                  :key="f.key"
                  :class="f.differs ? 'text-error' : ''"
                >
                  <td class="py-1 pr-2">
                    {{ f.label }}
                  </td>
                  <td class="py-1 pr-2">
                    {{ f.user }}
                  </td>
                  <td class="py-1">
                    {{ f.ocr }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p
              v-if="!detail.ocrResult"
              class="mt-2 text-xs text-muted"
            >
              无 OCR 识别记录（用户手动填写）
            </p>
          </div>
        </div>
      </UCard>

      <UCard v-if="detail.showcaseMedia.length > 0 || detail.introduction">
        <template #header>
          展示资料（认证通过后将在其个人主页公开）
        </template>
        <div
          v-if="detail.showcaseMedia.length > 0"
          class="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4"
        >
          <template
            v-for="m in detail.showcaseMedia"
            :key="m.url"
          >
            <img
              v-if="m.type === 'image'"
              :src="m.url"
              class="h-28 w-full rounded object-cover"
              alt="展示图"
            >
            <video
              v-else
              :src="m.url"
              controls
              class="h-28 w-full rounded object-cover"
            />
          </template>
        </div>
        <p
          v-if="detail.introduction"
          class="whitespace-pre-wrap text-sm"
        >
          {{ detail.introduction }}
        </p>
      </UCard>

      <div
        v-if="detail.status === 'pending'"
        class="flex gap-3"
      >
        <UButton
          color="success"
          icon="i-lucide-check"
          label="通过"
          :loading="reviewing"
          @click="review('approve')"
        />
        <UButton
          color="error"
          variant="soft"
          icon="i-lucide-x"
          label="驳回"
          @click="rejectOpen = true"
        />
      </div>
      <UAlert
        v-else
        :color="detail.status === 'approved' ? 'success' : 'error'"
        variant="subtle"
        :title="detail.status === 'approved' ? '该申请已通过' : `该申请已驳回：${detail.rejectReason ?? ''}`"
      />
    </template>

    <UModal
      v-model:open="rejectOpen"
      title="驳回原因"
    >
      <template #body>
        <UTextarea
          v-model="rejectReason"
          :rows="4"
          placeholder="请填写驳回原因（将通知申请人）"
          class="w-full"
        />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="取消"
            @click="rejectOpen = false"
          />
          <UButton
            color="error"
            label="确认驳回"
            :loading="reviewing"
            :disabled="!rejectReason.trim()"
            @click="review('reject')"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
