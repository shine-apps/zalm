<script lang="ts" setup>
defineOptions({
  name: 'Home',
})
definePage({
  // 使用 type: "home" 属性设置首页，其他页面不需要设置，默认为page
  type: 'home',
  layout: 'blank',
  style: {
    navigationBarTitleText: '首页',
  },
})

/**
 * 五大业务入口。本轮均无落地页，点击统一提示「即将上线」；
 * 后续二级页就绪后，把 tap 行为换成 uni.navigateTo 即可。
 */
const entries = [
  { key: 'aiding', label: '助学帮扶', icon: 'i-carbon-education' },
  { key: 'supplies', label: '爱心物资', icon: 'i-carbon-delivery-parcel' },
  { key: 'culture', label: '传统文化', icon: 'i-carbon-book' },
  { key: 'village', label: '乡村振兴', icon: 'i-carbon-location-heart' },
  { key: 'care', label: '关爱群体', icon: 'i-carbon-user-multiple' },
] as const

/** Banner 主按钮：去关于页了解组织 */
function goAbout() {
  uni.navigateTo({ url: '/pages/about/about' })
}

/** 业务入口本期均未上线 */
function comingSoon() {
  uni.showToast({ title: '板块即将上线，敬请期待', icon: 'none' })
}
</script>

<template>
  <view class="min-h-screen bg-page px-3 py-3">
    <!-- 使命 Banner：渐变走主题变量，深浅色自动跟随 -->
    <view class="mission-banner relative overflow-hidden rounded-4 p-5">
      <!-- 右下角「众」字水印，纯文字装饰，不新增图片资源 -->
      <view
        class="pointer-events-none absolute text-white font-bold -bottom-6 -right-1"
        style="font-size: 120rpx; opacity: 0.08"
      >
        众
      </view>

      <view class="text-3 text-white tracking-widest" style="opacity: 0.9">
        众爱联盟 · ZHONG AI LIAN MENG
      </view>
      <view class="mt-2 text-6 text-white font-bold leading-8">
        一对一助力
        <br>
        困境学生安心学业
      </view>
      <view class="mt-2 text-3.5 text-white leading-6" style="opacity: 0.85">
        承接爱心物资发送 · 弘扬传统文化
        <br>
        助力乡村振兴 · 关爱弱势群体
      </view>
      <view
        class="text-primary-soft-text mt-4 inline-block rounded-full bg-white px-4 py-1.5 text-3.5 font-semibold"
        @click="goAbout"
      >
        了解我们 ›
      </view>
    </view>

    <!-- 信念条 -->
    <view class="mt-3 flex items-center rounded-2 bg-primary-soft px-3 py-2.5">
      <view class="text-primary-soft-text i-carbon-favorite mr-2 text-4" />
      <text class="text-primary-soft-text text-3.5">
        让每一份善意，一对一精准抵达需要的人
      </text>
    </view>

    <!-- 五大业务入口：flex 五等宽，兼容小程序；点击均为占位提示 -->
    <view class="mt-3 flex rounded-3 bg-card py-4 shadow-sm">
      <view
        v-for="item in entries"
        :key="item.key"
        class="flex-1"
        @click="comingSoon"
      >
        <view class="flex flex-col items-center">
          <view class="h-40px w-40px center rounded-2 bg-primary-soft">
            <view :class="item.icon" class="text-primary-soft-text text-20px" />
          </view>
          <text class="mt-1.5 text-3.5 text-sub">
            {{ item.label }}
          </text>
        </view>
      </view>
    </view>

    <!-- 底部落款 -->
    <view class="mt-8 pb-4 text-center text-3 text-muted tracking-widest">
      仁心济世 · 善行天下
    </view>
  </view>
</template>

<style scoped lang="scss">
.mission-banner {
  background: var(--c-primary-gradient);
}
</style>
