const Task = require('../models/Task')
const mongoose = require('mongoose')
const { ensureUserChallengeTasks } = require('../utils/seedTasks')

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
const ACTIVE_ASSIGNEE_STATUS = ['in_progress', 'review_pending', 'pending_confirmation']
const CLOSE_RETENTION_DAYS = 7

const clamp = (value, min, max) => Math.max(min, Math.min(value, max))

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id)

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

const parseDueAt = (value) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

const fetchReworkedIds = async () =>
  Task.distinct('previousTaskId', { previousTaskId: { $ne: null } })

const deletePreviousTask = async (taskDoc) => {
  if (!taskDoc?.previousTaskId) return
  await Task.deleteOne({ _id: taskDoc.previousTaskId })
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

    const task = await Task.create({
      title,
      detail,
      dueAt,
      startAt: new Date(),
      status: 'pending',
      creatorId: userId,
      assigneeId: null,
      icon: body.icon,
      subtasks,
      attributeReward: { type: rewardType, value: rewardValue },
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
      const hasAccess = await Task.exists({
        previousTaskId: task._id,
        $or: [{ creatorId: userId }, { assigneeId: userId }],
      })
      if (!hasAccess) return res.status(403).json({ error: 'forbidden' })
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

    const reworkedIds = await fetchReworkedIds()
    const tasks = await Task.find({
      assigneeId: userId,
      status: { $in: ACTIVE_ASSIGNEE_STATUS },
      _id: reworkedIds.length > 0 ? { $nin: reworkedIds } : undefined,
    }).sort({ dueAt: 1, createdAt: -1 })

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
    const tasks = await Task.find({
      creatorId: userId,
      status: { $nin: ['completed', 'refactored'] },
      $or: [{ status: { $ne: 'closed' } }, { dueAt: { $gte: now } }],
      _id: reworkedIds.length > 0 ? { $nin: reworkedIds } : undefined,
    }).sort({ dueAt: 1, createdAt: -1 })

    return res.json(tasks.map((t) => buildResponse(t)))
  } catch (error) {
    console.error('getCollabTasks error:', error)
    return res.status(500).json({ error: 'get collab tasks failed' })
  }
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
    if (task.assigneeId) return res.status(400).json({ error: '请执行人放弃任务后再关闭' })

    const now = new Date()
    const deleteAt = new Date(now.getTime() + CLOSE_RETENTION_DAYS * 24 * 60 * 60 * 1000)

    task.originalDueAt = task.dueAt
    task.originalStartAt = task.startAt || task.createdAt
    task.originalStatus = task.status

    task.closedAt = now
    task.startAt = now
    task.dueAt = deleteAt
    task.status = 'closed'

    await task.save()
    return res.json(buildResponse(task))
  } catch (error) {
    console.error('closeTask error:', error)
    return res.status(500).json({ error: 'close task failed' })
  }
}

exports.reworkTask = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const { id } = req.params
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' })

    const original = await Task.findById(id)
    if (!original) return res.status(404).json({ error: 'task not found' })
    if (original.creatorId !== userId) return res.status(403).json({ error: 'forbidden' })

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

    if (original.previousTaskId && !body.confirmDeletePrevious) {
      return res.json({
        code: 'REWORK_CONFIRM_REQUIRED',
        previousTaskId: original.previousTaskId,
      })
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
      return res.json({ message: 'no changes', task: buildResponse(original) })
    }

    if (original.previousTaskId && body.confirmDeletePrevious && !original.assigneeId) {
      await deletePreviousTask(original)
    }

    const now = new Date()
    const originalStatus = original.originalStatus || original.status
    const originalStartAt = original.originalStartAt || original.startAt || original.createdAt
    const originalDueAt = original.originalDueAt || original.dueAt

    original.status = 'refactored'
    original.originalStatus = originalStatus
    original.originalStartAt = originalStartAt
    original.originalDueAt = originalDueAt

    if (!original.assigneeId) {
      const deleteAt = new Date(now.getTime() + CLOSE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
      original.closedAt = now
      original.startAt = now
      original.dueAt = deleteAt
    }

    await original.save()

    const newTask = await Task.create({
      title,
      detail,
      dueAt,
      startAt: now,
      status: original.assigneeId ? 'pending_confirmation' : 'pending',
      creatorId: original.creatorId,
      assigneeId: original.assigneeId || null,
      icon: body.icon || original.icon,
      previousTaskId: original._id,
      subtasks,
      attributeReward: { type: rewardType, value: rewardValue },
    })

    return res.status(201).json(buildResponse(newTask))
  } catch (error) {
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

    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })
    if (task.assigneeId !== userId) return res.status(403).json({ error: 'forbidden' })
    if (task.status !== 'pending_confirmation') {
      return res.status(400).json({ error: 'task is not pending_confirmation' })
    }

    task.status = 'in_progress'
    await task.save()

    if (task.previousTaskId) {
      const previous = await Task.findById(task.previousTaskId)
      if (previous) {
        if (!previous.originalStatus) previous.originalStatus = previous.status
        if (!previous.originalStartAt) previous.originalStartAt = previous.startAt || previous.createdAt
        if (!previous.originalDueAt) previous.originalDueAt = previous.dueAt
        previous.status = 'refactored'
        await previous.save()
        await deletePreviousTask(previous)
      }
    }

    return res.json(buildResponse(task))
  } catch (error) {
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

    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })
    if (task.assigneeId !== userId) return res.status(403).json({ error: 'forbidden' })
    if (task.status !== 'pending_confirmation') {
      return res.status(400).json({ error: 'task is not pending_confirmation' })
    }

    const previousId = task.previousTaskId
    if (previousId) {
      const previous = await Task.findById(previousId)
      if (previous) {
        if (!previous.originalStatus) previous.originalStatus = previous.status
        if (!previous.originalStartAt) previous.originalStartAt = previous.startAt || previous.createdAt
        if (!previous.originalDueAt) previous.originalDueAt = previous.dueAt
        previous.status = 'refactored'
        await previous.save()
        await deletePreviousTask(previous)
      }
    }

    const now = new Date()
    const deleteAt = new Date(now.getTime() + CLOSE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    task.originalStatus = 'pending'
    task.originalStartAt = task.startAt || task.createdAt
    task.originalDueAt = task.dueAt
    task.assigneeId = null
    task.closedAt = now
    task.startAt = now
    task.dueAt = deleteAt
    task.status = 'closed'
    await task.save()

    return res.json({ ok: true })
  } catch (error) {
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

    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: 'task not found' })
    if (task.creatorId !== userId) return res.status(403).json({ error: 'forbidden' })
    if (task.status !== 'pending_confirmation') {
      return res.status(400).json({ error: 'task is not pending_confirmation' })
    }

    const previousId = task.previousTaskId
    await Task.deleteOne({ _id: task._id })

    if (previousId) {
      const previous = await Task.findById(previousId)
      if (previous && previous.creatorId === userId && previous.status === 'refactored') {
        previous.status = 'in_progress'
        if (previous.originalStartAt) previous.startAt = previous.originalStartAt
        if (previous.originalDueAt) previous.dueAt = previous.originalDueAt
        previous.closedAt = null
        previous.originalStatus = null
        previous.originalStartAt = null
        previous.originalDueAt = null
        await previous.save()
      }
    }

    return res.json({ ok: true })
  } catch (error) {
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

    task.dueAt = task.originalDueAt
    task.startAt = task.originalStartAt || task.startAt || task.createdAt
    task.status = task.originalStatus && TASK_STATUS.includes(task.originalStatus) ? task.originalStatus : 'in_progress'

    task.closedAt = null
    task.originalDueAt = null
    task.originalStartAt = null
    task.originalStatus = null

    await task.save()
    return res.json(buildResponse(task))
  } catch (error) {
    console.error('restartTask error:', error)
    return res.status(500).json({ error: 'restart task failed' })
  }
}

exports.getArchivedTasks = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const tasks = await Task.find({
      status: 'completed',
      $or: [{ creatorId: userId }, { assigneeId: userId }],
    }).sort({ updatedAt: -1 })

    return res.json(tasks.map((t) => buildResponse(t)))
  } catch (error) {
    console.error('getArchivedTasks error:', error)
    return res.status(500).json({ error: 'get archived tasks failed' })
  }
}

exports.getChallengeTasks = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    try {
      await ensureUserChallengeTasks(userId, 5)
    } catch (err) {
      console.error('ensureUserChallengeTasks error:', err)
    }

    const now = new Date()
    const start = startOfDay(now)
    const end = endOfDay(now)

    const tasks = await Task.find({
      creatorId: `sys:${userId}`,
      status: 'pending',
      assigneeId: null,
      dueAt: { $gte: start, $lte: end },
    }).sort({ createdAt: 1 })

    return res.json(tasks.map((t) => buildResponse(t)))
  } catch (error) {
    console.error('getChallengeTasks error:', error)
    return res.status(500).json({ error: 'get challenge tasks failed' })
  }
}

exports.getTodayTasks = async (req, res) => {
  try {
    const userId = ensureAuthorized(req, res)
    if (!userId) return

    const now = new Date()
    const start = startOfDay(now)
    const end = endOfDay(now)

    const reworkedIds = await fetchReworkedIds()
    const base = await Task.find({
      assigneeId: userId,
      status: { $in: ACTIVE_ASSIGNEE_STATUS },
      _id: reworkedIds.length > 0 ? { $nin: reworkedIds } : undefined,
    }).sort({ dueAt: 1, createdAt: -1 })

    const overdue = base.filter((t) => t.dueAt && t.dueAt < start)
    const dueToday = base.filter((t) => t.dueAt && t.dueAt >= start && t.dueAt <= end)
    const upcoming = base.filter((t) => t.dueAt && t.dueAt > end)

    const dueNow = [...overdue, ...dueToday]
    const picked = (dueNow.length >= 5 ? dueNow : [...dueNow, ...upcoming]).slice(0, 5)

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

    const visible = task.creatorId === userId || task.assigneeId === userId
    if (!visible) return res.status(403).json({ error: 'forbidden' })
    if (task.status !== 'in_progress') {
      return res.status(400).json({ error: 'progress can only be updated for in_progress tasks' })
    }

    if (!Number.isInteger(index) || typeof current !== 'number') {
      return res.status(400).json({ error: 'subtaskIndex and current are required' })
    }
    if (!task.subtasks[index]) return res.status(400).json({ error: 'subtaskIndex out of range' })

    const st = task.subtasks[index]
    st.current = clamp(Math.floor(current), 0, st.total)
    await task.save()

    return res.json(buildResponse(task))
  } catch (error) {
    console.error('updateProgress error:', error)
    return res.status(500).json({ error: 'update progress failed' })
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

    task.subtasks = task.subtasks.map((st) => ({ ...st.toObject(), current: st.total }))
    task.status = 'completed'
    await task.save()

    return res.json(buildResponse(task))
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

    const visible = task.creatorId === userId || task.assigneeId === userId
    if (!visible) return res.status(403).json({ error: 'forbidden' })

    task.assigneeId = null
    task.status = 'pending'
    await task.save()

    return res.json(buildResponse(task))
  } catch (error) {
    console.error('abandonTask error:', error)
    return res.status(500).json({ error: 'abandon task failed' })
  }
}
