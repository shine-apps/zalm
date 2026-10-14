import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useShare } from './useShare'

// 捕获页面注册的小程序生命周期回调
const hooks = vi.hoisted(() => ({
  onShareAppMessage: null as null | ((...args: unknown[]) => unknown),
  onShareTimeline: null as null | ((...args: unknown[]) => unknown),
  onShow: null as null | ((...args: unknown[]) => unknown),
}))

const mocks = vi.hoisted(() => ({ trackShare: vi.fn() }))

vi.mock('@dcloudio/uni-app', () => ({
  onShareAppMessage: (cb: (...args: unknown[]) => unknown) => (hooks.onShareAppMessage = cb),
  onShareTimeline: (cb: (...args: unknown[]) => unknown) => (hooks.onShareTimeline = cb),
  onShow: (cb: (...args: unknown[]) => unknown) => (hooks.onShow = cb),
}))
vi.mock('./tracker', () => ({
  trackShare: mocks.trackShare,
  createPanelId: () => 'p-us1',
}))

function mountWithShare(payloadFactory: () => { title: string, page: string, query?: Record<string, string> }) {
  return mount(defineComponent({
    setup() {
      const share = useShare(payloadFactory)
      return { share }
    },
    render() {
      return h('view')
    },
  }))
}

beforeEach(() => {
  mocks.trackShare.mockClear()
  hooks.onShareAppMessage = null
  hooks.onShareTimeline = null
  ;(uni as unknown as { showShareMenu: ReturnType<typeof vi.fn> }).showShareMenu = vi.fn()
})

describe('useShare · 微信小程序生命周期', () => {
  it('onShow 时显式开启转发/朋友圈菜单', () => {
    mountWithShare(() => ({ title: '活动A', page: '/pages/activity/detail', query: { id: 'a1' } }))
    hooks.onShow?.()
    expect(uni.showShareMenu).toHaveBeenCalledWith({ menus: ['shareAppMessage', 'shareTimeline'] })
  })

  it('onShareAppMessage 返回标题 + 含 query 的 path，并埋点 friend', () => {
    mountWithShare(() => ({ title: '活动A', page: '/pages/activity/detail', query: { id: 'a1' } }))
    const ret = hooks.onShareAppMessage?.() as { title: string, path: string, imageUrl: string }

    expect(ret.title).toBe('活动A')
    expect(ret.path).toBe('/pages/activity/detail?id=a1')
    expect(ret.imageUrl).toBeTruthy()
    expect(mocks.trackShare).toHaveBeenCalledWith(expect.objectContaining({
      event: 'mp_share_trigger',
      channel: 'friend',
      targetId: undefined,
    }))
  })

  it('onShareTimeline 返回 query 字符串（无 path），并埋点 timeline；payload 变化后取最新值', async () => {
    const id = ref('')
    mountWithShare(() => ({
      title: '活动B',
      page: '/pages/activity/detail',
      query: id.value ? { id: id.value } : {},
    }))

    id.value = 'b2'
    await Promise.resolve()

    const ret = hooks.onShareTimeline?.() as { title: string, query: string, imageUrl: string }
    expect(ret.title).toBe('活动B')
    expect(ret.query).toBe('id=b2')
    expect('path' in ret).toBe(false)
    expect(mocks.trackShare).toHaveBeenCalledWith(expect.objectContaining({
      event: 'mp_share_trigger',
      channel: 'timeline',
    }))
  })

  it('openShare 打开面板并上报 panel_open', () => {
    const wrapper = mountWithShare(() => ({ title: '活动C', page: '/pages/index/index' })) as any
    const panelId = wrapper.vm.share.openShare()
    expect(panelId).toBe('p-us1')
    expect(wrapper.vm.share.show.value).toBe(true)
    expect(mocks.trackShare).toHaveBeenCalledWith(expect.objectContaining({ event: 'panel_open' }))
  })
})
