<script lang="ts" setup>
definePage({
  style: {
    navigationBarTitleText: '关于',
  },
})

/** 使命与愿景（静态运营文案，后续可配化时迁移到接口） */
const mission = '一对一助力困境学生安心学业'
const vision = '让每一份善意精准抵达，让弱势群体被看见'

/**
 * 联系方式。value 为空串时渲染「待提供」且整行不可点。
 * 未来提供真实信息后的点击约定：
 * - phone：uni.makePhoneCall({ phoneNumber: value })
 * - email / address / wechat：uni.setClipboardData 复制后 toast 提示
 */
type ContactType = 'phone' | 'address' | 'email' | 'wechat'

interface ContactItem {
  type: ContactType
  label: string
  icon: string
  value: string
}

const contacts: ContactItem[] = [
  { type: 'phone', label: '联系电话', icon: 'i-carbon-phone', value: '' },
  { type: 'address', label: '联系地址', icon: 'i-carbon-location', value: '' },
  { type: 'email', label: '电子邮箱', icon: 'i-carbon-email', value: '' },
  { type: 'wechat', label: '微信公众号', icon: 'i-carbon-chat', value: '' },
]
</script>

<template>
  <view class="min-h-screen bg-page px-3 py-3">
    <!-- 品牌头部 -->
    <view class="flex flex-col items-center py-5">
      <view class="brand-badge h-60px w-60px center rounded-4 text-8 text-white font-bold">
        众
      </view>
      <view class="mt-3 text-6 text-ink font-bold">
        众爱联盟
      </view>
      <view class="mt-1 text-3.5 text-muted tracking-widest">
        仁心济世 · 善行天下
      </view>
    </view>

    <!-- 组织简介 -->
    <view class="rounded-3 bg-card p-4 shadow-sm">
      <view class="mb-2 flex items-center text-4.5 text-ink font-semibold">
        <view class="mr-2 h-12px w-3px rounded-full bg-primary" />
        组织简介
      </view>
      <text class="text-3.5 text-sub leading-7">
        众爱联盟是社会公益组织，以「一对一」结对帮扶为核心，助力困境学生安心学业；同时承接爱心物资发送，弘扬中华优秀传统文化，助力乡村振兴，关爱老人、儿童及贫困、孱弱、残疾人群。
      </text>
    </view>

    <!-- 使命与愿景 -->
    <view class="mt-3 rounded-3 bg-card p-4 shadow-sm">
      <view class="mb-3 flex items-center text-4.5 text-ink font-semibold">
        <view class="mr-2 h-12px w-3px rounded-full bg-primary" />
        使命与愿景
      </view>
      <view class="flex gap-2">
        <view class="flex-1 rounded-2 bg-primary-soft p-3">
          <view class="text-primary-soft-text text-3.5 font-semibold">
            使命
          </view>
          <view class="mt-1.5 text-3.5 text-sub leading-6">
            {{ mission }}
          </view>
        </view>
        <view class="flex-1 rounded-2 bg-primary-soft p-3">
          <view class="text-primary-soft-text text-3.5 font-semibold">
            愿景
          </view>
          <view class="mt-1.5 text-3.5 text-sub leading-6">
            {{ vision }}
          </view>
        </view>
      </view>
    </view>

    <!-- 联系我们（信息未提供前均为「待提供」，不可点） -->
    <view class="mt-3 rounded-3 bg-card px-4 py-1 shadow-sm">
      <view
        v-for="(item, index) in contacts"
        :key="item.type"
        class="flex items-center py-3"
        :class="index > 0 ? 'border-t border-line' : ''"
      >
        <view class="h-8 w-8 center rounded-lg bg-primary-soft">
          <view :class="item.icon" class="text-primary-soft-text text-4" />
        </view>
        <text class="ml-3 text-4 text-sub">
          {{ item.label }}
        </text>
        <text class="ml-auto text-3.5 text-muted">
          {{ item.value || '待提供' }}
        </text>
      </view>
    </view>

    <!-- 版本号 -->
    <view class="py-5 text-center text-3 text-muted">
      众爱联盟 v1.0.0
    </view>
  </view>
</template>

<style scoped lang="scss">
.brand-badge {
  background: var(--c-primary-gradient);
}
</style>
