<script setup lang="ts">
// 图标 safelist 占位：i-carbon-identification i-carbon-enterprise
import type { MediaItem } from '@/api/media'
import type { ShowcaseMediaItem, SubmitVerificationBody, VerificationKind } from '@/api/verification'
import { onLoad } from '@dcloudio/uni-app'
import { computed, reactive, ref, watch } from 'vue'
import { recognizeVerificationImage, submitVerification } from '@/api/verification'

definePage({
  style: { navigationBarTitleText: '提交认证' },
})

function showToast(title: string) {
  uni.showToast({ title, icon: 'none' })
}

const kind = ref<VerificationKind>('personal')
onLoad((query) => {
  if (query?.kind === 'enterprise')
    kind.value = 'enterprise'
})

const personalForm = reactive({ realName: '', idCardNumber: '' })
const enterpriseForm = reactive({ companyName: '', creditCode: '', legalPerson: '' })

const idImages = ref<MediaItem[]>([])
const showcaseItems = ref<MediaItem[]>([])
const introduction = ref('')
const ocrResult = ref<Record<string, unknown> | undefined>(undefined)
const ocrLoading = ref(false)
const submitting = ref(false)
const lastOcrUrl = ref('')

// 证件照上传完成（status=done）后自动 OCR 预填（失败/无结果时用户可手填）。
// 注意：media-uploader 对数组原地修改并 emit 同一引用，浅 watch 不会再次触发，
// 必须监听派生 URL（getter 依赖追踪可感知数组内部的响应式变更）。
watch(() => idImages.value.find(item => item.status === 'done')?.url, async (url) => {
  if (!url || url === lastOcrUrl.value)
    return
  lastOcrUrl.value = url
  ocrLoading.value = true
  try {
    const res = await recognizeVerificationImage(kind.value, url)
    ocrResult.value = res.fields ?? undefined
    if (!res.fields) {
      showToast('未能识别证件信息，请手动填写')
      return
    }
    if (kind.value === 'personal') {
      personalForm.realName = res.fields.realName ?? personalForm.realName
      personalForm.idCardNumber = res.fields.idCardNumber ?? personalForm.idCardNumber
    }
    else {
      enterpriseForm.companyName = res.fields.companyName ?? enterpriseForm.companyName
      enterpriseForm.creditCode = res.fields.creditCode ?? enterpriseForm.creditCode
      enterpriseForm.legalPerson = res.fields.legalPerson ?? enterpriseForm.legalPerson
    }
    showToast('已识别证件信息，请核对后提交')
  }
  catch {
    // alova 层已 toast；保留手填路径
  }
  finally {
    ocrLoading.value = false
  }
})

const verificationImage = computed(() => idImages.value.find(item => item.status === 'done')?.url ?? '')

function buildShowcaseMedia(): ShowcaseMediaItem[] {
  return showcaseItems.value
    .filter(item => item.status === 'done' && !!item.url)
    .map(item => ({
      url: item.url,
      type: item.type === 'video' ? 'video' as const : 'image' as const,
    }))
}

async function submit() {
  const payload = kind.value === 'personal'
    ? { ...personalForm }
    : { ...enterpriseForm }
  if (!verificationImage.value) {
    showToast(kind.value === 'personal' ? '请上传身份证照片' : '请上传营业执照照片')
    return
  }
  if (!Object.values(payload).every(v => v.trim().length > 0)) {
    showToast('请完整填写证件信息')
    return
  }

  submitting.value = true
  try {
    const body: SubmitVerificationBody = {
      kind: kind.value,
      payload,
      verificationImage: verificationImage.value,
      showcaseMedia: buildShowcaseMedia(),
      introduction: introduction.value.trim(),
      ocrResult: ocrResult.value,
    }
    await submitVerification(body)
    showToast('已提交，等待审核')
    uni.navigateBack()
  }
  catch {
    // alova 层已 toast（409 提示由后端 message 透出）
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="px-4 py-4">
    <!-- 第一步：上传证件照 -->
    <view class="mb-4 rounded-2 bg-card p-4">
      <view class="mb-2 text-4 text-ink font-medium">
        {{ kind === 'personal' ? '身份证照片（人像面）' : '营业执照照片' }}
      </view>
      <view class="mb-3 text-3 text-sub">
        上传后自动识别证件信息，识别失败可手动填写
      </view>
      <media-uploader
        v-model="idImages"
        type="image"
        scope="verification"
        :max-count="1"
      />
      <view v-if="ocrLoading" class="mt-2 text-3 text-sub">
        正在识别证件信息…
      </view>
    </view>

    <!-- 第二步：核对证件信息 -->
    <view class="mb-4 rounded-2 bg-card p-4">
      <view class="mb-2 text-4 text-ink font-medium">
        证件信息
      </view>
      <template v-if="kind === 'personal'">
        <wd-input v-model="personalForm.realName" label="真实姓名" placeholder="请输入真实姓名" />
        <wd-input v-model="personalForm.idCardNumber" label="身份证号" placeholder="请输入 18 位身份证号" custom-class="mt-1" />
      </template>
      <template v-else>
        <wd-input v-model="enterpriseForm.companyName" label="企业名称" placeholder="请输入企业名称" />
        <wd-input v-model="enterpriseForm.creditCode" label="信用代码" placeholder="请输入统一社会信用代码" custom-class="mt-1" />
        <wd-input v-model="enterpriseForm.legalPerson" label="法定代表人" placeholder="请输入法定代表人姓名" custom-class="mt-1" />
      </template>
    </view>

    <!-- 第三步：展示相册与介绍（可选） -->
    <view class="mb-4 rounded-2 bg-card p-4">
      <view class="mb-2 text-4 text-ink font-medium">
        {{ kind === 'personal' ? '个人展示（可选）' : '企业展示（可选）' }}
      </view>
      <view class="mb-3 text-3 text-sub">
        认证通过后将在你的主页展示，最多 9 张图片或视频
      </view>
      <media-uploader
        v-model="showcaseItems"
        type="mixed"
        scope="verification"
        multiple
        :max-count="9"
      />
      <view class="mt-3">
        <wd-textarea
          v-model="introduction"
          :maxlength="2000"
          :placeholder="kind === 'personal' ? '介绍一下自己（可选）' : '介绍一下企业（可选）'"
        />
      </view>
    </view>

    <wd-button block :loading="submitting" @click="submit">
      提交认证
    </wd-button>
  </view>
</template>
