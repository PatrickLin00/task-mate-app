const path = require('path')
const cloudbase = require('@cloudbase/node-sdk')

const ROOT = path.resolve(__dirname, '..')
const USERS = 'users'
const TASKS = 'tasks'
const ARCHIVES = 'task_archives'
const PAGE_SIZE = 100

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function getEnvId() {
  return String(process.argv[2] || '').trim()
}

function getSecretId() {
  return (
    String(process.env.TENCENTCLOUD_SECRETID || '').trim() ||
    String(process.env.TCB_SECRET_ID || '').trim()
  )
}

function getSecretKey() {
  return (
    String(process.env.TENCENTCLOUD_SECRETKEY || '').trim() ||
    String(process.env.TCB_SECRET_KEY || '').trim()
  )
}

function createApp(envId) {
  const secretId = getSecretId()
  const secretKey = getSecretKey()
  assert(envId, 'envId is required')
  assert(secretId, 'Missing TENCENTCLOUD_SECRETID or TCB_SECRET_ID')
  assert(secretKey, 'Missing TENCENTCLOUD_SECRETKEY or TCB_SECRET_KEY')
  return cloudbase.init({
    env: envId,
    secretId,
    secretKey,
  })
}

async function listAll(collection) {
  const rows = []
  let offset = 0
  while (true) {
    const result = await collection.skip(offset).limit(PAGE_SIZE).get()
    const batch = Array.isArray(result && result.data) ? result.data : []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows
}

function pushIssue(list, type, message, data) {
  list.push({ type, message, data: data || null })
}

function collectDuplicateUserIds(users, issues) {
  const map = new Map()
  users.forEach((user) => {
    const userId = String(user && user.userId ? user.userId : '').trim()
    if (!userId) return
    const entry = map.get(userId) || []
    entry.push({
      _id: user._id,
      nickname: user.nickname || '',
    })
    map.set(userId, entry)
  })
  Array.from(map.entries()).forEach(([userId, list]) => {
    if (list.length > 1) {
      pushIssue(issues, 'duplicate_user', `Duplicate userId found: ${userId}`, {
        userId,
        rows: list,
      })
    }
  })
}

function collectMissingUserIds(users, issues) {
  users.forEach((user) => {
    const userId = String(user && user.userId ? user.userId : '').trim()
    if (!userId) {
      pushIssue(issues, 'missing_user_id', 'User row missing userId', {
        _id: user && user._id ? user._id : '',
        nickname: user && user.nickname ? user.nickname : '',
      })
    }
  })
}

function collectLegacyPrefixedUserIds(users, issues) {
  users.forEach((user) => {
    const userId = String(user && user.userId ? user.userId : '').trim()
    if (userId.startsWith('wx:')) {
      pushIssue(issues, 'legacy_user_id_prefix', `Legacy prefixed userId found: ${userId}`, {
        _id: user._id,
        userId,
      })
    }
  })
}

function collectOrphanTaskRefs(tasks, validUserIds, issues) {
  tasks.forEach((task) => {
    const creatorId = String(task && task.creatorId ? task.creatorId : '').trim()
    const assigneeId = String(task && task.assigneeId ? task.assigneeId : '').trim()
    if (creatorId && !creatorId.startsWith('sys:') && !validUserIds.has(creatorId)) {
      pushIssue(issues, 'orphan_task_creator', `Task creatorId has no matching user: ${creatorId}`, {
        taskId: task._id,
        title: task.title || '',
        creatorId,
      })
    }
    if (assigneeId && !validUserIds.has(assigneeId)) {
      pushIssue(issues, 'orphan_task_assignee', `Task assigneeId has no matching user: ${assigneeId}`, {
        taskId: task._id,
        title: task.title || '',
        assigneeId,
      })
    }
  })
}

function collectOrphanArchiveRefs(archives, validUserIds, issues) {
  archives.forEach((archive) => {
    const ownerId = String(archive && archive.ownerId ? archive.ownerId : '').trim()
    const snapshot = archive && archive.snapshot ? archive.snapshot : {}
    const creatorId = String(snapshot && snapshot.creatorId ? snapshot.creatorId : '').trim()
    const assigneeId = String(snapshot && snapshot.assigneeId ? snapshot.assigneeId : '').trim()
    if (ownerId && !validUserIds.has(ownerId)) {
      pushIssue(issues, 'orphan_archive_owner', `Archive ownerId has no matching user: ${ownerId}`, {
        archiveId: archive._id,
        ownerId,
        sourceTaskId: archive.sourceTaskId || '',
      })
    }
    if (creatorId && !creatorId.startsWith('sys:') && !validUserIds.has(creatorId)) {
      pushIssue(issues, 'orphan_archive_creator', `Archive snapshot creatorId has no matching user: ${creatorId}`, {
        archiveId: archive._id,
        creatorId,
        sourceTaskId: archive.sourceTaskId || '',
      })
    }
    if (assigneeId && !validUserIds.has(assigneeId)) {
      pushIssue(issues, 'orphan_archive_assignee', `Archive snapshot assigneeId has no matching user: ${assigneeId}`, {
        archiveId: archive._id,
        assigneeId,
        sourceTaskId: archive.sourceTaskId || '',
      })
    }
  })
}

async function main() {
  const envId = getEnvId()
  const app = createApp(envId)
  const db = app.database()

  const [users, tasks, archives] = await Promise.all([
    listAll(db.collection(USERS)),
    listAll(db.collection(TASKS)),
    listAll(db.collection(ARCHIVES)),
  ])

  const issues = []
  const validUserIds = new Set(
    users
      .map((user) => String(user && user.userId ? user.userId : '').trim())
      .filter(Boolean)
  )

  collectMissingUserIds(users, issues)
  collectDuplicateUserIds(users, issues)
  collectLegacyPrefixedUserIds(users, issues)
  collectOrphanTaskRefs(tasks, validUserIds, issues)
  collectOrphanArchiveRefs(archives, validUserIds, issues)

  const summary = {
    envId,
    counts: {
      users: users.length,
      tasks: tasks.length,
      archives: archives.length,
    },
    issueCount: issues.length,
    issues,
  }

  console.log(JSON.stringify(summary, null, 2))
  if (issues.length) process.exitCode = 2
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error))
  process.exit(1)
})
