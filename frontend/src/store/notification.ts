import { getUnreadCount } from '@/api/notification'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * 未读通知数（页面刷新式，不做 WebSocket/轮询）：
 * App onLaunch 会话恢复成功后、App 切前台、进入消息页时拉取。
 * 计数不持久化——每次冷启动以服务端为准，避免本地状态过期。
 */
export const useNotificationStore = defineStore('notification', () => {
  const unreadCount = ref(0)
  const hasUnread = computed(() => unreadCount.value > 0)

  /** 拉取未读数；失败静默归零（接口本身带 skipAuthRedirect，游客/401 不打扰）。 */
  async function fetchUnreadCount(): Promise<number> {
    try {
      const { count } = await getUnreadCount()
      unreadCount.value = count
      return count
    }
    catch {
      unreadCount.value = 0
      return 0
    }
  }

  /** 单条已读乐观更新（接口失败时调用方需回滚）。 */
  function decrement(): void {
    if (unreadCount.value > 0)
      unreadCount.value -= 1
  }

  /** 全部已读后清零。 */
  function clear(): void {
    unreadCount.value = 0
  }

  return {
    unreadCount,
    hasUnread,
    fetchUnreadCount,
    decrement,
    clear,
  }
})
