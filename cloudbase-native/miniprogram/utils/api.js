const { callFunction } = require('./cloud')

function unwrap(result) {
  const payload = result && result.result ? result.result : {}
  if (!payload.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : 'Request failed'
    const error = new Error(message)
    error.code = payload.error && payload.error.code ? payload.error.code : 'REQUEST_FAILED'
    error.detail = payload.error || null
    throw error
  }
  return payload.data
}

async function requestTask(action, data) {
  const result = await callFunction('taskGateway', {
    action,
    data: data || {},
  })
  return unwrap(result)
}

async function bootstrap() {
  return requestTask('bootstrap')
}

async function getDashboard() {
  return requestTask('getDashboard')
}

async function getTask(taskId) {
  return requestTask('getTask', { taskId })
}

async function createTask(payload) {
  return requestTask('createTask', payload)
}

async function updateProfile(payload) {
  return requestTask('updateProfile', payload)
}

async function saveSubscribeSettings(payload) {
  return requestTask('saveSubscribeSettings', payload)
}

async function completeOnboarding() {
  return requestTask('completeOnboarding')
}

async function operateTask(operation, payload) {
  return requestTask(operation, payload)
}

async function acceptChallengeTask(seedKey) {
  return requestTask('acceptChallengeTask', { seedKey })
}

async function generateTaskByAI(payload) {
  const result = await callFunction(
    'generateTaskByAI',
    typeof payload === 'string'
      ? { prompt: payload }
      : payload || {}
  )
  return unwrap(result)
}

module.exports = {
  bootstrap,
  getDashboard,
  getTask,
  createTask,
  updateProfile,
  saveSubscribeSettings,
  completeOnboarding,
  operateTask,
  acceptChallengeTask,
  generateTaskByAI,
}
