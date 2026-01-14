const Task = require('../models/Task')
const { sendSubscribeMessage } = require('./subscribeMessage')
const { LABELS, VALUES } = require('./subscribeLabels')

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

const notifyTodo = async (task, now, remark, remainText, context) => {
  const templateId = process.env.SUBSCRIBE_TPL_TODO
  if (!templateId || !task?.assigneeId) return
  await sendSubscribeMessage({
    toUserId: task.assigneeId,
    templateId,
    page: 'pages/index/index',
    dataByLabel: {
      [LABELS.itemName]: task.title || VALUES.taskReminder,
      [LABELS.dueTime]: formatDateTime(task.dueAt),
      [LABELS.remainTime]: remainText || '',
      [LABELS.remindTime]: formatDateTime(now),
      [LABELS.noteMessage]: remark,
    },
    context,
  })
}

const markAndNotify = async (task, field, now, remark, remainText, context) => {
  const updated = await Task.findOneAndUpdate(
    { _id: task._id, [field]: null },
    { $set: { [field]: now } },
    { new: true }
  )
  if (!updated) return
  await notifyTodo(updated, now, remark, remainText, context)
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
    await markAndNotify(task, 'dueSoonNotifiedAt', now, VALUES.taskDueSoon, remainText, {
      event: 'task_due_soon',
      taskId: task._id?.toString?.() || task._id,
    })
  }

  const overdue = await Task.find({
    ...baseQuery,
    dueAt: { $lt: now },
    overdueNotifiedAt: null,
  }).limit(200)

  debugLog('subscribe scheduler hourly overdue', { count: overdue.length })
  for (const task of overdue) {
    await markAndNotify(task, 'overdueNotifiedAt', now, VALUES.taskOverdue, VALUES.expired, {
      event: 'task_overdue',
      taskId: task._id?.toString?.() || task._id,
    })
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
  for (const task of expired) {
    await markAndNotify(task, 'challengeExpiredNotifiedAt', now, VALUES.challengeExpired, VALUES.expired, {
      event: 'challenge_expired',
      taskId: task._id?.toString?.() || task._id,
    })
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
