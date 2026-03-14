const { envId } = require('../config/cloud')

function initCloud() {
  if (!wx.cloud) {
    console.warn('Cloud capability is unavailable in the current base library.')
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
    const next = new Error(`云函数 ${name} 未上传`)
    next.code = 'CLOUDFUNCTION_MISSING'
    next.detail = error || null
    return next
  }

  const next = new Error(message || `调用云函数 ${name} 失败`)
  next.code = code || 'CLOUDFUNCTION_FAILED'
  next.detail = error || null
  return next
}

async function callFunction(name, data) {
  if (!wx.cloud) {
    const error = new Error('当前基础库不支持云开发')
    error.code = 'CLOUD_UNAVAILABLE'
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
