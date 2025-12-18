const Task = require('../models/Task')

async function cleanupLegacyTestTasks() {
  const res = await Task.deleteMany({ seedKey: /^test_/ })
  return { deleted: res.deletedCount || 0 }
}

module.exports = { cleanupLegacyTestTasks }

