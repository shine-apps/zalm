import { computed, ref } from 'vue'

/**
 * 列表页通用「页码 + 触底加载」状态机。
 * fetcher 返回 { data, total }；reload() 回到第 1 页，loadMore() 触底调用。
 */
export function usePagedList<T>(
  fetcher: (page: number) => Promise<{ data: T[], total: number }>,
  pageSize = 10,
) {
  const items = ref<T[]>([])
  const page = ref(0)
  const total = ref(0)
  const loading = ref(false)
  const finished = computed(() => items.value.length >= total.value && total.value > 0)
  const empty = computed(() => !loading.value && items.value.length === 0)

  async function reload(): Promise<void> {
    loading.value = true
    try {
      const next = await fetcher(1)
      items.value = next.data
      total.value = next.total
      page.value = 1
    }
    catch {
      // 错误 toast 已由请求拦截器处理；此处吞掉避免调用方 void reload() 产生 unhandled rejection
    }
    finally {
      loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (loading.value || finished.value)
      return
    loading.value = true
    try {
      const next = await fetcher(page.value + 1)
      // ref<T[]> 的深度解包会让泛型 T 与 UnwrapRefSimple<T> 在 push 处不兼容，调用点断言为 T[]
      ;(items.value as T[]).push(...next.data)
      total.value = next.total
      page.value += 1
    }
    catch {
      // 同 reload：拦截器已 toast，吞掉避免 unhandled rejection
    }
    finally {
      loading.value = false
    }
  }

  return { items, total, page, loading, finished, empty, reload, loadMore }
}
