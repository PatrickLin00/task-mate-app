const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = __dirname
const OUTPUT_DIR = path.join(ROOT, 'private-package')
const STAGING_DIR = path.join(OUTPUT_DIR, 'staging')
const OUTPUT_ZIP = path.join(OUTPUT_DIR, 'task-mate-private-package.zip')

const REQUIRED_FILES = [
  'cloudbase-native/miniprogram/config/private.js',
]

const OPTIONAL_FILES = [
  'cloudbase-native/project.private.config.json',
]

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true })
  ensureDir(dirPath)
}

function copyIntoStaging(relativePath) {
  const source = path.join(ROOT, relativePath)
  if (!fs.existsSync(source)) return false
  const target = path.join(STAGING_DIR, relativePath)
  ensureDir(path.dirname(target))
  fs.copyFileSync(source, target)
  return true
}

function assertRequiredFiles() {
  const missing = REQUIRED_FILES.filter((relativePath) => !fs.existsSync(path.join(ROOT, relativePath)))
  if (missing.length) {
    throw new Error(`Missing required private files:\n${missing.join('\n')}`)
  }
}

function buildArchive() {
  ensureDir(OUTPUT_DIR)
  resetDir(STAGING_DIR)
  assertRequiredFiles()

  REQUIRED_FILES.forEach(copyIntoStaging)
  OPTIONAL_FILES.forEach(copyIntoStaging)

  const zipCommand = [
    'Compress-Archive',
    '-LiteralPath',
    `'${path.join(STAGING_DIR, 'cloudbase-native')}'`,
    '-DestinationPath',
    `'${OUTPUT_ZIP}'`,
    '-Force',
  ].join(' ')

  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', zipCommand],
    { stdio: 'inherit' }
  )

  if (result.status !== 0) {
    throw new Error('Failed to build private package zip')
  }
}

function main() {
  buildArchive()
  console.log(`Built private package: ${OUTPUT_ZIP}`)
  console.log('Extract this zip at the repository root to restore private files.')
}

main()
