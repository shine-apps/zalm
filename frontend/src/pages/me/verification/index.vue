<script setup lang="ts">
// 菜单图标经数据动态绑定，需在此注释占位，确保 UnoCSS 扫描生成对应样式：
// i-carbon-identification i-carbon-enterprise
import type { MyVerifications, VerificationKind, VerificationStatus } from '@/api/verification'
import { onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { fetchMyVerifications } from '@/api/verification'

definePage({
  style: { navigationBarTitleText: '实名认证' },
})

const KIND_LABELS: Record<VerificationKind, string> = {
  personal: '个人认证',
  enterprise: '企业认证',
}
const KIND_DESCS: Record<VerificationKind, string> = {
  personal: '提交身份证完成个人实名认证',
  enterprise: '提交营业执照完成企业认证',
}
const KIND_ICONS: Record<VerificationKind, string> = {
  personal: 'i-carbon-identification',
  enterprise: 'i-carbon-enterprise',
}
const STATUS_META: Record<VerificationStatus, { label: string, cls: string }> = {
  pending: { label: '审核中', cls: 'bg-hover text-sub' },
  approved: { label: '已认证', cls: 'bg-primary-soft text-primary-soft-text' },
  rejected: { label: '已驳回', cls: 'bg-danger-soft text-danger' },
}

const data = ref<MyVerifications>({ personal: null, enterprise: null })
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    data.value = await fetchMyVerifications()
  }
  catch {
    // alova 层已 toast
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  void load()
})

function applyFor(kind: VerificationKind) {
  uni.navigateTo({ url: `/pages/me/verification/apply?kind=${kind}` })
}
</script>

<template>
  <view class="px-4 py-4">
    <view
      v-for="kind in (['personal', 'enterprise'] as const)"
      :key="kind"
      class="mb-4 rounded-2 bg-card p-4"
    >
      <view class="flex items-center justify-between">
        <view class="flex items-center">
          <view :class="KIND_ICONS[kind]" class="mr-2 text-6 text-primary" />
          <view>
            <view class="text-4 text-ink font-medium">
              {{ KIND_LABELS[kind] }}
            </view>
            <view class="mt-1 text-3 text-sub">
              {{ KIND_DESCS[kind] }}
            </view>
          </view>
        </view>
        <text
          v-if="data[kind]"
          class="rounded px-2 py-0.5 text-3"
          :class="STATUS_META[data[kind]!.status].cls"
        >
          {{ STATUS_META[data[kind]!.status].label }}
        </text>
      </view>

      <view
        v-if="data[kind]?.status === 'rejected' && data[kind]!.rejectReason"
        class="mt-3 rounded bg-danger-soft px-3 py-2 text-3 text-danger"
      >
        驳回原因：{{ data[kind]!.rejectReason }}
      </view>

      <view class="mt-3">
        <wd-button
          v-if="!data[kind] || data[kind]!.status === 'rejected'"
          size="small"
          @click="applyFor(kind)"
        >
          {{ data[kind]?.status === 'rejected' ? '重新提交' : '去认证' }}
        </wd-button>
        <wd-button v-else-if="data[kind]!.status === 'pending'" size="small" disabled>
          等待审核
        </wd-button>
      </view>
    </view>
  </view>
</template>
