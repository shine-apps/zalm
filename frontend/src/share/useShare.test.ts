import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharePayload } from './types'
import { useShare } from './useShare'

// 捕获页面注册的小程序生命周期回调
const hooks = vi.hoisted(() => ({
  onShareAppMessage: null as null | ((...args: unknown[]) => unknown),
  onShareTimeline: null as null | ((...args: unknown[]) => unknown),
  onShow: null as null | ((...args: unknown[]) => unknown),
  onShowList: [] as Array<() => unknown>,
  onHideList: [] as Array<() => unknown>,
}))

const mocks = vi.hoisted(() => ({
  trackShare: vi.fn(),
  configWxShare: vi.fn(),
  platform: 'pc-h5' as 'pc-h5' | 'wx-h5',
}))

vi.mock('@dcloudio/uni-app', () => ({
  onShareAppMessage: (cb: (...args: unknown[]) => unknown) => (hooks.onShareAppMessage = cb),
  onShareTimeline: (cb: (...args: unknown[]) => unknown) => (hooks.onShareTimeline = cb),
  onShow: (cb: () => unknown) => {
    hooks.onShow = cb
    hooks.onShowList.push(cb)
  },
  onHide: (cb: () => unknown) => {
    hooks.onHideList.push(cb)
  },
}))
vi.mock('./tracker', () => ({
  trackShare: mocks.trackShare,
  createPanelId: () => 'p-us1',
}))
vi.mock('./platform', () => ({
  getPlatform: () => mocks.platform,
}))
vi.mock('./wx-js-sdk', () => ({
  configWxShare: mocks.configWxShare,
}))

function mountWithShare(payloadFactory: () => SharePayload) {
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
  mocks.configWxShare.mockReset()
  mocks.configWxShare.mockResolvedValue(true)
  mocks.platform = 'pc-h5'
  hooks.onShareAppMessage = null
  hooks.onShareTimeline = null
  hooks.onShow = null
  hooks.onShowList = []
  hooks.onHideList = []
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

describe('useShare · 微信 H5 卡片预设', () => {
  it('页面 setup 后按 payload 预设卡片', async () => {
    mocks.platform = 'wx-h5'
    mountWithShare(() => ({ title: '首页', page: '/pages/index/index' }))
    await flushPromises()

    expect(mocks.configWxShare).toHaveBeenCalledWith(expect.objectContaining({
      title: '首页',
      link: expect.stringContaining('/#/pages/index/index'),
    }))
  })

  it('从详情页返回时 onShow 重新预设本页卡片，覆盖上一页残留', async () => {
    mocks.platform = 'wx-h5'
    mountWithShare(() => ({ title: '首页', page: '/pages/index/index' }))
    await flushPromises()

    // 进入详情页：本页隐藏
    hooks.onHideList.forEach(cb => cb())
    mocks.configWxShare.mockClear()

    // 返回首页：微信卡片是全局状态，需在 onShow 用本页 payload 重新覆盖
    hooks.onShowList.forEach(cb => cb())
    await flushPromises()

    expect(mocks.configWxShare).toHaveBeenCalledWith(expect.objectContaining({
      title: '首页',
      link: expect.stringContaining('/#/pages/index/index'),
    }))
  })

  it('页面隐藏后 payload 变化不再改写全局卡片', async () => {
    mocks.platform = 'wx-h5'
    const page = ref<SharePayload>({ title: '首页', page: '/pages/index/index' })
    mountWithShare(() => page.value)
    await flushPromises()
    mocks.configWxShare.mockClear()

    hooks.onHideList.forEach(cb => cb())
    page.value = { title: '活动详情', page: '/pages/activity/detail', query: { id: 'a1' } }
    await flushPromises()

    expect(mocks.configWxShare).not.toHaveBeenCalled()
  })
})
