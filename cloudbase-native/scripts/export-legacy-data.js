const fs = require('fs')
const path = require('path')
const { MongoClient, ObjectId } = require('../../server/node_modules/mongodb')

const ROOT = path.resolve(__dirname, '..', '..')
const ENV_FILE = path.join(ROOT, 'server', '.env')
const OUT_DIR = path.join(ROOT, 'cloudbase-native', 'migration-output')
const RAW_DIR = path.join(OUT_DIR, 'raw')
const ADAPTED_DIR = path.join(OUT_DIR, 'adapted')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function parseEnvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const env = {}
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const index = trimmed.indexOf('=')
    if (index < 0) return
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    env[key] = value
  })
  return env
}

function toIso(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function toIdString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value instanceof ObjectId) return value.toHexString()
  if (typeof value === 'object' && typeof value.toString === 'function') return value.toString()
  return String(value)
}

function normalizeUserId(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value.startsWith('dev:')) return ''
  if (value.startsWith('sys:dev:')) return ''
  if (value.startsWith('sys:wx:')) return `sys:${value.slice(7)}`
  if (value.startsWith('wx:')) return value.slice(3)
  return value
}

function normalizeSubtasks(subtasks) {
  return Array.isArray(subtasks)
    ? subtasks
        .map((item) => {
          const title = String(item && item.title ? item.title : '').trim()
          const total = Math.max(1, Math.floor(Number(item && item.total ? item.total : 1)))
          const current = Math.max(0, Math.min(total, Math.floor(Number(item && item.current ? item.current : 0))))
          return title ? { title, current, total } : null
        })
        .filter(Boolean)
    : []
}

function normalizeReward(reward) {
  const type = ['wisdom', 'strength', 'agility'].includes(String(reward && reward.type ? reward.type : ''))
    ? String(reward.type)
    : 'wisdom'
  const value = Math.max(1, Math.floor(Number(reward && reward.value ? reward.value : 1)))
  return { type, value }
}

function inferCategory(task) {
  const seedKey = String(task && task.seedKey ? task.seedKey : '')
  const creatorId = String(task && task.creatorId ? task.creatorId : '')
  if (seedKey.startsWith('challenge_')) return 'challenge'
  if (creatorId.startsWith('sys:')) return 'system'
  return 'normal'
}

function mapUser(doc) {
  const userId = normalizeUserId(doc.userId || doc._openid || doc.openid)
  if (!userId) return null
  return {
    _id: toIdString(doc._id),
    userId,
    nickname: String(doc.nickname || '').trim() || `旅者-${userId.slice(-4)}`,
    avatar: String(doc.avatar || '').trim(),
    subscribePreferences: doc.subscribePreferences && typeof doc.subscribePreferences === 'object' ? doc.subscribePreferences : {},
    stars: Number(doc.stars || 0),
    wisdom: Number(doc.wisdom || 0),
    strength: Number(doc.strength || 0),
    agility: Number(doc.agility || 0),
    createdAt: toIso(doc.createdAt) || toIso(new Date()),
    updatedAt: toIso(doc.updatedAt) || toIso(doc.createdAt) || toIso(new Date()),
  }
}

function mapTask(doc) {
  const creatorId = normalizeUserId(doc.creatorId)
  const assigneeId = normalizeUserId(doc.assigneeId)
  if ((doc.creatorId && !creatorId) || (doc.assigneeId && !assigneeId)) return null
  return {
    _id: toIdString(doc._id),
    title: String(doc.title || '').trim(),
    detail: String(doc.detail || '').trim(),
    icon: String(doc.icon || '✨').trim(),
    status: String(doc.status || 'pending'),
    category: inferCategory(doc),
    creatorId,
    creatorName: '',
    assigneeId,
    assigneeName: '',
    ownerScope: '',
    dueAt: toIso(doc.dueAt),
    startAt: toIso(doc.startAt),
    submittedAt: toIso(doc.submittedAt),
    completedAt: toIso(doc.completedAt),
    closedAt: toIso(doc.closedAt),
    deleteAt: toIso(doc.deleteAt),
    originalDueAt: toIso(doc.originalDueAt),
    originalStartAt: toIso(doc.originalStartAt),
    originalStatus: doc.originalStatus || null,
    previousTaskId: toIdString(doc.previousTaskId),
    seedKey: String(doc.seedKey || ''),
    dueSoonNotifiedAt: toIso(doc.dueSoonNotifiedAt),
    overdueNotifiedAt: toIso(doc.overdueNotifiedAt),
    challengeExpiredNotifiedAt: toIso(doc.challengeExpiredNotifiedAt),
    subtasks: normalizeSubtasks(doc.subtasks),
    attributeReward: normalizeReward(doc.attributeReward),
    createdAt: toIso(doc.createdAt) || toIso(new Date()),
    updatedAt: toIso(doc.updatedAt) || toIso(doc.createdAt) || toIso(new Date()),
  }
}

function mapArchive(doc) {
  const ownerId = normalizeUserId(doc.ownerId)
  const creatorId = normalizeUserId(doc.creatorId)
  const assigneeId = normalizeUserId(doc.assigneeId)
  if (!ownerId) return null
  if ((doc.creatorId && !creatorId) || (doc.assigneeId && !assigneeId)) return null

  const sourceTaskId = toIdString(doc.sourceTaskId || doc._id)
  const snapshot = {
    _id: sourceTaskId,
    title: String(doc.title || '').trim(),
    detail: String(doc.detail || '').trim(),
    icon: String(doc.icon || '✨').trim(),
    status: String(doc.status || 'completed'),
    category: inferCategory(doc),
    creatorId,
    creatorName: '',
    assigneeId,
    assigneeName: '',
    ownerScope: '',
    dueAt: toIso(doc.dueAt),
    startAt: toIso(doc.startAt),
    submittedAt: toIso(doc.submittedAt),
    completedAt: toIso(doc.completedAt),
    closedAt: toIso(doc.closedAt),
    deleteAt: toIso(doc.deleteAt),
    originalDueAt: toIso(doc.originalDueAt),
    originalStartAt: toIso(doc.originalStartAt),
    originalStatus: doc.originalStatus || null,
    previousTaskId: toIdString(doc.previousTaskId),
    seedKey: String(doc.seedKey || ''),
    dueSoonNotifiedAt: toIso(doc.dueSoonNotifiedAt),
    overdueNotifiedAt: toIso(doc.overdueNotifiedAt),
    challengeExpiredNotifiedAt: toIso(doc.challengeExpiredNotifiedAt),
    subtasks: normalizeSubtasks(doc.subtasks),
    attributeReward: normalizeReward(doc.attributeReward),
    createdAt: toIso(doc.createdAt) || toIso(new Date()),
    updatedAt: toIso(doc.updatedAt) || toIso(doc.createdAt) || toIso(new Date()),
  }

  return {
    _id: toIdString(doc._id),
    ownerId,
    sourceTaskId,
    status: String(doc.status || 'completed'),
    completedAt: toIso(doc.completedAt),
    submittedAt: toIso(doc.submittedAt),
    deleteAt: toIso(doc.deleteAt),
    createdAt: toIso(doc.createdAt) || toIso(new Date()),
    updatedAt: toIso(doc.updatedAt) || toIso(doc.createdAt) || toIso(new Date()),
    snapshot,
  }
}

async function main() {
  const env = parseEnvFile(ENV_FILE)
  const uri = env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI missing')

  ensureDir(RAW_DIR)
  ensureDir(ADAPTED_DIR)

  const client = new MongoClient(uri)
  await client.connect()
  try {
    const db = client.db()
    const collections = await db.listCollections().toArray()
    const names = collections.map((item) => item.name).sort()

    const rawData = {}
    const counts = {}
    for (const name of names) {
      const docs = await db.collection(name).find({}).toArray()
      rawData[name] = docs
      counts[name] = docs.length
      fs.writeFileSync(path.join(RAW_DIR, `${name}.json`), JSON.stringify(docs, null, 2))
    }

    const usersRaw = rawData.users || []
    const tasksRaw = rawData.tasks || []
    const archivesRaw = rawData.completedtasks || rawData.completedTasks || []

    const users = usersRaw.map(mapUser).filter(Boolean)
    const tasks = tasksRaw.map(mapTask).filter(Boolean)
    const taskArchives = archivesRaw.map(mapArchive).filter(Boolean)

    const report = {
      exportedAt: new Date().toISOString(),
      sourceCollections: names,
      rawCounts: counts,
      adaptedCounts: {
        users: users.length,
        tasks: tasks.length,
        task_archives: taskArchives.length,
      },
      droppedRecords: {
        users: usersRaw.length - users.length,
        tasks: tasksRaw.length - tasks.length,
        task_archives: archivesRaw.length - taskArchives.length,
      },
      notes: [
        'User IDs are normalized to the new scheme: wx:OPENID -> OPENID.',
        'System IDs are normalized too: sys:wx:OPENID -> sys:OPENID.',
        'dev:* users and records pointing to dev:* IDs are dropped.',
        'CloudBase target collections: users, tasks, task_archives.',
      ],
    }

    fs.writeFileSync(path.join(ADAPTED_DIR, 'users.json'), JSON.stringify(users, null, 2))
    fs.writeFileSync(path.join(ADAPTED_DIR, 'tasks.json'), JSON.stringify(tasks, null, 2))
    fs.writeFileSync(path.join(ADAPTED_DIR, 'task_archives.json'), JSON.stringify(taskArchives, null, 2))
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))

    console.log(JSON.stringify(report, null, 2))
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
