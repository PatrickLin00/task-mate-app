const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const TASKS = 'tasks'
const ARCHIVES = 'task_archives'
const STATUS = {
  COMPLETED: 'completed',
  REVIEW_PENDING: 'review_pending',
  REFACTORED: 'refactored',
}
const PAGE_SIZE = 100

function now() {
  return new Date()
}

function success(data) {
  return { ok: true, data }
}

function fail(message, code, extra) {
  return Object.assign({ ok: false, error: { message, code } }, extra ? { extra } : {})
}

function assert(condition, message, code) {
  if (!condition) {
    const error = new Error(message)
    error.code = code
    throw error
  }
}

function ensureMaintenanceAccess(event) {
  const expectedToken = String(process.env.MAINTENANCE_TOKEN || '').trim()
  if (!expectedToken) return
  const providedToken = String(event && event.adminToken ? event.adminToken : '').trim()
  assert(providedToken && providedToken === expectedToken, 'Invalid maintenance token', 'FORBIDDEN')
}

async function listAllTasks() {
  const countResult = await db.collection(TASKS).count()
  const total = countResult.total || 0
  if (!total) return []
  const pages = Math.ceil(total / PAGE_SIZE)
  const tasks = []
  for (let page = 0; page < pages; page += 1) {
    const result = await db.collection(TASKS).skip(page * PAGE_SIZE).limit(PAGE_SIZE).get()
    tasks.push.apply(tasks, result.data || [])
  }
  return tasks
}

async function listAllArchives() {
  const countResult = await db.collection(ARCHIVES).count()
  const total = countResult.total || 0
  if (!total) return []
  const pages = Math.ceil(total / PAGE_SIZE)
  const archives = []
  for (let page = 0; page < pages; page += 1) {
    const result = await db.collection(ARCHIVES).skip(page * PAGE_SIZE).limit(PAGE_SIZE).get()
    archives.push.apply(archives, result.data || [])
  }
  return archives
}

function buildTaskMap(tasks) {
  return (tasks || []).reduce((map, task) => {
    map.set(String(task._id), task)
    return map
  }, new Map())
}

function buildInboundPreviousMap(tasks) {
  const inbound = new Map()
  ;(tasks || []).forEach((task) => {
    const previousId = String(task && task.previousTaskId ? task.previousTaskId : '').trim()
    if (!previousId) return
    if (!inbound.has(previousId)) inbound.set(previousId, [])
    inbound.get(previousId).push(String(task._id))
  })
  return inbound
}

function buildArchiveMap(archives) {
  return (archives || []).reduce((map, archive) => {
    const sourceTaskId = String(archive && archive.sourceTaskId ? archive.sourceTaskId : '').trim()
    if (!sourceTaskId) return map
    if (!map.has(sourceTaskId)) map.set(sourceTaskId, [])
    map.get(sourceTaskId).push(archive)
    return map
  }, new Map())
}

function buildArchiveOwnerMap(archives) {
  return (archives || []).reduce((map, archive) => {
    const sourceTaskId = String(archive && archive.sourceTaskId ? archive.sourceTaskId : '').trim()
    const ownerId = String(archive && archive.ownerId ? archive.ownerId : '').trim()
    if (!sourceTaskId || !ownerId) return map
    if (!map.has(sourceTaskId)) map.set(sourceTaskId, new Set())
    map.get(sourceTaskId).add(ownerId)
    return map
  }, new Map())
}

function collectRefactoredChain(taskMap, startId, creatorId) {
  const chain = []
  const visited = new Set()
  let currentId = String(startId || '').trim()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const current = taskMap.get(currentId)
    if (!current || current.status !== STATUS.REFACTORED) break
    if (creatorId && current.creatorId && current.creatorId !== creatorId) break
    chain.push(current)
    currentId = String(current.previousTaskId || '').trim()
  }
  return chain
}

function scanIntegrity(tasks, archives) {
  const taskMap = buildTaskMap(tasks)
  const inboundPrevious = buildInboundPreviousMap(tasks)
  const archiveMap = buildArchiveMap(archives)
  const archiveOwnerMap = buildArchiveOwnerMap(archives)
  const completedWithHistory = []
  const danglingPreviousReferences = []
  const orphanRefactoredRoots = []
  const archiveStatusMismatches = []
  const missingCompletedArchives = []

  ;(tasks || []).forEach((task) => {
    const taskId = String(task._id)
    const previousId = String(task.previousTaskId || '').trim()
    if (task.status === STATUS.COMPLETED && previousId) {
      completedWithHistory.push({
        taskId,
        creatorId: task.creatorId || '',
        previousTaskId: previousId,
        chain: collectRefactoredChain(taskMap, previousId, task.creatorId || ''),
      })
    }
    if (previousId && !taskMap.has(previousId)) {
      danglingPreviousReferences.push({
        taskId,
        status: task.status || '',
        previousTaskId: previousId,
      })
    }
    if (task.status === STATUS.REFACTORED && !inboundPrevious.has(taskId)) {
      orphanRefactoredRoots.push({
        taskId,
        creatorId: task.creatorId || '',
        previousTaskId: previousId,
        chain: collectRefactoredChain(taskMap, taskId, task.creatorId || ''),
      })
    }
    if (task.status === STATUS.COMPLETED || task.status === STATUS.REVIEW_PENDING) {
      const relatedArchives = archiveMap.get(taskId) || []
      relatedArchives.forEach((archive) => {
        if (archive.status === task.status) return
        archiveStatusMismatches.push({
          archiveId: String(archive._id),
          taskId,
          archiveStatus: String(archive.status || ''),
          taskStatus: String(task.status || ''),
          ownerId: String(archive.ownerId || ''),
        })
      })
    }
    if (task.status === STATUS.COMPLETED) {
      const existingOwners = archiveOwnerMap.get(taskId) || new Set()
      const expectedOwners = []
      const creatorId = String(task.creatorId || '').trim()
      const assigneeId = String(task.assigneeId || '').trim()
      if (creatorId) expectedOwners.push(creatorId)
      if (assigneeId && assigneeId !== creatorId) expectedOwners.push(assigneeId)
      expectedOwners.forEach((ownerId) => {
        if (existingOwners.has(ownerId)) return
        missingCompletedArchives.push({
          taskId,
          ownerId,
          creatorId,
          assigneeId,
          title: String(task.title || ''),
        })
      })
    }
  })

  return {
    scannedTaskCount: (tasks || []).length,
    scannedArchiveCount: (archives || []).length,
    completedWithHistory,
    danglingPreviousReferences,
    orphanRefactoredRoots,
    archiveStatusMismatches,
    missingCompletedArchives,
  }
}

function summarizeScan(scan) {
  return {
    scannedTaskCount: scan.scannedTaskCount,
    scannedArchiveCount: scan.scannedArchiveCount,
    completedWithHistoryCount: scan.completedWithHistory.length,
    danglingPreviousReferenceCount: scan.danglingPreviousReferences.length,
    orphanRefactoredRootCount: scan.orphanRefactoredRoots.length,
    archiveStatusMismatchCount: scan.archiveStatusMismatches.length,
    missingCompletedArchiveCount: scan.missingCompletedArchives.length,
    completedTaskIds: scan.completedWithHistory.map((item) => item.taskId),
    danglingTaskIds: scan.danglingPreviousReferences.map((item) => item.taskId),
    orphanRootTaskIds: scan.orphanRefactoredRoots.map((item) => item.taskId),
    archiveMismatchTaskIds: scan.archiveStatusMismatches.map((item) => item.taskId),
    missingCompletedArchiveTaskIds: scan.missingCompletedArchives.map((item) => item.taskId),
  }
}

async function scanRefactoredIntegrity() {
  const tasks = await listAllTasks()
  const archives = await listAllArchives()
  const scan = scanIntegrity(tasks, archives)
  return success(
    Object.assign(summarizeScan(scan), {
      details: {
        completedWithHistory: scan.completedWithHistory.map((item) => ({
          taskId: item.taskId,
          previousTaskId: item.previousTaskId,
          chainTaskIds: item.chain.map((task) => String(task._id)),
        })),
        danglingPreviousReferences: scan.danglingPreviousReferences,
        orphanRefactoredRoots: scan.orphanRefactoredRoots.map((item) => ({
          taskId: item.taskId,
          previousTaskId: item.previousTaskId,
          chainTaskIds: item.chain.map((task) => String(task._id)),
        })),
        archiveStatusMismatches: scan.archiveStatusMismatches,
        missingCompletedArchives: scan.missingCompletedArchives,
      },
    })
  )
}

async function repairMissingCompletedArchives() {
  const tasks = await listAllTasks()
  const archives = await listAllArchives()
  const scan = scanIntegrity(tasks, archives)
  const createdArchiveIds = []

  for (let index = 0; index < scan.missingCompletedArchives.length; index += 1) {
    const item = scan.missingCompletedArchives[index]
    const task = tasks.find((row) => String(row && row._id ? row._id : '') === String(item.taskId))
    if (!task) continue
    const payload = {
      ownerId: item.ownerId,
      sourceTaskId: task._id,
      status: task.status,
      snapshot: Object.assign({}, task),
      completedAt: task.completedAt || null,
      submittedAt: task.submittedAt || null,
      deleteAt: task.deleteAt || null,
      createdAt: now(),
      updatedAt: now(),
    }
    const added = await db.collection(ARCHIVES).add({ data: payload }).catch(() => null)
    if (added && added._id) createdArchiveIds.push(String(added._id))
  }

  const afterScan = scanIntegrity(await listAllTasks(), await listAllArchives())
  return success({
    before: summarizeScan(scan),
    repaired: {
      createdArchiveIds,
      createdArchiveCount: createdArchiveIds.length,
    },
    after: summarizeScan(afterScan),
  })
}

async function repairRefactoredIntegrity() {
  const tasks = await listAllTasks()
  const archives = await listAllArchives()
  const scan = scanIntegrity(tasks, archives)
  const taskMap = buildTaskMap(tasks)
  const deletedTaskIds = new Set()
  const clearedTaskIds = new Set()
  const fixedArchiveIds = new Set()

  for (let index = 0; index < scan.completedWithHistory.length; index += 1) {
    const item = scan.completedWithHistory[index]
    const chainTaskIds = item.chain.map((task) => String(task._id)).filter((taskId) => !deletedTaskIds.has(taskId))
    for (let chainIndex = 0; chainIndex < chainTaskIds.length; chainIndex += 1) {
      const chainTaskId = chainTaskIds[chainIndex]
      await db.collection(TASKS).doc(chainTaskId).remove().catch(() => null)
      deletedTaskIds.add(chainTaskId)
    }
    await db.collection(TASKS).doc(item.taskId).update({
      data: {
        previousTaskId: '',
        updatedAt: now(),
      },
    }).catch(() => null)
    clearedTaskIds.add(item.taskId)
  }

  for (let index = 0; index < scan.danglingPreviousReferences.length; index += 1) {
    const item = scan.danglingPreviousReferences[index]
    if (deletedTaskIds.has(item.taskId) || clearedTaskIds.has(item.taskId)) continue
    await db.collection(TASKS).doc(item.taskId).update({
      data: {
        previousTaskId: '',
        updatedAt: now(),
      },
    }).catch(() => null)
    clearedTaskIds.add(item.taskId)
  }

  for (let index = 0; index < scan.orphanRefactoredRoots.length; index += 1) {
    const item = scan.orphanRefactoredRoots[index]
    const chainTaskIds = item.chain.map((task) => String(task._id)).filter((taskId) => !deletedTaskIds.has(taskId))
    for (let chainIndex = 0; chainIndex < chainTaskIds.length; chainIndex += 1) {
      const chainTaskId = chainTaskIds[chainIndex]
      await db.collection(TASKS).doc(chainTaskId).remove().catch(() => null)
      deletedTaskIds.add(chainTaskId)
    }
  }

  for (let index = 0; index < scan.archiveStatusMismatches.length; index += 1) {
    const item = scan.archiveStatusMismatches[index]
    const task = taskMap.get(String(item.taskId))
    if (!task) continue
    await db.collection(ARCHIVES).doc(item.archiveId).update({
      data: {
        status: task.status,
        snapshot: Object.assign({}, task),
        completedAt: task.completedAt || null,
        submittedAt: task.submittedAt || null,
        deleteAt: task.deleteAt || null,
        updatedAt: now(),
      },
    }).catch(() => null)
    fixedArchiveIds.add(item.archiveId)
  }

  const afterScan = scanIntegrity(await listAllTasks(), await listAllArchives())
  return success({
    before: summarizeScan(scan),
    repaired: {
      deletedRefactoredTaskIds: Array.from(deletedTaskIds),
      clearedPreviousTaskIds: Array.from(clearedTaskIds),
      fixedArchiveIds: Array.from(fixedArchiveIds),
    },
    after: summarizeScan(afterScan),
  })
}

exports.main = async (event = {}) => {
  try {
    ensureMaintenanceAccess(event)
    const action = String(event && event.action ? event.action : 'scanRefactoredIntegrity')
    switch (action) {
      case 'scanRefactoredIntegrity':
        return await scanRefactoredIntegrity()
      case 'repairRefactoredIntegrity':
        return await repairRefactoredIntegrity()
      case 'repairMissingCompletedArchives':
        return await repairMissingCompletedArchives()
      default:
        return fail('Unknown action', 'UNKNOWN_ACTION', { action })
    }
  } catch (error) {
    return fail(error.message || 'Maintenance failed', error.code || 'MAINTENANCE_FAILED')
  }
}
