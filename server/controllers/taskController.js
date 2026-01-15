const Task = require('../models/Task')
const CompletedTask = require('../models/CompletedTask')
const mongoose = require('mongoose')
const { sendSubscribeMessage } = require('../utils/subscribeMessage')
const { LABELS, VALUES } = require('../utils/subscribeLabels')
const {
  getDailyChallengeSeeds,
  buildChallengeTaskSeed,
  buildChallengeVirtualTask,
} = require('../utils/seedTasks')

const TASK_STATUS = [
  'pending',
  'in_progress',
  'review_pending',
  'pending_confirmation',
  'completed',
  'closed',
  'refactored',
]
const REWARD_TYPE = ['strength', 'wisdom', 'agility']
const ACTIVE_ASSIGNEE_STATUS = ['in_progress', 'pending_confirmation']
const CLOSE_RETENTION_DAYS = 7

const clamp = (value, min, max) => Math.max(min, Math.min(value, max))
const pad2 = (value) => String(value).padStart(2, '0')
const formatDateTime = (date) => {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`
}

const isWechatUserId = (value) => typeof value === 'string' && value.startsWith('wx:')

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id)
let taskDebugEnabled = String(process.env.TASK_DEBUG_LOGS || '').toLowerCase() === 'true'

const taskDebugLog = (...args) => {
  if (!taskDebugEnabled) return
  console.log(...args)
}

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  return null
}

const startOfDay = (date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const endOfDay = (date) => {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

const computeProgress = (taskDoc) => {
  if (!taskDoc) return { current: 0, total: 0 }
  const subtasks = Array.isArray(taskDoc.subtasks) ? taskDoc.subtasks : []
  const total = subtasks.reduce((sum, s) => sum + Math.max(1, Number(s.total) || 1), 0)
  const current = subtasks.reduce((sum, s) => {
    const totalVal = Math.max(1, Number(s.total) || 1)
    const curVal = Number.isFinite(Number(s.current)) ? Number(s.current) : 0
    return sum + clamp(curVal, 0, totalVal)
  }, 0)
  return { current, total }
}

const buildResponse = (taskDoc) => {
  const doc = taskDoc.toObject()
  doc.computedProgress = computeProgress(taskDoc)
  return doc
}

const buildArchiveResponse = (taskDoc) => {
  const doc = taskDoc.toObject()
  doc.computedProgress = computeProgress(taskDoc)
  return doc
}

const isChallengeTask = (taskDoc) => String(taskDoc?.seedKey || '').startsWith('challenge_')

const getCompletionDeleteAt = (taskDoc, now) => {
  if (isChallengeTask(taskDoc)) {
    const nextDay = new Date(now)
    nextDay.setDate(nextDay.getDate() + 1)
    nextDay.setHours(0, 0, 0, 0)
    return nextDay
  }
  const deleteAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  return deleteAt
}

const buildCompletionRecords = (taskDoc, completedAt, deleteAt) => {
  if (!taskDoc.assigneeId) return []
  return [
    {
      title: taskDoc.title,
      icon: taskDoc.icon,
      detail: taskDoc.detail,
      dueAt: taskDoc.dueAt,
      startAt: taskDoc.startAt,
      completedAt,
      deleteAt,
      status: 'completed',
      creatorId: taskDoc.creatorId,
      assigneeId: taskDoc.assigneeId,
      ownerId: taskDoc.assigneeId,
      sourceTaskId: taskDoc._id,
      subtasks: Array.isArray(taskDoc.subtasks) ? taskDoc.subtasks : [],
      attributeReward: taskDoc.attributeReward,
      seedKey: taskDoc.seedKey || null,
    },
  ]
}

const buildReviewRecord = (taskDoc, submittedAt) => {
  if (!taskDoc.assigneeId) return null
  return {
    title: taskDoc.title,
    icon: taskDoc.icon,
    detail: taskDoc.detail,
    dueAt: taskDoc.dueAt,
    startAt: taskDoc.startAt,
    submittedAt,
    status: 'review_pending',
    creatorId: taskDoc.creatorId,
    assigneeId: taskDoc.assigneeId,
    ownerId: taskDoc.assigneeId,
    sourceTaskId: taskDoc._id,
    subtasks: Array.isArray(taskDoc.subtasks) ? taskDoc.subtasks : [],
    attributeReward: taskDoc.attributeReward,
    seedKey: taskDoc.seedKey || null,
  }
}

const parseDueAt = (value) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

const fetchReworkedIds = async () =>
  Task.distinct('previousTaskId', { previousTaskId: { $ne: null } })

const deletePreviousTask = async (taskDoc, session) => {
  if (!taskDoc?.previousTaskId) return
  let query = Task.deleteOne({ _id: taskDoc.previousTaskId })
  if (session) query = query.session(session)
  await query
}

const deleteRefactoredChain = async (taskId, userId, session) => {
  let currentId = taskId
  const visited = new Set()
  while (currentId && !visited.has(String(currentId))) {
    visited.add(String(currentId))
    let findQuery = Task.findOne({ _id: currentId, creatorId: userId, status: 'refactored' })
    if (session) findQuery = findQuery.session(session)
    const doc = await findQuery
    if (!doc) break
    const nextId = doc.previousTaskId
    let deleteQuery = Task.deleteOne({
      _id: doc._id,
      creatorId: userId,
      status: 'refactored',
      updatedAt: doc.updatedAt,
    })
    if (session) deleteQuery = deleteQuery.session(session)
    const result = await deleteQuery
    if (!result.deletedCount) break
    currentId = nextId
  }
}

const areSubtasksEqual = (a = [], b = []) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const sa = a[i]
    const sb = b[i]
    if ((sa?.title || '').trim() !== (sb?.title || '').trim()) return false
    if (Number(sa?.total) !== Number(sb?.total)) return false
  }
  return true
}

const normalizeSubtasks = (subtasks) => {
  if (!Array.isArray(subtasks)) return []
  return subtasks
    .map((s) => {
      const title = typeof s?.title === 'string' ? s.title.trim() : ''
      const totalRaw = Number(s?.total)
      const total = Number.isFinite(totalRaw) ? Math.max(1, Math.floor(totalRaw)) : 1
      const currentRaw = Number(s?.current)
      const current = Number.isFinite(currentRaw) ? Math.max(0, Math.floor(currentRaw)) : 0
      return { title, total, current: clamp(current, 0, total) }
    })
    .filter((s) => s.title)
}

const ensureAuthorized = (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }
  return userId
}

const conflict = (res, message = 'state changed') => res.status(409).json({ error: message })

const throwAbort = (status, body) => {
  const err = new Error(body?.error || 'error')
  err.status = status
  err.body = body
  throw err
}

const SYSTEM_USER_ID = 'sys:system'

const visibleToUserId = (task, userId) =>
  task.creatorId === userId || task.assigneeId === userId || task.creatorId === SYSTEM_USER_ID

exports.createTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const body = req.body || {}
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const detail =
      typeof body.detail === 'string'
        ? body.detail.trim()
        : typeof body.description === 'string'
          ? body.description.trim()
          : ''
    const dueAt = parseDueAt(body.dueAt)
    const subtasks = normalizeSubtasks(body.subtasks)

    if (!title) return res.status(400).json({ error: 'title is required' })
    if (!dueAt) return res.status(400).json({ error: 'dueAt is required and must be a valid date' })
    if (subtasks.length === 0) return res.status(400).json({ error: 'subtasks must be a non-empty array' })

    const reward = body.attributeReward
    const rewardType = reward?.type
    const rewardValue = reward?.value

    if (!REWARD_TYPE.includes(rewardType)) return res.status(400).json({ error: 'attributeReward.type is invalid' })
    if (typeof rewardValue !== 'number' || !Number.isFinite(rewardValue) || rewardValue <= 0) {
      return res.status(400).json({ error: 'attributeReward.value must be a positive number' })
    }

    const selfAssign = body.selfAssign === true
    const task = await Task.create({
      title,
      detail,
      dueAt,
      startAt: new Date(),
      status: selfAssign ? 'in_progress' : 'pending',
      creatorId: userId,
      assigneeId: selfAssign ? userId : null,
      icon: body.icon,
      subtasks,
      attributeReward: { type: rewardType, value: rewardValue },
    })
    taskDebugLog('createTask ok', {
      userId,
      taskId: task._id?.toString?.() || task._id,
      status: task.status,
    })

    return res.status(201).json(buildResponse(task))
  } catch (error) {
    console.error('createTask error:', error)
    return res.status(500).json({ error: 'create task failed' })
  }
}

exports.getAllTasks = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { status } = req.query || {}
    const query = { $or: [{ creatorId: userId }, { assigneeId: userId }, { creatorId: SYSTEM_USER_ID }] }

    if (status !== undefined) {
      if (typeof status !== 'string' || !TASK_STATUS.includes(status)) {
        return res.status(400).json({ error: 'invalid status' })
      }
      query.status = status
    }

    const tasks = await Task.find(query).sort({ dueAt: 1, createdAt: -1 })
    return res.json(tasks.map((t) => buildResponse(t)))
  } catch (error) {
    console.error('getAllTasks error:', error)
    return res.status(500).json({ error: 'get tasks failed' })
  }
}

exports.getTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })
    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })

    if (!visibleToUserId(task, userId)) {
      const canPreviewShared = task.status === 'pending' && !task.assigneeId
      if (!canPreviewShared) {
        const hasAccess = await Task.exists({
          previousTaskId: task._id,
          $or: [{ creatorId: userId }, { assigneeId: userId }],
        })
        if (!hasAccess) return res.status(403).json({ error: 'forbidden' })
      }
    }

    return res.json(buildResponse(task))
  } catch (error) {
    console.error('getTask error:', error)
    return res.status(500).json({ error: 'get task failed' })
  }
}

exports.getMissionTasks = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    taskDebugLog('getMissionTasks start', { userId })
    const reworkedIds = await fetchReworkedIds()
    const query = {
      assigneeId: userId,
      status: { $in: ACTIVE_ASSIGNEE_STATUS },
    }
    if (reworkedIds.length > 0) {
      query._id = { $nin: reworkedIds }
    }
    const tasks = await Task.find(query).sort({ dueAt: 1, createdAt: -1 })
    taskDebugLog('getMissionTasks ok', { userId, count: tasks.length })

    return res.json(tasks.map((t) => buildResponse(t)))
  } catch (error) {
    console.error('getMissionTasks error:', error)
    return res.status(500).json({ error: 'get mission tasks failed' })
  }
}

exports.getCollabTasks = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const now = new Date()
    const reworkedIds = await fetchReworkedIds()
    const query = {
      creatorId: userId,
      status: { $ne: 'refactored' },
      $and: [
        { assigneeId: { $ne: userId } },
        {
          $or: [
            { status: { $ne: 'completed' } },
            {
              $and: [
                { status: 'completed' },
                { assigneeId: { $ne: userId } },
                { assigneeId: { $ne: null } },
              ],
            },
          ],
        },
        { $or: [{ status: { $ne: 'closed' } }, { dueAt: { $gte: now } }] },
      ],
    }
    if (reworkedIds.length > 0) {
      query._id = { $nin: reworkedIds }
    }
    const tasks = await Task.find(query).sort({ dueAt: 1, createdAt: -1 })

    taskDebugLog('getCollabTasks ok', { userId, count: tasks.length })
    return res.json(tasks.map((t) => buildResponse(t)))
  } catch (error) {
    console.error('getCollabTasks error:', error)
    return res.status(500).json({ error: 'get collab tasks failed' })
  }
}

exports.getTaskDebug = async (req, res) => {
  const userId = ensureAuthorized(req, res)
  if (!userId) return
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'not found' })
  return res.json({ ok: true, enabled: taskDebugEnabled })
}

exports.setTaskDebug = async (req, res) => {
  const userId = ensureAuthorized(req, res)
  if (!userId) return
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'not found' })
  const enabled = parseBoolean(req.body?.enabled)
  if (enabled === null) return res.status(400).json({ error: 'enabled is required' })
  taskDebugEnabled = enabled
  return res.json({ ok: true, enabled: taskDebugEnabled })
}

exports.closeTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })
    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })

    if (task.creatorId !== userId) return res.status(403).json({ error: 'forbidden' })
    if (task.status === 'closed') return res.json(buildResponse(task))

    const now = new Date()
    const deleteAt = new Date(now.getTime() + CLOSE_RETENTION_DAYS * 24 * 60 * 60 * 1000)

    const hadAssignee = Boolean(task.assigneeId)
    const previousAssigneeId = task.assigneeId
    const originalStatus = task.originalStatus || (hadAssignee ? 'pending' : task.status)
    const originalStartAt = task.originalStartAt || task.startAt || task.createdAt
    const originalDueAt = task.originalDueAt || task.dueAt

    const update = {
      originalStatus,
      originalStartAt,
      originalDueAt,
      closedAt: now,
      deleteAt,
      startAt: now,
      dueAt: deleteAt,
      status: 'closed',
      assigneeId: null,
      updatedAt: now,
    }

    const updated = await Task.findOneAndUpdate(
      {
        _id: task._id,
        creatorId: userId,
        status: task.status,
        assigneeId: task.assigneeId,
        updatedAt: task.updatedAt,
      },
      { $set: update },
      { new: true, runValidators: true }
    )

    if (!updated) return conflict(res)
    const templateId = process.env.SUBSCRIBE_TPL_WORK
    if (templateId && isWechatUserId(previousAssigneeId)) {
      await sendSubscribeMessage({
        toUserId: previousAssigneeId,
        templateId,
        page: 'pages/index/index',
        dataByLabel: {
          [LABELS.taskName]: updated.title || VALUES.taskReminder,
          [LABELS.assignee]: VALUES.assigneeTaken,
          [LABELS.startTime]: formatDateTime(originalStartAt || updated.createdAt || now),
          [LABELS.dueTime]: formatDateTime(originalDueAt || updated.dueAt || updated.createdAt || now),
          [LABELS.taskStatus]: VALUES.taskClosed,
          [LABELS.note]: VALUES.taskClosed,
        },
        context: {
          event: 'task_closed',
          actorId: userId,
          taskId: updated._id?.toString?.() || updated._id,
        },
      })
    }
    return res.json(buildResponse(updated))
  } catch (error) {
    console.error('closeTask error:', error)
    return res.status(500).json({ error: 'close task failed' })
  }
}
exports.deleteTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })

    const session = await mongoose.startSession()
    let response = null
    let reviewNotify = null
    let cancelNotify = null
    let reworkNotify = null

    try {
      await session.withTransaction(async () => {
        const task = await Task.findById(id).session(session)
        if (!task) {
          const archived = await CompletedTask.findById(id).session(session)
          if (!archived) {
            throwAbort(404, { error: 'task not found' })
          }
          if (archived.ownerId !== userId) {
            throwAbort(403, { error: 'forbidden' })
          }
          if (archived.status === 'review_pending') {
            throwAbort(400, { error: 'review pending cannot be deleted' })
          }
          const result = await CompletedTask.deleteOne({ _id: archived._id, ownerId: userId }).session(session)
          if (!result.deletedCount) {
            throwAbort(409, { error: 'state changed' })
          }
          response = { status: 200, body: { ok: true } }
          return
        }
        if (task.creatorId !== userId) {
          throwAbort(403, { error: 'forbidden' })
        }
        if (task.assigneeId) {
          throwAbort(400, { error: 'task has assignee' })
        }

        const result = await Task.deleteOne({
          _id: task._id,
          creatorId: userId,
          assigneeId: null,
          status: task.status,
          updatedAt: task.updatedAt,
        }).session(session)

        if (!result.deletedCount) {
          throwAbort(409, { error: 'state changed' })
        }

        if (task.previousTaskId) {
          await deleteRefactoredChain(task.previousTaskId, userId, session)
        }

        response = { status: 200, body: { ok: true } }
        reviewNotify = {
          creatorId: task.creatorId,
          taskId: task._id,
          title: task.title,
        }
      })
    } finally {
      session.endSession()
    }

    if (response) {
      const templateId = process.env.SUBSCRIBE_TPL_REVIEW
      if (reviewNotify && templateId && isWechatUserId(reviewNotify.creatorId)) {
        try {
          await sendSubscribeMessage({
            toUserId: reviewNotify.creatorId,
            templateId,
            page: 'pages/index/index',
            dataByLabel: {
              [LABELS.reviewType]: VALUES.reviewTypeTaskChange,
              [LABELS.reviewResult]: VALUES.reworkRejected,
              [LABELS.notifyTime]: formatDateTime(new Date()),
              [LABELS.rejectReason]: VALUES.rejectReasonAssignee,
              [LABELS.note]: reviewNotify.title || VALUES.taskReminder,
            },
            context: {
              event: 'task_rework_rejected',
              actorId: userId,
              taskId: reviewNotify.taskId?.toString?.() || reviewNotify.taskId,
            },
          })
        } catch (error) {
          console.error('rejectReworkTask subscribe error:', error)
        }
      }
      return res.status(response.status).json(response.body)
    }

    return res.status(500).json({ error: 'delete task failed' })
  } catch (error) {
    if (error?.status && error?.body) return res.status(error.status).json(error.body)
    console.error('deleteTask error:', error)
    return res.status(500).json({ error: 'delete task failed' })
  }
}

exports.reworkTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })

    const body = req.body || {}
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const detail =
      typeof body.detail === 'string'
        ? body.detail.trim()
        : typeof body.description === 'string'
          ? body.description.trim()
          : ''
    const dueAt = parseDueAt(body.dueAt)
    const subtasks = normalizeSubtasks(body.subtasks)
    const reward = body.attributeReward
    const rewardType = reward?.type
    const rewardValue = reward?.value

    if (!title) return res.status(400).json({ error: 'title is required' })
    if (!dueAt) return res.status(400).json({ error: 'dueAt is required and must be a valid date' })
    if (subtasks.length === 0) return res.status(400).json({ error: 'subtasks must be a non-empty array' })
    if (!REWARD_TYPE.includes(rewardType)) return res.status(400).json({ error: 'attributeReward.type is invalid' })
    if (typeof rewardValue !== 'number' || !Number.isFinite(rewardValue) || rewardValue <= 0) {
      return res.status(400).json({ error: 'attributeReward.value must be a positive number' })
    }

    const session = await mongoose.startSession()
    let response = null

    try {
      await session.withTransaction(async () => {
        const original = await Task.findOne({ _id: id, creatorId: userId }).session(session)
        if (!original) {
          throwAbort(404, { error: 'task not found' })
        }
        if (original.status === 'refactored') {
          throwAbort(409, { error: 'state changed' })
        }

        if (original.previousTaskId && !body.confirmDeletePrevious) {
          response = {
            status: 200,
            body: { code: 'REWORK_CONFIRM_REQUIRED', previousTaskId: original.previousTaskId },
          }
          return
        }

        const isSame =
          title === original.title &&
          detail === (original.detail || '') &&
          Number(dueAt.getTime()) === Number(new Date(original.dueAt).getTime()) &&
          rewardType === original.attributeReward?.type &&
          Number(rewardValue) === Number(original.attributeReward?.value) &&
          areSubtasksEqual(
            subtasks,
            (original.subtasks || []).map((s) => ({ title: s.title, total: s.total }))
          )

        if (isSame) {
          response = { status: 200, body: { message: 'no changes', task: buildResponse(original) } }
          return
        }

        const originalStatus = original.originalStatus || original.status
        const originalStartAt = original.originalStartAt || original.startAt || original.createdAt
        const originalDueAt = original.originalDueAt || original.dueAt

        const now = new Date()
        const updatedOriginal = await Task.findOneAndUpdate(
          {
            _id: original._id,
            creatorId: userId,
            status: original.status,
            assigneeId: original.assigneeId,
            updatedAt: original.updatedAt,
          },
          {
            $set: {
              status: 'refactored',
              originalStatus,
              originalStartAt,
              originalDueAt,
              deleteAt: null,
              updatedAt: now,
            },
          },
          { new: true, runValidators: true, session }
        )

        if (!updatedOriginal) {
          throwAbort(409, { error: 'state changed' })
        }

        if (updatedOriginal.previousTaskId && body.confirmDeletePrevious && !updatedOriginal.assigneeId) {
          await deletePreviousTask(updatedOriginal, session)
        }

        const [newTask] = await Task.create(
          [
            {
              title,
              detail,
              dueAt,
              startAt: now,
              status: updatedOriginal.assigneeId ? 'pending_confirmation' : 'pending',
              creatorId: updatedOriginal.creatorId,
              assigneeId: updatedOriginal.assigneeId || null,
              icon: body.icon || updatedOriginal.icon,
              previousTaskId: updatedOriginal._id,
              subtasks,
              attributeReward: { type: rewardType, value: rewardValue },
            },
          ],
          { session }
        )

        response = { status: 201, body: buildResponse(newTask) }
        if (newTask.assigneeId && newTask.status === 'pending_confirmation') {
          reworkNotify = {
            assigneeId: newTask.assigneeId,
            taskId: newTask._id,
            title: newTask.title,
          }
        }
      })
    } finally {
      session.endSession()
    }

    if (response) {
      const templateId = process.env.SUBSCRIBE_TPL_TASK_UPDATE
      if (reworkNotify && templateId && isWechatUserId(reworkNotify.assigneeId)) {
        try {
          await sendSubscribeMessage({
            toUserId: reworkNotify.assigneeId,
            templateId,
            page: 'pages/index/index',
            dataByLabel: {
              [LABELS.cardName]: reworkNotify.title || VALUES.taskReminder,
              [LABELS.changeDetail]: VALUES.taskReworkedPending,
              [LABELS.changeTime]: formatDateTime(new Date()),
            },
            context: {
              event: 'task_rework_pending',
              actorId: userId,
              taskId: reworkNotify.taskId?.toString?.() || reworkNotify.taskId,
            },
          })
        } catch (error) {
          console.error('reworkTask subscribe error:', error)
        }
      }
      return res.status(response.status).json(response.body)
    }

    return res.status(500).json({ error: 'rework task failed' })
  } catch (error) {
    if (error?.status && error?.body) return res.status(error.status).json(error.body)
    console.error('reworkTask error:', error)
    return res.status(500).json({ error: 'rework task failed' })
  }
}

exports.acceptReworkTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })

    const session = await mongoose.startSession()
    let response = null

    try {
      await session.withTransaction(async () => {
        const task = await Task.findById(id).session(session)
        if (!task) {
          throwAbort(404, { error: 'task not found' })
        }
        if (task.assigneeId !== userId) {
          throwAbort(403, { error: 'forbidden' })
        }
        if (task.status !== 'pending_confirmation') {
          throwAbort(409, { error: 'state changed' })
        }

        const now = new Date()
        const updatedTask = await Task.findOneAndUpdate(
          {
            _id: task._id,
            assigneeId: userId,
            status: 'pending_confirmation',
            updatedAt: task.updatedAt,
          },
          { $set: { status: 'in_progress', updatedAt: now } },
          { new: true, runValidators: true, session }
        )

        if (!updatedTask) {
          throwAbort(409, { error: 'state changed' })
        }

        if (updatedTask.previousTaskId) {
          const previous = await Task.findById(updatedTask.previousTaskId).session(session)
          if (previous) {
            const originalStatus = previous.originalStatus || previous.status
            const originalStartAt = previous.originalStartAt || previous.startAt || previous.createdAt
            const originalDueAt = previous.originalDueAt || previous.dueAt

            const updatedPrevious = await Task.findOneAndUpdate(
              {
                _id: previous._id,
                updatedAt: previous.updatedAt,
              },
              {
                $set: {
                  status: 'refactored',
                  originalStatus,
                  originalStartAt,
                  originalDueAt,
                  updatedAt: now,
                },
              },
              { new: true, runValidators: true, session }
            )

            if (!updatedPrevious) {
              throwAbort(409, { error: 'state changed' })
            }

            await deletePreviousTask(updatedPrevious, session)
          }
        }

        response = { status: 200, body: buildResponse(updatedTask) }
        reviewNotify = {
          creatorId: updatedTask.creatorId,
          taskId: updatedTask._id,
          title: updatedTask.title,
        }
      })
    } finally {
      session.endSession()
    }

    if (response) {
      const templateId = process.env.SUBSCRIBE_TPL_REVIEW
      if (reviewNotify && templateId && isWechatUserId(reviewNotify.creatorId)) {
        try {
          await sendSubscribeMessage({
            toUserId: reviewNotify.creatorId,
            templateId,
            page: 'pages/index/index',
            dataByLabel: {
              [LABELS.reviewType]: VALUES.reviewTypeTaskChange,
              [LABELS.reviewResult]: VALUES.reworkAccepted,
              [LABELS.notifyTime]: formatDateTime(new Date()),
              [LABELS.note]: reviewNotify.title || VALUES.taskReminder,
            },
            context: {
              event: 'task_rework_accepted',
              actorId: userId,
              taskId: reviewNotify.taskId?.toString?.() || reviewNotify.taskId,
            },
          })
        } catch (error) {
          console.error('acceptReworkTask subscribe error:', error)
        }
      }
      return res.status(response.status).json(response.body)
    }

    return res.status(500).json({ error: 'accept rework failed' })
  } catch (error) {
    if (error?.status && error?.body) return res.status(error.status).json(error.body)
    console.error('acceptReworkTask error:', error)
    return res.status(500).json({ error: 'accept rework failed' })
  }
}

exports.rejectReworkTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })

    const session = await mongoose.startSession()
    let response = null

    try {
      await session.withTransaction(async () => {
        const task = await Task.findById(id).session(session)
        if (!task) {
          throwAbort(404, { error: 'task not found' })
        }
        if (task.assigneeId !== userId) {
          throwAbort(403, { error: 'forbidden' })
        }
        if (task.status !== 'pending_confirmation') {
          throwAbort(409, { error: 'state changed' })
        }

        const now = new Date()
        if (task.previousTaskId) {
          const previous = await Task.findById(task.previousTaskId).session(session)
          if (previous) {
            const originalStatus = previous.originalStatus || previous.status
            const originalStartAt = previous.originalStartAt || previous.startAt || previous.createdAt
            const originalDueAt = previous.originalDueAt || previous.dueAt

            const updatedPrevious = await Task.findOneAndUpdate(
              {
                _id: previous._id,
                updatedAt: previous.updatedAt,
              },
              {
                $set: {
                  status: 'refactored',
                  originalStatus,
                  originalStartAt,
                  originalDueAt,
                  updatedAt: now,
                },
              },
              { new: true, runValidators: true, session }
            )

            if (!updatedPrevious) {
              throwAbort(409, { error: 'state changed' })
            }

            await deletePreviousTask(updatedPrevious, session)
          }
        }

        const deleteAt = new Date(now.getTime() + CLOSE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
        const originalStartAt = task.originalStartAt || task.startAt || task.createdAt
        const originalDueAt = task.originalDueAt || task.dueAt

        const updatedTask = await Task.findOneAndUpdate(
          {
            _id: task._id,
            assigneeId: userId,
            status: 'pending_confirmation',
            updatedAt: task.updatedAt,
          },
          {
            $set: {
              originalStatus: 'pending',
              originalStartAt,
              originalDueAt,
              assigneeId: null,
              closedAt: now,
              deleteAt,
              startAt: now,
              dueAt: deleteAt,
              status: 'closed',
              updatedAt: now,
            },
          },
          { new: true, runValidators: true, session }
        )

        if (!updatedTask) {
          throwAbort(409, { error: 'state changed' })
        }

        response = { status: 200, body: { ok: true } }
        if (task.assigneeId) {
          cancelNotify = {
            assigneeId: task.assigneeId,
            taskId: task._id,
            title: task.title,
          }
        }
      })
    } finally {
      session.endSession()
    }

    if (response) {
      const templateId = process.env.SUBSCRIBE_TPL_TASK_UPDATE
      if (cancelNotify && templateId && isWechatUserId(cancelNotify.assigneeId)) {
        try {
          await sendSubscribeMessage({
            toUserId: cancelNotify.assigneeId,
            templateId,
            page: 'pages/index/index',
            dataByLabel: {
              [LABELS.cardName]: cancelNotify.title || VALUES.taskReminder,
              [LABELS.changeDetail]: VALUES.reworkCanceled,
              [LABELS.changeTime]: formatDateTime(new Date()),
            },
            context: {
              event: 'task_rework_canceled',
              actorId: userId,
              taskId: cancelNotify.taskId?.toString?.() || cancelNotify.taskId,
            },
          })
        } catch (error) {
          console.error('cancelReworkTask subscribe error:', error)
        }
      }
      return res.status(response.status).json(response.body)
    }

    return res.status(500).json({ error: 'reject rework failed' })
  } catch (error) {
    if (error?.status && error?.body) return res.status(error.status).json(error.body)
    console.error('rejectReworkTask error:', error)
    return res.status(500).json({ error: 'reject rework failed' })
  }
}

exports.cancelReworkTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })

    const session = await mongoose.startSession()
    let response = null

    try {
      await session.withTransaction(async () => {
        const task = await Task.findById(id).session(session)
        if (!task) {
          throwAbort(404, { error: 'task not found' })
        }
        if (task.creatorId !== userId) {
          throwAbort(403, { error: 'forbidden' })
        }
        if (task.status !== 'pending_confirmation') {
          throwAbort(409, { error: 'state changed' })
        }

        const now = new Date()
        const previousId = task.previousTaskId
        const deleteResult = await Task.deleteOne({
          _id: task._id,
          creatorId: userId,
          status: 'pending_confirmation',
          updatedAt: task.updatedAt,
        }).session(session)

        if (!deleteResult.deletedCount) {
          throwAbort(409, { error: 'state changed' })
        }

        if (previousId) {
          const previous = await Task.findById(previousId).session(session)
          if (previous && previous.creatorId === userId && previous.status === 'refactored') {
            const startAt = previous.originalStartAt || previous.startAt || previous.createdAt
            const dueAt = previous.originalDueAt || previous.dueAt

            const updatedPrevious = await Task.findOneAndUpdate(
              { _id: previous._id, updatedAt: previous.updatedAt },
              {
                $set: {
                  status: 'in_progress',
                  startAt,
                  dueAt,
                  closedAt: null,
                  originalStatus: null,
                  originalStartAt: null,
                  originalDueAt: null,
                  updatedAt: now,
                },
              },
              { new: true, runValidators: true, session }
            )

            if (!updatedPrevious) {
              throwAbort(409, { error: 'state changed' })
            }
          }
        }

        response = { status: 200, body: { ok: true } }
      })
    } finally {
      session.endSession()
    }

    if (response) {
      return res.status(response.status).json(response.body)
    }

    return res.status(500).json({ error: 'cancel rework failed' })
  } catch (error) {
    if (error?.status && error?.body) return res.status(error.status).json(error.body)
    console.error('cancelReworkTask error:', error)
    return res.status(500).json({ error: 'cancel rework failed' })
  }
}

exports.restartTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })
    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })

    if (task.creatorId !== userId) return res.status(403).json({ error: 'forbidden' })
    if (task.status !== 'closed') return res.status(400).json({ error: 'task is not closed' })
    if (!task.originalDueAt) return res.status(400).json({ error: 'originalDueAt is missing' })

    const now = new Date()
    const startAt = task.originalStartAt || task.startAt || task.createdAt
    const status =
      task.originalStatus && TASK_STATUS.includes(task.originalStatus) ? task.originalStatus : 'in_progress'

    const updated = await Task.findOneAndUpdate(
      {
        _id: task._id,
        creatorId: userId,
        status: 'closed',
        updatedAt: task.updatedAt,
      },
      {
        $set: {
          dueAt: task.originalDueAt,
          startAt,
          status,
          closedAt: null,
          deleteAt: null,
          originalDueAt: null,
          originalStartAt: null,
          originalStatus: null,
          updatedAt: now,
        },
      },
      { new: true, runValidators: true }
    )

    if (!updated) return conflict(res)
    return res.json(buildResponse(updated))
  } catch (error) {
    console.error('restartTask error:', error)
    return res.status(500).json({ error: 'restart task failed' })
  }
}

exports.refreshTaskSchedule = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })

    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })

    if (task.creatorId !== userId) return res.status(403).json({ error: 'forbidden' })
    if (task.assigneeId) return res.status(400).json({ error: 'task already assigned' })
    if (task.status !== 'pending') return conflict(res)

    const now = new Date()
    if (!task.dueAt) return res.status(400).json({ error: 'task missing dueAt' })
    if (task.dueAt.getTime() >= now.getTime()) {
      return res.status(400).json({ error: 'task not overdue' })
    }

    const baseStart = task.startAt || task.createdAt
    if (!baseStart) return res.status(400).json({ error: 'task missing startAt' })

    const durationMs = Math.max(60000, task.dueAt.getTime() - baseStart.getTime())
    const nextDueAt = new Date(now.getTime() + durationMs)

    const updated = await Task.findOneAndUpdate(
      { _id: task._id, status: 'pending', assigneeId: null, updatedAt: task.updatedAt },
      { $set: { startAt: now, dueAt: nextDueAt, updatedAt: now } },
      { new: true, runValidators: true }
    )

    if (!updated) return conflict(res)

    return res.json(buildResponse(updated))
  } catch (error) {
    console.error('refreshTaskSchedule error:', error)
    return res.status(500).json({ error: 'refresh task failed' })
  }
}

exports.getArchivedTasks = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const tasks = await CompletedTask.find({ ownerId: userId }).sort({ updatedAt: -1 })
    const sorted = tasks.sort((a, b) => {
      const aTime = a.submittedAt || a.completedAt || a.updatedAt
      const bTime = b.submittedAt || b.completedAt || b.updatedAt
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

    return res.json(sorted.map((t) => buildArchiveResponse(t)))
  } catch (error) {
    console.error('getArchivedTasks error:', error)
    return res.status(500).json({ error: 'get archived tasks failed' })
  }
}

exports.getChallengeTasks = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const now = new Date()
    const { creatorId, start, end, seeds } = getDailyChallengeSeeds(userId, now, 5)
    const seedKeys = seeds.map((s) => s.seedKey)
    const existing = await Task.find({ creatorId, seedKey: { $in: seedKeys } }).sort({ createdAt: 1 })
    const existingMap = new Map(existing.map((t) => [t.seedKey, t]))
    const result = []

    seeds.forEach(({ seedKey, template }) => {
      const task = existingMap.get(seedKey)
      if (task) {
        if (task.status === 'pending' && !task.assigneeId) {
          result.push(buildResponse(task))
        }
        return
      }
      result.push(buildChallengeVirtualTask({ template, seedKey, creatorId, start, end }))
    })

    return res.json(result)
  } catch (error) {
    console.error('getChallengeTasks error:', error)
    return res.status(500).json({ error: 'get challenge tasks failed' })
  }
}

exports.acceptChallengeTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    taskDebugLog('acceptChallengeTask start', { userId, taskId: req.params?.id })
    const { id } = req.params
    const isObjectId = isValidObjectId(id)

    const now = new Date()
    const { creatorId, start, end, seeds } = getDailyChallengeSeeds(userId, now, 5)
    const seedKeys = new Set(seeds.map((s) => s.seedKey))

    if (!isObjectId && !seedKeys.has(id)) return res.status(404).json({ error: 'task not found' })

    let task = null
    if (isObjectId) {
      task = await Task.findById(id)
    } else {
      task = await Task.findOne({ creatorId, seedKey: id })
    }

    if (task) {
      if (task.creatorId !== creatorId) return res.status(403).json({ error: 'forbidden' })
      if (task.assigneeId) return res.status(400).json({ error: 'task already assigned' })
      if (task.status !== 'pending') return res.status(400).json({ error: 'task is not pending' })

      const updated = await Task.findOneAndUpdate(
        {
          _id: task._id,
          creatorId,
          status: 'pending',
          assigneeId: null,
          updatedAt: task.updatedAt,
        },
        { $set: { assigneeId: userId, status: 'in_progress', updatedAt: now } },
        { new: true, runValidators: true }
      )

      if (!updated) return conflict(res)
      taskDebugLog('acceptChallengeTask ok', {
        userId,
        taskId: updated._id?.toString?.() || updated._id,
        status: updated.status,
        assigneeId: updated.assigneeId,
      })

      if (!updated.deleteAt && updated.dueAt) {
        await Task.updateOne(
          { _id: updated._id, deleteAt: null },
          { $set: { deleteAt: updated.dueAt, updatedAt: now } }
        )
        updated.deleteAt = updated.dueAt
      }

      return res.json(buildResponse(updated))
    }

    const picked = seeds.find((s) => s.seedKey === id)
    if (!picked) return res.status(404).json({ error: 'task not found' })

    const seed = buildChallengeTaskSeed({
      template: picked.template,
      seedKey: picked.seedKey,
      creatorId,
      start,
      end,
      assigneeId: userId,
      status: 'in_progress',
      includeDeleteAt: true,
    })
    const created = await Task.create(seed)
    taskDebugLog('acceptChallengeTask ok', {
      userId,
      taskId: created._id?.toString?.() || created._id,
      status: created.status,
      assigneeId: created.assigneeId,
    })

    return res.json(buildResponse(created))
  } catch (error) {
    console.error('acceptChallengeTask error:', error)
    return res.status(500).json({ error: 'accept challenge failed' })
  }
}

exports.acceptTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })

    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })
    if (isChallengeTask(task)) {
      return res.status(400).json({ error: 'challenge task must be accepted via challenge flow' })
    }
    if (task.assigneeId) return res.status(400).json({ error: 'task already assigned' })
    if (task.status !== 'pending') return conflict(res)

    const now = new Date()
    if (task.dueAt && task.dueAt.getTime() < now.getTime()) {
      return res.status(409).json({ error: 'task expired' })
    }
    const updated = await Task.findOneAndUpdate(
      {
        _id: task._id,
        status: 'pending',
        assigneeId: null,
        updatedAt: task.updatedAt,
      },
      { $set: { assigneeId: userId, status: 'in_progress', updatedAt: now } },
      { new: true, runValidators: true }
    )

    if (!updated) return conflict(res)

    taskDebugLog('acceptTask ok', {
      userId,
      taskId: updated._id?.toString?.() || updated._id,
      status: updated.status,
      assigneeId: updated.assigneeId,
    })

    const templateId = process.env.SUBSCRIBE_TPL_WORK
    if (templateId && isWechatUserId(updated.creatorId)) {
      try {
        const startTime = updated.startAt || updated.createdAt || now
        const dueTime = updated.dueAt || updated.startAt || updated.createdAt || now
        await sendSubscribeMessage({
          toUserId: updated.creatorId,
          templateId,
          page: 'pages/index/index',
          dataByLabel: {
            [LABELS.taskName]: updated.title || VALUES.taskReminder,
            [LABELS.assignee]: VALUES.assigneeTaken,
            [LABELS.startTime]: formatDateTime(startTime),
            [LABELS.dueTime]: formatDateTime(dueTime),
            [LABELS.taskStatus]: VALUES.taskAssigned,
          },
          context: {
            event: 'task_assigned',
            actorId: userId,
            taskId: updated._id?.toString?.() || updated._id,
          },
        })
      } catch (error) {
        console.error('acceptTask subscribe error:', error)
      }
    }

    return res.json(buildResponse(updated))
  } catch (error) {
    console.error('acceptTask error:', error)
    return res.status(500).json({ error: 'accept task failed' })
  }
}

exports.getTodayTasks = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    taskDebugLog('getTodayTasks start', { userId })
    const now = new Date()
    const start = startOfDay(now)
    const end = endOfDay(now)

    const reworkedIds = await fetchReworkedIds()
    const query = {
      assigneeId: userId,
      status: { $in: ACTIVE_ASSIGNEE_STATUS },
    }
    if (reworkedIds.length > 0) {
      query._id = { $nin: reworkedIds }
    }
    const base = await Task.find(query).sort({ dueAt: 1, createdAt: -1 })

    const overdue = base.filter((t) => t.dueAt && t.dueAt < start)
    const dueToday = base.filter((t) => t.dueAt && t.dueAt >= start && t.dueAt <= end)
    const upcoming = base.filter((t) => t.dueAt && t.dueAt > end)

    const dueNow = [...overdue, ...dueToday]
    const picked = (dueNow.length >= 5 ? dueNow : [...dueNow, ...upcoming]).slice(0, 5)

    taskDebugLog('getTodayTasks ok', { userId, dueToday: dueToday.length, picked: picked.length })
    return res.json({
      dueTodayCount: dueToday.length,
      tasks: picked.map((t) => buildResponse(t)),
    })
  } catch (error) {
    console.error('getTodayTasks error:', error)
    return res.status(500).json({ error: 'get today tasks failed' })
  }
}

exports.updateProgress = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })
    const body = req.body || {}
    const index = Number(body.subtaskIndex)
    const current = body.current

    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })

    if (task.assigneeId !== userId) return res.status(403).json({ error: 'forbidden' })
    if (task.status !== 'in_progress') {
      return conflict(res)
    }

    if (!Number.isInteger(index) || typeof current !== 'number') {
      return res.status(400).json({ error: 'subtaskIndex and current are required' })
    }
    if (!task.subtasks[index]) return res.status(400).json({ error: 'subtaskIndex out of range' })

    const st = task.subtasks[index]
    const nextCurrent = clamp(Math.floor(current), 0, st.total)

    const now = new Date()
    const updated = await Task.findOneAndUpdate(
      {
        _id: task._id,
        assigneeId: userId,
        status: 'in_progress',
        updatedAt: task.updatedAt,
      },
      { $set: { [`subtasks.${index}.current`]: nextCurrent, updatedAt: now } },
      { new: true, runValidators: true }
    )

    if (!updated) return conflict(res)

    return res.json(buildResponse(updated))
  } catch (error) {
    console.error('updateProgress error:', error)
    return res.status(500).json({ error: 'update progress failed' })
  }
}

exports.submitReview = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })
    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })

    if (task.assigneeId !== userId) return res.status(403).json({ error: 'forbidden' })
    if (task.status !== 'in_progress') return conflict(res)

    const now = new Date()
    const updatedSubtasks = task.subtasks.map((st) => ({ ...st.toObject(), current: st.total }))
    const reviewRecord = buildReviewRecord(task, now)

    const session = await mongoose.startSession()
    let response = null
    let reviewNotify = null
    try {
      await session.withTransaction(async () => {
        const updated = await Task.findOneAndUpdate(
          {
            _id: task._id,
            assigneeId: userId,
            status: 'in_progress',
            updatedAt: task.updatedAt,
          },
          { $set: { subtasks: updatedSubtasks, status: 'review_pending', submittedAt: now, updatedAt: now } },
          { new: true, runValidators: true, session }
        )

        if (!updated) {
          throwAbort(409, { error: 'state changed' })
        }

        if (reviewRecord) {
          await CompletedTask.deleteMany({
            sourceTaskId: task._id,
            ownerId: userId,
            status: 'review_pending',
          }).session(session)
          await CompletedTask.create([reviewRecord], { session })
        }

        response = { status: 200, body: buildResponse(updated) }
        reviewNotify = {
          creatorId: updated.creatorId,
          taskId: updated._id,
          title: updated.title,
        }
      })
    } finally {
      session.endSession()
    }

    if (!response) return res.status(500).json({ error: 'submit review failed' })

    const templateId = process.env.SUBSCRIBE_TPL_REVIEW
    if (reviewNotify && templateId && isWechatUserId(reviewNotify.creatorId)) {
      try {
        await sendSubscribeMessage({
          toUserId: reviewNotify.creatorId,
          templateId,
          page: 'pages/index/index',
          dataByLabel: {
            [LABELS.reviewType]: VALUES.reviewTypeSubmit,
            [LABELS.reviewResult]: VALUES.reviewResultPending,
            [LABELS.notifyTime]: formatDateTime(new Date()),
            [LABELS.note]: reviewNotify.title || VALUES.taskReminder,
          },
          context: {
            event: 'task_review_submitted',
            actorId: userId,
            taskId: reviewNotify.taskId?.toString?.() || reviewNotify.taskId,
          },
        })
      } catch (error) {
        console.error('submitReview subscribe error:', error)
      }
    }
    return res.status(response.status).json(response.body)
  } catch (error) {
    console.error('submitReview error:', error)
    return res.status(500).json({ error: 'submit review failed' })
  }
}

exports.continueReview = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })
    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })

    if (task.creatorId !== userId) return res.status(403).json({ error: 'forbidden' })
    if (task.status !== 'review_pending') return conflict(res)

    const now = new Date()
    const session = await mongoose.startSession()
    let response = null
    try {
      await session.withTransaction(async () => {
        const updated = await Task.findOneAndUpdate(
          {
            _id: task._id,
            creatorId: userId,
            status: 'review_pending',
            updatedAt: task.updatedAt,
          },
          { $set: { status: 'in_progress', submittedAt: null, updatedAt: now } },
          { new: true, runValidators: true, session }
        )

        if (!updated) {
          throwAbort(409, { error: 'state changed' })
        }

        await CompletedTask.deleteMany({
          sourceTaskId: task._id,
          status: 'review_pending',
        }).session(session)

        response = { status: 200, body: buildResponse(updated) }
      })
    } finally {
      session.endSession()
    }

    if (response) return res.status(response.status).json(response.body)
    return res.status(500).json({ error: 'continue review failed' })
  } catch (error) {
    console.error('continueReview error:', error)
    return res.status(500).json({ error: 'continue review failed' })
  }
}

exports.completeTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })
    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })

    const visible = task.creatorId === userId || task.assigneeId === userId
    if (!visible) return res.status(403).json({ error: 'forbidden' })

    const updatedSubtasks = task.subtasks.map((st) => ({ ...st.toObject(), current: st.total }))
    const now = new Date()
    const deleteAt = getCompletionDeleteAt(task, now)

    const session = await mongoose.startSession()
    let response = null
    try {
      await session.withTransaction(async () => {
        const updated = await Task.findOneAndUpdate(
          { _id: task._id, updatedAt: task.updatedAt },
          { $set: { subtasks: updatedSubtasks, status: 'completed', updatedAt: now, deleteAt } },
          { new: true, runValidators: true, session }
        )

        if (!updated) {
          throwAbort(409, { error: 'state changed' })
        }

        if (task.status === 'review_pending') {
          await CompletedTask.deleteMany({
            sourceTaskId: task._id,
            status: 'review_pending',
          }).session(session)
        }

        const records = buildCompletionRecords(updated, now, deleteAt)
        if (records.length > 0) {
          await CompletedTask.insertMany(records, { session })
        }

        response = { status: 200, body: buildResponse(updated) }
      })
    } finally {
      session.endSession()
    }

    if (response) {
      return res.status(response.status).json(response.body)
    }

    return res.status(500).json({ error: 'complete task failed' })
  } catch (error) {
    console.error('completeTask error:', error)
    return res.status(500).json({ error: 'complete task failed' })
  }
}

exports.abandonTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })
    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })

    if (task.assigneeId !== userId) return res.status(403).json({ error: 'forbidden' })
    if (!['in_progress', 'review_pending'].includes(task.status)) return conflict(res)

    const now = new Date()
    const updated = await Task.findOneAndUpdate(
      {
        _id: task._id,
        assigneeId: userId,
        status: task.status,
        updatedAt: task.updatedAt,
      },
      { $set: { assigneeId: null, status: 'pending', updatedAt: now } },
      { new: true, runValidators: true }
    )

    if (!updated) return conflict(res)

    const templateId = process.env.SUBSCRIBE_TPL_WORK
    if (templateId && isWechatUserId(updated.creatorId)) {
      try {
        await sendSubscribeMessage({
          toUserId: updated.creatorId,
          templateId,
          page: 'pages/index/index',
          dataByLabel: {
            [LABELS.taskName]: updated.title || VALUES.taskReminder,
            [LABELS.assignee]: VALUES.assigneeTaken,
            [LABELS.startTime]: formatDateTime(updated.startAt || updated.createdAt),
            [LABELS.dueTime]: formatDateTime(updated.dueAt || updated.createdAt),
            [LABELS.taskStatus]: VALUES.taskPending,
            [LABELS.noteMessage]: VALUES.taskAbandoned,
          },
          context: {
            event: 'task_abandoned',
            actorId: userId,
            taskId: updated._id?.toString?.() || updated._id,
          },
        })
      } catch (error) {
        console.error('abandonTask subscribe error:', error)
      }
    }

    return res.json(buildResponse(updated))
  } catch (error) {
    console.error('abandonTask error:', error)
    return res.status(500).json({ error: 'abandon task failed' })
  }
}
