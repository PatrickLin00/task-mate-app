const fs = require('fs')
const path = require('path')

let cloud = null
try {
  cloud = require('wx-server-sdk')
} catch (error) {
  cloud = null
}

const ROOT = path.resolve(__dirname, '..', '..')
const ENV_ID = require('../miniprogram/config/cloud').envId
const INPUT_DIR = path.join(ROOT, 'cloudbase-native', 'migration-output', 'adapted')
const COLLECTIONS = [
  { name: 'users', file: 'users.json' },
  { name: 'tasks', file: 'tasks.json' },
  { name: 'task_archives', file: 'task_archives.json' },
]

const CLEAR_BEFORE_IMPORT = false

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

async function clearCollection(db, name) {
  while (true) {
    const result = await db.collection(name).limit(100).get()
    const rows = result.data || []
    if (!rows.length) return
    await Promise.all(rows.map((item) => db.collection(name).doc(item._id).remove()))
  }
}

async function upsertById(db, collectionName, doc) {
  const id = String(doc && doc._id ? doc._id : '').trim()
  assert(id, `Missing _id for ${collectionName}`)
  const payload = Object.assign({}, doc)
  delete payload._id
  await db.collection(collectionName).doc(id).set({ data: payload })
}

async function importCollection(db, collectionName, list) {
  for (let index = 0; index < list.length; index += 1) {
    await upsertById(db, collectionName, list[index])
    if ((index + 1) % 50 === 0) {
      console.log(`[${collectionName}] imported ${index + 1}/${list.length}`)
    }
  }
  console.log(`[${collectionName}] done ${list.length}`)
}

async function main() {
  assert(cloud, 'wx-server-sdk is not installed. Install it before running this script.')
  cloud.init({ env: ENV_ID })
  const db = cloud.database()

  const datasets = COLLECTIONS.map((item) => ({
    collection: item.name,
    file: path.join(INPUT_DIR, item.file),
    rows: readJson(path.join(INPUT_DIR, item.file)),
  }))

  console.log(`Cloud env: ${ENV_ID}`)
  console.log(`Input dir: ${INPUT_DIR}`)
  datasets.forEach((item) => {
    console.log(`[plan] ${item.collection}: ${item.rows.length}`)
  })

  if (CLEAR_BEFORE_IMPORT) {
    for (const item of datasets) {
      console.log(`[clear] ${item.collection}`)
      await clearCollection(db, item.collection)
    }
  }

  for (const item of datasets) {
    await importCollection(db, item.collection, item.rows)
  }

  console.log('Import completed.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
