import Taro from '@tarojs/taro'

const getTemplateIds = () => {
  const ids = [SUBSCRIBE_TPL_TODO, SUBSCRIBE_TPL_TASK_UPDATE, SUBSCRIBE_TPL_REVIEW, SUBSCRIBE_TPL_WORK]
  return ids.filter((id) => typeof id === 'string' && id.trim().length > 0) as string[]
}

const STORAGE_KEY = 'taskmate_subscribe_prompted_v1'
const SKIP_THRESHOLD_MS = 300

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
    await Taro.requestSubscribeMessage({ tmplIds })
  } catch (err) {
    if (TASK_DEBUG) {
      console.log('subscribe request failed', err)
    }
  } finally {
    const elapsed = Date.now() - startedAt
    if (force && elapsed < SKIP_THRESHOLD_MS && options?.onSkipped) {
      options.onSkipped()
    }
  }
}
