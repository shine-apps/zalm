<script lang="ts" setup>
export interface HeaderMenuItem {
  key: string
  label: string
  /** 完整 UnoCSS 图标类名（静态写死，确保被扫描生成） */
  icon: string
  danger?: boolean
}

const props = withDefaults(defineProps<{
  show: boolean
  /** fixed 头部总高度 + 偏移，用于下拉卡片的 top 定位 */
  topOffset: number
  menuItems: HeaderMenuItem[]
  /** 下拉卡片贴靠的屏幕侧：default 布局贴左，simpleNav 布局贴右 */
  side?: 'left' | 'right'
}>(), {
  side: 'left',
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  'select': [key: string]
}>()

function close() {
  emit('update:show', false)
}

function handleSelect(item: HeaderMenuItem) {
  close()
  emit('select', item.key)
}
</script>

<template>
  <template v-if="show">
    <!-- 透明遮罩：拦截点击关闭 -->
    <view class="fixed inset-0 z-[1001]" @click="close" />

    <!-- 下拉卡片 -->
    <view
      class="fixed-menu-card fixed z-[1002] w-50 overflow-hidden rounded-3 bg-card pb-4 shadow-lg"
      :class="props.side === 'right' ? 'fixed-menu-card--right right-3' : 'left-3'"
      :style="{ top: `${topOffset + 4}px` }"
    >
      <view
        v-for="(item, index) in menuItems"
        :key="item.key"
        class="flex items-center justify-end px-4 py-2.5 text-3.5"
        :class="[
          index > 0 ? 'border-t border-line' : '',
          item.danger ? 'text-danger' : 'text-sub',
        ]"
        @click="handleSelect(item)"
      >
        <view :class="item.icon" class="text-4" />
        <text class="ml-2">{{ item.label }}</text>
      </view>
    </view>
  </template>
</template>

<style scoped lang="scss">
/* #ifdef H5 */
// 桌面宽屏下下拉卡片跟随 uni-app 容器左边缘（+12px 导航栏 padding）定位
.fixed-menu-card {
  @media (min-width: 1024px) {
    left: 50%;
    transform: translateX(-372px);
  }
}

// 右贴靠变体：卡片贴容器右边缘（-12px 导航栏 padding），供 simpleNav 布局使用
.fixed-menu-card--right {
  @media (min-width: 1024px) {
    left: auto;
    right: calc(50% - 372px);
    transform: none;
  }
}
/* #endif */
</style>
