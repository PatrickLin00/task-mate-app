const { envId, setupReady } = require('../config/cloud')

function initCloud() {
  if (!wx.cloud) {
    console.warn('Cloud capability is unavailable in the current base library.')
    return
  }

  if (!setupReady) {
    console.warn('Private Mini Program config is missing. Cloud init skipped.')
    return
  }

  wx.cloud.init({
    env: envId,
    traceUser: true,
  })
}

function normalizeCloudError(error, name) {
  const code = error && (error.errCode || error.code) ? String(error.errCode || error.code) : ''
  const message = error && error.errMsg ? String(error.errMsg) : error && error.message ? String(error.message) : ''
  const missingResource =
    code === '-501000' ||
    message.includes('resource is not found') ||
    message.includes('FunctionName parameter could not be found')

  if (missingResource) {
    const next = new Error(`Cloud function ${name} is not deployed`)
    next.code = 'CLOUDFUNCTION_MISSING'
    next.detail = error || null
    return next
  }

  const next = new Error(message || `Cloud function ${name} failed`)
  next.code = code || 'CLOUDFUNCTION_FAILED'
  next.detail = error || null
  return next
}

async function callFunction(name, data) {
  if (!wx.cloud) {
    const error = new Error('Cloud capability is unavailable in the current base library.')
    error.code = 'CLOUD_UNAVAILABLE'
    throw error
  }

  if (!setupReady || !envId) {
    const error = new Error('Missing private config file miniprogram/config/private.js')
    error.code = 'PRIVATE_SETUP_REQUIRED'
    throw error
  }

  try {
    return await wx.cloud.callFunction({
      name,
      data,
    })
  } catch (error) {
    throw normalizeCloudError(error, name)
  }
}

module.exports = {
  initCloud,
  callFunction,
}
