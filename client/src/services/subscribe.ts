import Taro from '@tarojs/taro'

const getTemplateIds = () => {
  const ids = [SUBSCRIBE_TPL_TODO, SUBSCRIBE_TPL_TASK_UPDATE, SUBSCRIBE_TPL_REVIEW, SUBSCRIBE_TPL_WORK]
  return ids.filter((id) => typeof id === 'string' && id.trim().length > 0) as string[]
}

const STORAGE_KEY = 'taskmate_subscribe_prompted_v1'
const SKIP_THRESHOLD_MS = 300

const GUIDE_TITLE = '订阅消息'
const GUIDE_CONTENT =
  '如果之前选择了“不再询问”，请在右上角“…” → 设置 → 订阅消息 中开启。'

const openSubscribeSettings = async () => {
  if (typeof (Taro as any)?.openSetting !== 'function') return false
  try {
    await (Taro as any).openSetting({ withSubscriptions: true })
    return true
  } catch (err) {
    if (TASK_DEBUG) {
      console.log('open setting failed', err)
    }
    return false
  }
}

const showSubscribeGuide = async () => {
  const canOpen = typeof (Taro as any)?.openSetting === 'function'
  const res = await Taro.showModal({
    title: GUIDE_TITLE,
    content: GUIDE_CONTENT,
    confirmText: canOpen ? '去设置' : '知道了',
    cancelText: canOpen ? '知道了' : undefined,
    showCancel: canOpen,
  })
  if (res.confirm && canOpen) {
    await openSubscribeSettings()
  }
}

export const guideSubscribeSettings = async () => {
  await showSubscribeGuide()
}

export const requestTaskSubscribeAuth = async (options?: { force?: boolean; onSkipped?: () => void }) => {
  if (typeof Taro?.requestSubscribeMessage !== 'function') return
  const tmplIds = getTemplateIds()
  if (tmplIds.length === 0) return
  const force = options?.force === true
  if (!force) {
    const prompted = Taro.getStorageSync(STORAGE_KEY)
    if (prompted) return
    Taro.setStorageSync(STORAGE_KEY, '1')
  }
  const startedAt = Date.now()
  try {
    const result = await Taro.requestSubscribeMessage({ tmplIds })
    const values = result ? Object.values(result) : []
    const hasBlocked = values.some((val) => String(val) !== 'accept')
    if (hasBlocked && force) {
      await showSubscribeGuide()
    }
  } catch (err) {
    if (TASK_DEBUG) {
      console.log('subscribe request failed', err)
    }
    if (force) {
      await showSubscribeGuide()
    }
  } finally {
    const elapsed = Date.now() - startedAt
    if (force && elapsed < SKIP_THRESHOLD_MS && options?.onSkipped) {
      options.onSkipped()
      await showSubscribeGuide()
    }
  }
}

export { openSubscribeSettings }
