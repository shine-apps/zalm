/**
 * 跨端复制文本：
 * - 小程序/App：uni.setClipboardData（成功时容器自带“内容已复制”提示）；
 * - H5：优先 Clipboard API（要求安全上下文），降级隐藏 textarea + execCommand。
 */

export type CopyVia = 'uni' | 'clipboard-api' | 'exec-command'

export interface CopyResult {
  via: CopyVia
  /** uni 渠道已由系统给出原生提示，调用方不必再 toast 成功。 */
  nativeHint: boolean
}

/** H5 专用：textarea + execCommand 兜底复制（非 HTTPS / 旧浏览器）。 */
async function copyWithExecCommand(text: string): Promise<boolean> {
  if (typeof document === 'undefined') {
    return false
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  }
  catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}

/**
 * 复制文本到剪贴板。失败时抛出 Error，由 UI 弹出手动复制弹窗。
 */
export async function copyText(text: string): Promise<CopyResult> {
  const content = (text || '').trim()
  if (!content) {
    throw new Error('复制内容为空')
  }

  let result: CopyResult | null = null

  // #ifndef H5
  await new Promise<void>((resolve, reject) => {
    uni.setClipboardData({
      data: content,
      success: () => resolve(),
      fail: err => reject(new Error(err?.errMsg || '复制失败')),
    })
  })
  result = { via: 'uni', nativeHint: true }
  // #endif

  // #ifdef H5
  let via: CopyVia = 'clipboard-api'
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content)
    }
    else {
      throw new Error('clipboard api unavailable')
    }
  }
  catch {
    const ok = await copyWithExecCommand(content)
    if (!ok) {
      throw new Error('复制失败，请手动选择文本复制')
    }
    via = 'exec-command'
  }
  result = { via, nativeHint: false }
  // #endif

  return result as CopyResult
}
