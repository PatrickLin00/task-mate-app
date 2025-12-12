const Task = require('../models/Task')

const clampProgress = (value, total) => Math.max(0, Math.min(value, total))

const computeProgress = (taskDoc) => {
  if (!taskDoc) return { current: 0, total: 0 }
  if (taskDoc.mode === 'counter') {
    const { current = 0, total = 1 } = taskDoc.progress || {}
    const safeTotal = total > 0 ? total : 1
    return { current: clampProgress(current, safeTotal), total: safeTotal }
  }

  const subtasks = taskDoc.subtasks || []
  const total = subtasks.reduce((sum, s) => sum + (s.total || 0), 0)
  const current = subtasks.reduce(
    (sum, s) => sum + clampProgress(s.current || 0, s.total || 0),
    0
  )
  return {
    current,
    total: total > 0 ? total : 0,
  }
}

const buildResponse = (taskDoc) => {
  const doc = taskDoc.toObject()
  doc.computedProgress = computeProgress(taskDoc)
  return doc
}

exports.createTask = async (req, res) => {
  try {
    const { title, description, mode, progress, subtasks, attributeReward } = req.body

    if (!title || !mode) {
      return res.status(400).json({ error: 'title 与 mode 为必填字段' })
    }

    if (!attributeReward || !attributeReward.type || attributeReward.value === undefined) {
      return res.status(400).json({ error: 'attributeReward.type 与 value 为必填字段' })
    }

    if (mode === 'counter') {
      if (!progress || progress.total === undefined) {
        return res.status(400).json({ error: 'counter 模式需要 progress.total' })
      }
    } else if (mode === 'checklist') {
      if (!Array.isArray(subtasks) || subtasks.length === 0) {
        return res.status(400).json({ error: 'checklist 模式需要非空的 subtasks 数组' })
      }
    } else {
      return res.status(400).json({ error: 'mode 仅支持 counter 或 checklist' })
    }

    const task = new Task({
      title,
      description,
      mode,
      progress,
      subtasks,
      attributeReward,
    })

    await task.save()
    res.status(201).json(buildResponse(task))
  } catch (error) {
    console.error('createTask error:', error)
    res.status(500).json({ error: '创建任务失败' })
  }
}

exports.getAllTasks = async (req, res) => {
  try {
    const { status } = req.query
    const query = {}
    const allowedStatus = ['ongoing', 'completed', 'abandoned']
    if (status) {
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({ error: 'status 仅支持 ongoing/completed/abandoned' })
      }
      query.status = status
    }
    const tasks = await Task.find(query).sort({ createdAt: -1 })
    res.json(tasks.map((t) => buildResponse(t)))
  } catch (error) {
    console.error('getAllTasks error:', error)
    res.status(500).json({ error: '获取任务失败' })
  }
}

exports.updateProgress = async (req, res) => {
  try {
    const { id } = req.params
    const { current, subtaskIndex } = req.body
    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: '任务不存在' })
    if (task.status !== 'ongoing') {
      return res.status(400).json({ error: '仅可更新进行中的任务进度' })
    }

    if (task.mode === 'counter') {
      if (typeof current !== 'number') {
        return res.status(400).json({ error: 'counter 模式需要提供 current 数值' })
      }
      const total = task.progress?.total || 1
      task.progress.current = clampProgress(current, total)
    } else {
      const index = Number(subtaskIndex)
      if (!Number.isInteger(index) || typeof current !== 'number') {
        return res
          .status(400)
          .json({ error: 'checklist 模式需要 subtaskIndex 整数与 current 数值' })
      }
      if (!task.subtasks[index]) {
        return res.status(400).json({ error: 'subtaskIndex 越界' })
      }
      const st = task.subtasks[index]
      st.current = clampProgress(current, st.total)
    }

    await task.save()
    res.json(buildResponse(task))
  } catch (error) {
    console.error('updateProgress error:', error)
    res.status(500).json({ error: '更新进度失败' })
  }
}

exports.completeTask = async (req, res) => {
  try {
    const { id } = req.params
    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: '任务不存在' })

    if (task.mode === 'counter') {
      const total = task.progress?.total || 1
      task.progress.current = total
    } else {
      task.subtasks = task.subtasks.map((st) => ({
        ...st.toObject(),
        current: st.total,
      }))
    }
    task.status = 'completed'

    await task.save()
    res.json(buildResponse(task))
  } catch (error) {
    console.error('completeTask error:', error)
    res.status(500).json({ error: '完成任务失败' })
  }
}

exports.abandonTask = async (req, res) => {
  try {
    const { id } = req.params
    const task = await Task.findById(id)
    if (!task) return res.status(404).json({ error: '任务不存在' })

    task.status = 'abandoned'
    await task.save()
    res.json(buildResponse(task))
  } catch (error) {
    console.error('abandonTask error:', error)
    res.status(500).json({ error: '放弃任务失败' })
  }
}
