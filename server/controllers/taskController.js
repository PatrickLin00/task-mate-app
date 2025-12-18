const Task = require('../models/Task')
const mongoose = require('mongoose')

const TASK_STATUS = ['pending', 'in_progress', 'review_pending', 'completed', 'closed']
const REWARD_TYPE = ['strength', 'wisdom', 'agility']
const ACTIVE_ASSIGNEE_STATUS = ['in_progress', 'review_pending']
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

    if (!visibleToUserId(task, userId)) return res.status(403).json({ error: 'forbidden' })

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

    const tasks = await Task.find({
      assigneeId: userId,
      status: { $in: ACTIVE_ASSIGNEE_STATUS },
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
    const tasks = await Task.find({
      creatorId: userId,
      status: { $ne: 'completed' },
      $or: [{ status: { $ne: 'closed' } }, { dueAt: { $gte: now } }],
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

    const now = new Date()
    const start = startOfDay(now)
    const end = endOfDay(now)

    const tasks = await Task.find({
      creatorId: SYSTEM_USER_ID,
      status: 'pending',
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

    const base = await Task.find({
      assigneeId: userId,
      status: { $in: ACTIVE_ASSIGNEE_STATUS },
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
