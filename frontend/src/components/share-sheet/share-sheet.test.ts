import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareSheet from './share-sheet.vue'

// 平台/剪贴板/JSSDK/埋点全部 mock，测试只聚焦组件分支与交互
const state = vi.hoisted(() => ({
  platform: 'pc-h5' as string,
  webShare: false,
}))
const mocks = vi.hoisted(() => ({
  trackShare: vi.fn(),
  copyText: vi.fn(),
  configWxShare: vi.fn(),
}))

vi.mock('@/share/platform', () => ({
  getPlatform: () => state.platform,
  supportsWebShare: () => state.webShare,
}))
vi.mock('@/share/tracker', () => ({ trackShare: mocks.trackShare }))
vi.mock('@/share/clipboard', () => ({ copyText: mocks.copyText }))
vi.mock('@/share/wx-js-sdk', () => ({ configWxShare: mocks.configWxShare }))

const payload = {
  title: '秋日助学走访',
  desc: '2026-11-01 09:00-12:00 · 中山公园',
  page: '/pages/activity/detail',
  query: { id: 'act-123' },
  targetType: 'activity',
  targetId: 'act-123',
}

function mountSheet(props: Partial<{ show: boolean, panelId: string }> = {}) {
  return mount(ShareSheet, {
    props: { payload, panelId: 'p-test', show: false, ...props },
    global: {
      stubs: { 'wd-popup': { template: '<div v-if="$props.modelValue"><slot /></div>', props: ['modelValue'] } },
    },
  })
}

/**
 * 按选项标题点击宫格：点击标题 <text>，事件冒泡到绑定 handler 的选项 <view>。
 * 不能按 view 文本匹配——单选项时外层容器的 textContent 也等于标题。
 */
function clickOption(wrapper: VueWrapper, title: string) {
  const target = wrapper.findAll('text').find(n => n.text().trim() === title)
  if (!target) {
    throw new Error(`未找到选项：${title}；实际文本：${wrapper.text().slice(0, 200)}`)
  }
  return target.trigger('click')
}

beforeEach(() => {
  state.platform = 'pc-h5'
  state.webShare = false
  mocks.trackShare.mockClear()
  mocks.copyText.mockReset()
  mocks.configWxShare.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('share-sheet · pc-h5', () => {
  it('只展示复制链接选项与 PC 提示', () => {
    const wrapper = mountSheet({ show: true })
    expect(wrapper.text()).toContain('复制链接')
    expect(wrapper.text()).not.toContain('微信好友')
    expect(wrapper.text()).toContain('粘贴到微信')
  })

  it('面板关闭时不渲染内容', () => {
    const wrapper = mountSheet({ show: false })
    expect(wrapper.text()).not.toContain('复制链接')
  })

  it('复制成功时调用 copyText、埋点并 toast，且关闭面板', async () => {
    mocks.copyText.mockResolvedValue({ via: 'clipboard-api', nativeHint: false })
    const wrapper = mountSheet({ show: true })

    await clickOption(wrapper, '复制链接')

    expect(mocks.copyText).toHaveBeenCalledWith(
      'http://localhost:3000/#/pages/activity/detail?id=act-123',
    )
    const events = mocks.trackShare.mock.calls.map(c => c[0].event)
    expect(events).toContain('channel_select')
    expect(events).toContain('copy_success')
    expect(uni.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '链接已复制' }))
    expect(wrapper.emitted('update:show')?.at(-1)).toEqual([false])
  })

  it('复制失败时埋点 copy_fail 并弹手动复制 modal', async () => {
    mocks.copyText.mockRejectedValue(new Error('复制失败'))
    const wrapper = mountSheet({ show: true })

    await clickOption(wrapper, '复制链接')

    const events = mocks.trackShare.mock.calls.map(c => c[0].event)
    expect(events).toContain('copy_fail')
    expect(uni.showModal).toHaveBeenCalled()
  })
})

describe('share-sheet · wx-h5', () => {
  it('展示微信好友/朋友圈/复制链接三项', () => {
    state.platform = 'wx-h5'
    const wrapper = mountSheet({ show: true })
    expect(wrapper.text()).toContain('微信好友')
    expect(wrapper.text()).toContain('朋友圈')
    expect(wrapper.text()).toContain('复制链接')
  })

  it('点微信好友：预设卡片后展示「发送给朋友」引导遮罩并埋点', async () => {
    state.platform = 'wx-h5'
    mocks.configWxShare.mockResolvedValue(true)
    const wrapper = mountSheet({ show: true })

    await clickOption(wrapper, '微信好友')

    expect(mocks.configWxShare).toHaveBeenCalledWith(expect.objectContaining({
      title: '秋日助学走访',
      link: 'http://localhost:3000/#/pages/activity/detail?id=act-123',
    }))
    expect(wrapper.text()).toContain('发送给朋友')
    expect(wrapper.text()).toContain('点击右上角')
    const events = mocks.trackShare.mock.calls.map(c => ({ e: c[0].event, ch: c[0].channel }))
    expect(events).toContainEqual({ e: 'channel_select', ch: 'friend' })
    expect(events).toContainEqual({ e: 'wx_config_ok', ch: 'friend' })
    expect(events).toContainEqual({ e: 'guide_show', ch: 'friend' })

    // 点击遮罩任意处关闭
    const overlay = wrapper.find('.fixed.inset-0')
    await overlay.trigger('click')
    expect(wrapper.text()).not.toContain('发送给朋友')
  })

  it('签名不可用时埋点 wx_config_fail，但仍展示引导', async () => {
    state.platform = 'wx-h5'
    mocks.configWxShare.mockResolvedValue(false)
    const wrapper = mountSheet({ show: true })

    await clickOption(wrapper, '朋友圈')

    const events = mocks.trackShare.mock.calls.map(c => ({ e: c[0].event, ch: c[0].channel }))
    expect(events).toContainEqual({ e: 'wx_config_fail', ch: 'timeline' })
    expect(events).toContainEqual({ e: 'guide_show', ch: 'timeline' })
    expect(wrapper.text()).toContain('分享到朋友圈')
  })
})

describe('share-sheet · mobile-h5', () => {
  it('支持 Web Share 时展示系统分享选项', () => {
    state.platform = 'mobile-h5'
    state.webShare = true
    const wrapper = mountSheet({ show: true })
    expect(wrapper.text()).toContain('系统分享')
  })
})

describe('share-sheet · mp-weixin', () => {
  it('不渲染宫格面板，打开时改为系统引导弹窗', async () => {
    state.platform = 'mp-weixin'
    mocks.copyText.mockResolvedValue({ via: 'uni', nativeHint: true })
    const wrapper = mountSheet({ show: false })

    expect(wrapper.text()).not.toContain('微信好友')
    await wrapper.setProps({ show: true })
    await wrapper.vm.$nextTick()

    expect(uni.showModal).toHaveBeenCalled()
  })
})
