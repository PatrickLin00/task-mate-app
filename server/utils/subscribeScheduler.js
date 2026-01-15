const Task = require('../models/Task')
const User = require('../models/User')
const { sendSubscribeMessage } = require('./subscribeMessage')
const { VALUES } = require('./subscribeLabels')
const { buildSubscribeData } = require('./subscribePayload')

const HOUR_MS = 60 * 60 * 1000
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000

const pad2 = (value) => String(value).padStart(2, '0')
const isDebug = () => String(process.env.SUBSCRIBE_DEBUG || '').toLowerCase() === 'true'
const debugLog = (...args) => {
  if (isDebug()) console.log(...args)
}

const formatDateTime = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`
}

const formatRemain = (ms) => {
  if (!Number.isFinite(ms)) return ''
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}${VALUES.unitDay}${hours}${VALUES.unitHour}`
  if (hours > 0) return `${hours}${VALUES.unitHour}${minutes}${VALUES.unitMinute}`
  return `${minutes}${VALUES.unitMinute}`
}

const getCnDayKey = (date) => {
  const cn = new Date(date.getTime() + TZ_OFFSET_MS)
  return `${cn.getFullYear()}-${pad2(cn.getMonth() + 1)}-${pad2(cn.getDate())}`
}

const isEnabled = () => {
  const flag = String(process.env.SUBSCRIBE_SCHEDULER_ENABLED || 'true').toLowerCase()
  return flag === 'true'
}

const buildAssigneeNameMap = async (tasks) => {
  const ids = Array.from(
    new Set((tasks || []).map((t) => t?.assigneeId).filter((id) => typeof id === 'string' && id))
  )
  if (!ids.length) return new Map()
  const users = await User.find({ userId: { $in: ids } }, { userId: 1, nickname: 1 }).lean()
  const map = new Map()
  users.forEach((user) => {
    const nickname = typeof user.nickname === 'string' ? user.nickname.trim() : ''
    if (nickname) map.set(user.userId, nickname)
  })
  return map
}

const notifyTodo = async (task, now, detail, context, nameMap) => {
  const templateId = process.env.SUBSCRIBE_TPL_TODO
  if (!templateId || !task?.assigneeId) return
  const assigneeName = nameMap?.get(task.assigneeId) || task.assigneeId
  const tip = detail.tip || detail.remark || ''
  await sendSubscribeMessage({
    toUserId: task.assigneeId,
    templateId,
    page: 'pages/index/index',
    dataByLabel: buildSubscribeData({
      taskName: task.title || VALUES.taskReminder,
      assignee: assigneeName,
      dueTime: formatDateTime(task.dueAt),
      remainTime: detail.remainText || '',
      remindTime: formatDateTime(now),
      status: detail.status || '',
      tip,
    }),
    context,
  })
}

const markAndNotify = async (task, field, now, detail, context, nameMap) => {
  const updated = await Task.findOneAndUpdate(
    { _id: task._id, [field]: null },
    { $set: { [field]: now } },
    { new: true }
  )
  if (!updated) return
  await notifyTodo(updated, now, detail, context, nameMap)
}

const runHourly = async () => {
  if (!isEnabled()) return
  const now = new Date()
  const soonEnd = new Date(now.getTime() + HOUR_MS)
  const baseQuery = { status: 'in_progress', assigneeId: { $ne: null } }

  debugLog('subscribe scheduler hourly start', { now: now.toISOString() })
  const dueSoon = await Task.find({
    ...baseQuery,
    dueAt: { $gte: now, $lte: soonEnd },
    dueSoonNotifiedAt: null,
  }).limit(200)

  debugLog('subscribe scheduler hourly dueSoon', { count: dueSoon.length })
  for (const task of dueSoon) {
    const remainText = formatRemain(task.dueAt.getTime() - now.getTime())
    await markAndNotify(
      task,
      'dueSoonNotifiedAt',
      now,
      {
        remark: VALUES.taskDueSoon,
        remainText,
        status: '即将截止',
        tip: '任务即将截止，请尽快完成',
      },
      {
        event: 'task_due_soon',
        taskId: task._id?.toString?.() || task._id,
      },
      nameMap
    )
  }

  const overdue = await Task.find({
    ...baseQuery,
    dueAt: { $lt: now },
    overdueNotifiedAt: null,
  }).limit(200)

  debugLog('subscribe scheduler hourly overdue', { count: overdue.length })
  const nameMap = await buildAssigneeNameMap([...dueSoon, ...overdue])
  for (const task of overdue) {
    await markAndNotify(
      task,
      'overdueNotifiedAt',
      now,
      {
        remark: VALUES.taskOverdue,
        remainText: VALUES.expired,
        status: '已过期',
        tip: '任务已过期，请尽快处理',
      },
      {
        event: 'task_overdue',
        taskId: task._id?.toString?.() || task._id,
      },
      nameMap
    )
  }
}

const runDaily = async () => {
  if (!isEnabled()) return
  const now = new Date()
  debugLog('subscribe scheduler daily start', { now: now.toISOString() })
  const expired = await Task.find({
    seedKey: { $regex: /^challenge_/ },
    assigneeId: { $ne: null },
    dueAt: { $lt: now },
    challengeExpiredNotifiedAt: null,
  }).limit(500)

  debugLog('subscribe scheduler daily challengeExpired', { count: expired.length })
  const nameMap = await buildAssigneeNameMap(expired)
  for (const task of expired) {
    await markAndNotify(
      task,
      'challengeExpiredNotifiedAt',
      now,
      {
        remark: VALUES.challengeExpired,
        remainText: VALUES.expired,
        status: '已过期',
        tip: '星旅任务已过期并被系统清理',
      },
      {
        event: 'challenge_expired',
        taskId: task._id?.toString?.() || task._id,
      },
      nameMap
    )
  }
}

const startSubscribeScheduler = () => {
  if (!isEnabled()) return
  debugLog('subscribe scheduler start')
  let lastCnDay = null
  const tick = async () => {
    try {
      await runHourly()
      const now = new Date()
      const cnDay = getCnDayKey(now)
      if (cnDay !== lastCnDay) {
        lastCnDay = cnDay
        await runDaily()
      }
    } catch (error) {
      console.error('subscribe scheduler error:', error)
    }
  }
  tick()
  setInterval(tick, HOUR_MS)
}

module.exports = {
  startSubscribeScheduler,
}

