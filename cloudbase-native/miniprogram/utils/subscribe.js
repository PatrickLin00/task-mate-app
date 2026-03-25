const { saveSubscribeSettings } = require('./api')
const { templates } = require('../config/subscribe')
const strings = require('../config/strings')

const STORAGE_KEY = 'taskmate_subscribe_prompted_v1'

function getTemplateIds() {
  return Object.keys(templates || {})
    .map((key) => String(templates[key] || '').trim())
    .filter(Boolean)
}

async function openSubscribeSettings() {
  if (typeof wx.openSetting !== 'function') return false
  try {
    await wx.openSetting({ withSubscriptions: true })
    return true
  } catch (error) {
    return false
  }
}

async function showSubscribeGuide() {
  const canOpen = typeof wx.openSetting === 'function'
  const result = await wx.showModal({
    title: strings.subscribe.guideTitle,
    content: strings.subscribe.guideContent,
    confirmText: canOpen ? strings.subscribe.guideConfirm : strings.subscribe.guideAcknowledge,
    cancelText: canOpen ? strings.subscribe.guideAcknowledge : strings.subscribe.guideClose,
    showCancel: canOpen,
  })
  if (result.confirm && canOpen) {
    await openSubscribeSettings()
  }
}

async function requestTaskSubscribeAuth(options) {
  const force = Boolean(options && options.force)
  if (typeof wx.requestSubscribeMessage !== 'function') {
    await wx.showToast({ title: strings.common.loadingUnsupported, icon: 'none' })
    return
  }
  const tmplIds = getTemplateIds()
  if (!tmplIds.length) {
    await wx.showToast({ title: strings.common.subscribeTemplateMissing, icon: 'none' })
    return
  }
  if (!force) {
    const prompted = wx.getStorageSync(STORAGE_KEY)
    if (prompted) return
    wx.setStorageSync(STORAGE_KEY, '1')
  }
  try {
    const result = await wx.requestSubscribeMessage({ tmplIds })
    await saveSubscribeSettings({ result })
    const values = Object.values(result || {})
    const accepted = values.some((value) => String(value) === 'accept')
    if (accepted) {
      await wx.showToast({ title: strings.common.subscribeUpdated, icon: 'none' })
    } else if (force) {
      await showSubscribeGuide()
    }
  } catch (error) {
    if (force) {
      await showSubscribeGuide()
    }
  }
}

module.exports = {
  requestTaskSubscribeAuth,
  openSubscribeSettings,
}
