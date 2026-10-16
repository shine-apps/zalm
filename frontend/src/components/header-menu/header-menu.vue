<script lang="ts" setup>
export interface HeaderMenuItem {
  key: string
  label: string
  /** 完整 UnoCSS 图标类名（静态写死，确保被扫描生成） */
  icon: string
  danger?: boolean
}

const props = defineProps<{
  show: boolean
  /** fixed 头部总高度 + 偏移，用于下拉卡片的 top 定位 */
  topOffset: number
  menuItems: HeaderMenuItem[]
}>()

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
      class="fixed left-3 z-[1002] w-130 overflow-hidden rounded-3 bg-card pb-4 shadow-lg"
      :style="{ top: `${topOffset + 4}px` }"
    >
      <view
        v-for="(item, index) in menuItems"
        :key="item.key"
        class="flex items-center px-4 py-2.5 text-3.5"
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
