<script setup lang="ts">
/**
 * 腾讯位置服务「地图选点组件」选点弹窗（PC 后台用）。
 *
 * 实现说明：按官方文档以 iframe 内嵌 https://apis.map.qq.com/tools/locpicker
 * （type=1）。关键词搜索、地图拖拽选点、周边推荐均由腾讯组件自带，本组件只负责：
 * - 用 window message 接收选点结果（校验 event.origin === 'https://apis.map.qq.com'
 *   且 event.data.module === 'locationPicker'，防其他页面伪造/串扰）；
 * - 将回传的 { latlng, poiname, poiaddress, cityname } 映射为业务侧的
 *   PickedLocation { name, address, latitude, longitude }，与既有表单字段一一对应；
 * - Key 运行时从公开接口 GET /api/settings 的 map.qqmap_key 获取；iframe 载入
 *   用 referrerpolicy=no-referrer 绕过 Key 域名白名单，组件内部 WebService 调用
 *   则按官方 FAQ 要求在 Key 白名单中加入组件域名 apis.map.qq.com；
 * - 按官方 FAQ 给 iframe 加 allow="geolocation *" 委派定位授权（选点组件内置定位）。
 */

interface LocPickerMessage {
  module?: string
  latlng?: { lat?: number, lng?: number }
  poiaddress?: string
  poiname?: string
  cityname?: string
}

interface PickedLocation {
  name: string
  address: string
  latitude: number
  longitude: number
}

const props = defineProps<{
  /** 已有坐标时作为地图初始中心并预置标记（编辑模板场景）。 */
  initial?: { latitude: number | string, longitude: number | string } | null
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  select: [location: PickedLocation]
}>()

const LOCPICKER_ORIGIN = 'https://apis.map.qq.com'
const LOCPICKER_URL = 'https://apis.map.qq.com/tools/locpicker'
const REFERER_NAME = 'zhongailianmeng'

const mapKey = ref('')
const keyLoading = ref(false)
const keyLoaded = ref(false)
const latest = ref<PickedLocation | null>(null)
const iframeUrl = ref('')

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

async function loadKey() {
  if (keyLoaded.value) return
  keyLoading.value = true
  try {
    const res = await $fetch<{ code: 'OK', data: Record<string, unknown> }>('/api/settings')
    const v = res.data?.[SETTING_KEYS.MAP_QQMAP_KEY]
    mapKey.value = typeof v === 'string' ? v.trim() : ''
  } catch {
    mapKey.value = ''
  } finally {
    keyLoaded.value = true
    keyLoading.value = false
  }
}

/** 生成官方选点组件 iframe 地址（type=1：iframe 内嵌；search=1 显示搜索区）。 */
function buildUrl(key: string): string {
  const params = new URLSearchParams({
    type: '1',
    search: '1',
    policy: '1',
    mapdraggable: '1',
    zoom: '16',
    coordtype: '5',
    key,
    referer: REFERER_NAME
  })
  const lat = Number(props.initial?.latitude)
  const lng = Number(props.initial?.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set('coord', `${lat},${lng}`)
  }
  return `${LOCPICKER_URL}?${params.toString()}`
}

/** 接收选点组件回传（官方协议：module === 'locationPicker'），映射为业务数据结构。 */
function onMessage(event: MessageEvent) {
  if (event.origin !== LOCPICKER_ORIGIN) return
  const data = event.data as LocPickerMessage | null
  if (!data || data.module !== 'locationPicker') return
  const lat = Number(data.latlng?.lat)
  const lng = Number(data.latlng?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
  const name = data.poiname?.trim() || data.poiaddress?.trim() || data.cityname?.trim() || '已选位置'
  const address = data.poiaddress?.trim() || data.cityname?.trim() || name
  latest.value = {
    name,
    address,
    latitude: round6(lat),
    longitude: round6(lng)
  }
}

function teardown() {
  iframeUrl.value = ''
  latest.value = null
}

function confirmPick() {
  if (!latest.value) return
  emit('select', latest.value)
  open.value = false
}

watch(open, async (visible) => {
  if (!visible) {
    teardown()
    return
  }
  latest.value = null
  await loadKey()
  if (!open.value) return
  if (!mapKey.value) return
  iframeUrl.value = buildUrl(mapKey.value)
})

onMounted(() => {
  window.addEventListener('message', onMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  teardown()
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="地图选点"
    class="w-full max-w-3xl"
  >
    <template #body>
      <div class="space-y-3">
        <div
          v-if="keyLoading"
          class="flex items-center justify-center py-24 text-sm text-muted"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="mr-2 size-4 animate-spin"
          />
          正在加载地图配置…
        </div>

        <div
          v-else-if="!mapKey"
          class="flex flex-col items-center justify-center gap-3 py-16 text-center"
        >
          <UIcon
            name="i-lucide-map-pinned-off"
            class="size-10 text-muted"
          />
          <p class="text-sm text-muted max-w-sm">
            尚未配置腾讯位置服务 Key，地图选点不可用。请先到
            <span class="font-medium">设置管理</span>
            页面填写 Key（需开启 WebServiceAPI，并在域名白名单中加入组件域名 apis.map.qq.com）。
          </p>
          <UButton
            label="前往设置管理"
            icon="i-lucide-settings-2"
            color="neutral"
            variant="outline"
            @click="open = false; navigateTo('/admin/settings')"
          />
        </div>

        <template v-else>
          <!-- 官方选点组件（iframe 内嵌）：搜索、拖拽选点、周边推荐与定位均由组件提供 -->
          <div class="relative overflow-hidden rounded-md border border-default">
            <iframe
              v-if="iframeUrl"
              :src="iframeUrl"
              class="block h-[380px] w-full bg-muted/30 sm:h-[520px]"
              frameborder="0"
              allow="geolocation *"
              referrerpolicy="no-referrer"
              title="腾讯地图选点"
            />
            <div
              v-else
              class="flex h-[380px] items-center justify-center bg-muted/30 text-sm text-muted sm:h-[520px]"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="mr-2 size-4 animate-spin"
              />
              地图加载中…
            </div>
          </div>

          <div class="rounded-md bg-muted/40 px-3 py-2 text-sm min-h-10">
            <template v-if="latest">
              <p class="font-medium">
                {{ latest.name }}
              </p>
              <p
                v-if="latest.address"
                class="text-muted mt-0.5 text-xs break-all"
              >
                {{ latest.address }}
              </p>
              <p class="text-muted mt-0.5 font-mono text-xs">
                {{ latest.latitude }}, {{ latest.longitude }}
              </p>
            </template>
            <p
              v-else
              class="text-muted text-xs leading-5"
            >
              在上方地图组件中搜索地点、拖拽地图或点选推荐位置，选点结果会实时同步到此处；确认无误后点击「使用此位置」。
            </p>
          </div>

          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              label="取消"
              @click="open = false"
            />
            <UButton
              label="使用此位置"
              icon="i-lucide-check"
              :disabled="!latest"
              @click="confirmPick"
            />
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
