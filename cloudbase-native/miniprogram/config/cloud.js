let privateConfig = {}

try {
  privateConfig = require('./private')
} catch (error) {
  privateConfig = {}
}

const envId = String(privateConfig.envId || '').trim()

module.exports = {
  envId,
  setupReady: Boolean(envId),
}
