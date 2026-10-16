<script setup lang="ts">
/**
 * 腾讯位置服务「位置拾取器」选点弹窗（PC 后台用）。
 *
 * 实现说明：不使用腾讯官方 locpicker iframe 组件——它内部会再嵌套一层定位
 * helper（apis.map.qq.com/tools/geolocation），该内层 iframe 的 sandbox/allow
 * 由腾讯生成，外部无法通过 allow 属性向其委派 geolocation 权限，导致用户浏览器
 * 控制台必然出现 Permissions policy violation（其逆地理回调还会读空崩溃）。
 *
 * 这里改为在本页面文档内直接加载腾讯 GL JS（libraries=service）自建选点器：
 * - 全程不调用 navigator.geolocation（无定位授权、无 policy 违规）；
 * - 关键词提示走 TMap.service.Suggestion，逆地址解析走 Geocoder.getAddress；
 * - Key 运行时从公开接口 GET /api/settings 的 map.qqmap_key 获取；
 * - GL JS 的瓦片/JSONP 请求遵守文档 referrer 策略，弹窗打开期间临时切换
 *   no-referrer（未加白名单的 localhost 也能加载），关闭时恢复。
 */

interface LatLngShape {
  getLat?: () => number
  getLng?: () => number
  lat?: number
  lng?: number
}

interface AddressResultShape {
  status: number
  message?: string
  result: {
    address: string
    formatted_addresses?: { recommend?: string, rough?: string }
    pois?: Array<{ title: string, address?: string, location: LatLngShape }>
  }
}

interface SuggestionItemShape {
  id: string
  title: string
  address: string
  location: LatLngShape
}

interface SuggestionResultShape {
  status: number
  message?: string
  data: SuggestionItemShape[]
}

interface TMapLatLng {
  getLat(): number
  getLng(): number
}

interface TMapEvent {
  latlng: TMapLatLng
  geometry?: { id: string, position: TMapLatLng }
}

interface TMapMarker {
  on(event: string, handler: (evt: TMapEvent) => void): unknown
  updateGeometries(list: Array<{ id: string, position: TMapLatLng }>): unknown
  setMap(map: unknown): unknown
}

interface TMapMap {
  on(event: string, handler: (evt: TMapEvent) => void): unknown
  easeTo(opts: { center: TMapLatLng, zoom: number }): unknown
  getZoom(): number
  destroy(): unknown
}

interface TMapNamespace {
  Map: new (el: HTMLElement, opts: { center: TMapLatLng, zoom: number }) => TMapMap
  LatLng: new (lat: number, lng: number) => TMapLatLng
  MarkerStyle: new (opts: Record<string, unknown>) => unknown
  MultiMarker: new (opts: {
    id?: string
    map: TMapMap
    styles: Record<string, unknown>
    geometries: Array<{ id: string, position: TMapLatLng }>
  }) => TMapMarker
  service: {
    Geocoder: new () => {
      getAddress(params: { location: TMapLatLng, getPoi?: boolean }): Promise<AddressResultShape>
    }
    Suggestion: new (opts?: { pageSize?: number }) => {
      getSuggestions(params: { keyword: string, location?: TMapLatLng }): Promise<SuggestionResultShape>
    }
  }
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

const DEFAULT_CENTER: [number, number] = [39.908823, 116.397470] // 北京天安门；搜索默认全国
const ZOOM_INITIAL = 16
const ZOOM_DEFAULT = 12

const mapKey = ref('')
const keyLoading = ref(false)
const keyLoaded = ref(false)
const mapLoading = ref(false)
const mapError = ref('')
const keyword = ref('')
const suggestions = ref<SuggestionItemShape[]>([])
const suggestLoading = ref(false)
const showSuggestions = ref(false)
const resolving = ref(false)
const latest = ref<PickedLocation | null>(null)

const mapEl = ref<HTMLElement | null>(null)
let map: TMapMap | null = null
let marker: TMapMarker | null = null
let geocoder: InstanceType<TMapNamespace['service']['Geocoder']> | null = null
let suggestionService: InstanceType<TMapNamespace['service']['Suggestion']> | null = null
let center: TMapLatLng | null = null
let session = 0
let suggestTimer: ReturnType<typeof setTimeout> | null = null
let savedReferrer: { el: HTMLMetaElement | null, content: string | null } | null = null

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

function latOf(p: LatLngShape): number {
  return typeof p.getLat === 'function' ? p.getLat() : Number(p.lat)
}

function lngOf(p: LatLngShape): number {
  return typeof p.getLng === 'function' ? p.getLng() : Number(p.lng)
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

/** GL JS 按文档 Referer 校验 Key 白名单；打开期间临时 no-referrer，关闭恢复。 */
function enableNoReferrer() {
  if (savedReferrer) return
  let meta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]')
  if (meta) {
    savedReferrer = { el: meta, content: meta.getAttribute('content') }
    meta.setAttribute('content', 'no-referrer')
  } else {
    meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    savedReferrer = { el: null, content: null }
  }
}

function restoreReferrer() {
  if (!savedReferrer) return
  if (savedReferrer.el) {
    if (savedReferrer.content === null) {
      savedReferrer.el.removeAttribute('content')
    } else {
      savedReferrer.el.setAttribute('content', savedReferrer.content)
    }
  } else {
    document.querySelector('meta[name="referrer"]')?.remove()
  }
  savedReferrer = null
}

let loaderPromise: Promise<TMapNamespace> | null = null

function loadTMap(key: string): Promise<TMapNamespace> {
  const w = window as Window & { TMap?: TMapNamespace }
  if (w.TMap) return Promise.resolve(w.TMap)
  if (loaderPromise) return loaderPromise
  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://map.qq.com/api/gljs?v=1.exp&libraries=service&key=${encodeURIComponent(key)}`
    script.async = true
    script.referrerPolicy = 'no-referrer'
    script.onload = () => {
      if (w.TMap) resolve(w.TMap)
      else {
        loaderPromise = null
        reject(new Error('TMap 加载完成但全局对象缺失'))
      }
    }
    script.onerror = () => {
      script.remove()
      loaderPromise = null
      reject(new Error('腾讯地图脚本加载失败（请检查网络与 Key 配置）'))
    }
    document.head.appendChild(script)
  })
  return loaderPromise
}

function setLatest(lat: number, lng: number, name: string, address: string) {
  latest.value = {
    name: name || address || '已选位置',
    address: address || name,
    latitude: round6(lat),
    longitude: round6(lng)
  }
}

async function reverseGeocode(point: TMapLatLng, sid: number) {
  if (!geocoder) return
  resolving.value = true
  const lat = point.getLat()
  const lng = point.getLng()
  latest.value = { name: '正在解析地址…', address: '', latitude: round6(lat), longitude: round6(lng) }
  try {
    const res = await geocoder.getAddress({ location: point, getPoi: true })
    if (sid !== session || !open.value) return
    if (res.status !== 0) throw new Error(res.message || `逆地址解析失败（${res.status}）`)
    const r = res.result
    // formatted_addresses 在部分坐标/被策略拦截路径上可能缺失，必须空值兜底
    const poi = r.pois?.[0]
    const recommend = r.formatted_addresses?.recommend?.trim()
    setLatest(
      lat,
      lng,
      poi?.title?.trim() || recommend || r.address,
      poi?.address?.trim() || recommend || r.address
    )
  } catch (err) {
    if (sid !== session || !open.value) return
    setLatest(lat, lng, '已选位置', err instanceof Error ? `地址解析失败：${err.message}` : '')
  } finally {
    if (sid === session) resolving.value = false
  }
}

function placeMarker(point: TMapLatLng, reverse: boolean) {
  marker?.updateGeometries([{ id: 'picked', position: point }])
  if (reverse) void reverseGeocode(point, session)
}

function initMap(NS: TMapNamespace, sid: number) {
  if (!mapEl.value || sid !== session) return
  const lat = Number(props.initial?.latitude)
  const lng = Number(props.initial?.longitude)
  const hasInitial = Number.isFinite(lat) && Number.isFinite(lng)
  center = new NS.LatLng(hasInitial ? lat : DEFAULT_CENTER[0], hasInitial ? lng : DEFAULT_CENTER[1])

  map = new NS.Map(mapEl.value, { center, zoom: hasInitial ? ZOOM_INITIAL : ZOOM_DEFAULT })
  marker = new NS.MultiMarker({
    map,
    styles: {
      default: new NS.MarkerStyle({
        width: 25,
        height: 35,
        anchor: { x: 13, y: 35 },
        draggable: true
      })
    },
    geometries: hasInitial ? [{ id: 'picked', position: center }] : []
  })
  geocoder = new NS.service.Geocoder()
  suggestionService = new NS.service.Suggestion({ pageSize: 10 })

  map.on('click', (evt) => {
    if (sid !== session) return
    const p = evt.latlng
    map?.easeTo({ center: p, zoom: Math.max(map?.getZoom() ?? ZOOM_DEFAULT, 15) })
    placeMarker(p, true)
  })
  map.on('idle', () => {
    if (sid === session) mapLoading.value = false
  })
  marker.on('dragend', (evt) => {
    if (sid !== session || !evt.geometry) return
    const p = evt.geometry.position
    map?.easeTo({ center: p, zoom: Math.max(map?.getZoom() ?? ZOOM_DEFAULT, 15) })
    void reverseGeocode(p, sid)
  })
}

function applySuggestion(item: SuggestionItemShape) {
  if (!center) return
  const NS = (window as Window & { TMap?: TMapNamespace }).TMap
  if (!NS) return
  const lat = latOf(item.location)
  const lng = lngOf(item.location)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
  const point = new NS.LatLng(lat, lng)
  center = point
  map?.easeTo({ center: point, zoom: ZOOM_INITIAL })
  marker?.updateGeometries([{ id: 'picked', position: point }])
  setLatest(lat, lng, item.title, item.address)
  keyword.value = item.title
  showSuggestions.value = false
}

let searchSeq = 0

async function runSuggestion() {
  const kw = keyword.value.trim()
  if (!kw || !suggestionService) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }
  const seq = ++searchSeq
  suggestLoading.value = true
  try {
    const res = await suggestionService.getSuggestions({ keyword: kw })
    if (seq !== searchSeq || !open.value) return
    if (res.status === 0) {
      suggestions.value = res.data ?? []
      showSuggestions.value = suggestions.value.length > 0
    } else {
      suggestions.value = []
      showSuggestions.value = false
    }
  } catch {
    if (seq === searchSeq) {
      suggestions.value = []
      showSuggestions.value = false
    }
  } finally {
    if (seq === searchSeq) suggestLoading.value = false
  }
}

function onKeywordInput() {
  if (suggestTimer) clearTimeout(suggestTimer)
  if (!keyword.value.trim()) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }
  suggestTimer = setTimeout(() => void runSuggestion(), 300)
}

function onSearchFocus() {
  if (suggestions.value.length > 0) showSuggestions.value = true
}

function teardown() {
  session += 1
  searchSeq += 1
  if (suggestTimer) clearTimeout(suggestTimer)
  suggestTimer = null
  try {
    marker?.setMap(null)
  } catch {
    // 忽略销毁时序问题
  }
  try {
    map?.destroy()
  } catch {
    // 忽略销毁时序问题
  }
  map = null
  marker = null
  geocoder = null
  suggestionService = null
  center = null
  latest.value = null
  keyword.value = ''
  suggestions.value = []
  showSuggestions.value = false
  resolving.value = false
  mapLoading.value = false
  mapError.value = ''
  restoreReferrer()
}

function confirmPick() {
  if (!latest.value || resolving.value) return
  emit('select', latest.value)
  open.value = false
}

watch(open, async (visible) => {
  if (!visible) {
    teardown()
    return
  }
  const sid = ++session
  latest.value = null
  mapError.value = ''
  await loadKey()
  if (sid !== session || !open.value) return
  if (!mapKey.value) return
  enableNoReferrer()
  mapLoading.value = true
  await nextTick()
  try {
    const NS = await loadTMap(mapKey.value)
    if (sid !== session || !open.value || !mapEl.value) return
    initMap(NS, sid)
    // idle 事件在缓存瓦片场景下可能很快触发；兜底 1.2s 关闭 loading
    setTimeout(() => {
      if (sid === session) mapLoading.value = false
    }, 1200)
  } catch (err) {
    if (sid !== session) return
    mapLoading.value = false
    mapError.value = err instanceof Error ? err.message : '地图加载失败'
    restoreReferrer()
  }
})

onBeforeUnmount(teardown)
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
            页面填写 Key（需开启 WebServiceAPI 并将正式域名加入授权白名单）。
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
          <!-- 搜索：关键词提示，不涉及浏览器定位 -->
          <div class="relative">
            <UInput
              v-model="keyword"
              class="w-full"
              placeholder="搜索地点，如：衢州市民政局"
              icon="i-lucide-search"
              :loading="suggestLoading"
              autocomplete="off"
              @input="onKeywordInput"
              @focus="onSearchFocus"
            />
            <div
              v-if="showSuggestions"
              class="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-md border border-default bg-default shadow-lg"
            >
              <button
                v-for="item in suggestions"
                :key="item.id"
                type="button"
                class="block w-full px-3 py-2 text-left hover:bg-muted/50"
                @mousedown.prevent="applySuggestion(item)"
              >
                <p class="truncate text-sm font-medium">
                  {{ item.title }}
                </p>
                <p class="text-muted truncate text-xs">
                  {{ item.address }}
                </p>
              </button>
            </div>
          </div>

          <div class="relative overflow-hidden rounded-md border border-default">
            <div
              ref="mapEl"
              class="h-[300px] w-full bg-muted/30 sm:h-[420px]"
            />
            <div
              v-if="mapLoading"
              class="absolute inset-0 flex items-center justify-center bg-default/60 text-sm text-muted"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="mr-2 size-4 animate-spin"
              />
              地图加载中…
            </div>
            <div
              v-if="mapError"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-default/80 p-6 text-center text-sm text-error"
            >
              <UIcon
                name="i-lucide-triangle-alert"
                class="size-6"
              />
              {{ mapError }}
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
              搜索地点，或在地图上点击 / 拖动标记选择位置，确认无误后点击「使用此位置」。
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
              :disabled="!latest || resolving"
              @click="confirmPick"
            />
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
