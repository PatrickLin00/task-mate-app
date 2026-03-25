const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CONFIG_PATH = path.join(ROOT, 'miniprogram', 'config', 'cloud.js')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function main() {
  const envId = String(process.argv[2] || '').trim()
  assert(envId, 'envId is required')

  const content = `module.exports = {\n  envId: '${envId}',\n}\n`
  fs.writeFileSync(CONFIG_PATH, content, 'utf8')
  console.log(`Updated ${CONFIG_PATH} -> ${envId}`)
}

main()
