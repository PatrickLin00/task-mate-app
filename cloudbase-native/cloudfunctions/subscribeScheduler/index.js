const cloud = require('wx-server-sdk')
const {
  SCENES,
  getTemplateConfig,
  normalizePreferences,
  markSceneConsumed,
  buildSubscribeData,
  sendSubscribeMessage,
} = require('./subscribe')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const USERS = 'users'
const TASKS = 'tasks'
const HOUR_MS = 60 * 60 * 1000

function now() {
  return new Date()
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function formatRemain(ms) {
  if (!Number.isFinite(ms)) return ''
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分钟`
  return `${minutes}分钟`
}

async function listUsersByIds(ids) {
  const userIds = Array.from(new Set((ids || []).filter(Boolean)))
  if (!userIds.length) return []
  const result = await db.collection(USERS).where({ _openid: _.in(userIds) }).get()
  return result.data || []
}

function buildUserMap(users) {
  return (users || []).reduce((map, user) => {
    map[user._openid] = user
    return map
  }, {})
}

async function trySendTodo(user, task, messageFields, context) {
  if (!user || !task || !task.assigneeId) return false
  const templates = getTemplateConfig()
  const templateId = templates[SCENES.todo]
  if (!templateId) return false
  const preferences = normalizePreferences(user.subscribePreferences, templates)
  const scene = preferences[SCENES.todo]
  if (!scene || scene.templateId !== templateId || scene.status !== 'accepted') return false
  const result = await sendSubscribeMessage({
    toUserId: task.assigneeId,
    templateId,
    page: 'pages/home/index',
    dataByLabel: buildSubscribeData(messageFields),
    context,
  })
  if (!result.ok) return false
  const nextPreferences = markSceneConsumed(preferences, SCENES.todo, now())
  await db.collection(USERS).doc(user._id).update({
    data: {
      subscribePreferences: nextPreferences,
      updatedAt: now(),
    },
  })
  return true
}

async function markTaskField(taskId, field) {
  await db.collection(TASKS).doc(taskId).update({
    data: {
      [field]: now(),
      updatedAt: now(),
    },
  })
}

async function removeTask(taskId) {
  await db.collection(TASKS).doc(taskId).remove()
}

async function runHourly(referenceNow) {
  const current = referenceNow || now()
  const soonEnd = new Date(current.getTime() + HOUR_MS)
  const result = await db.collection(TASKS).where({ status: 'in_progress', assigneeId: _.neq('') }).get()
  const tasks = result.data || []
  const dueSoon = tasks.filter((task) => {
    const dueAt = task && task.dueAt ? new Date(task.dueAt) : null
    if (!dueAt || Number.isNaN(dueAt.getTime())) return false
    return !task.dueSoonNotifiedAt && dueAt >= current && dueAt <= soonEnd
  })
  const overdue = tasks.filter((task) => {
    const dueAt = task && task.dueAt ? new Date(task.dueAt) : null
    if (!dueAt || Number.isNaN(dueAt.getTime())) return false
    return !task.overdueNotifiedAt && dueAt < current
  })
  const users = await listUsersByIds(
    dueSoon
      .concat(overdue)
      .map((task) => task.assigneeId)
      .filter(Boolean)
  )
  const userMap = buildUserMap(users)
  for (let index = 0; index < dueSoon.length; index += 1) {
    const task = dueSoon[index]
    const user = userMap[task.assigneeId]
    const sent = await trySendTodo(
      user,
      task,
      {
        taskName: task.title || '任务提醒',
        assignee: user && user.nickname ? user.nickname : '',
        dueTime: formatDateTime(task.dueAt),
        remainTime: formatRemain(new Date(task.dueAt).getTime() - current.getTime()),
        remindTime: formatDateTime(current),
        status: '即将截止',
        tip: '任务即将截止，请尽快完成',
      },
      { event: 'task_due_soon', taskId: task._id }
    )
    if (sent) await markTaskField(task._id, 'dueSoonNotifiedAt')
  }
  for (let index = 0; index < overdue.length; index += 1) {
    const task = overdue[index]
    const user = userMap[task.assigneeId]
    const sent = await trySendTodo(
      user,
      task,
      {
        taskName: task.title || '任务提醒',
        assignee: user && user.nickname ? user.nickname : '',
        dueTime: formatDateTime(task.dueAt),
        remainTime: '已过期',
        remindTime: formatDateTime(current),
        status: '已过期',
        tip: '任务已过期，请尽快处理',
      },
      { event: 'task_overdue', taskId: task._id }
    )
    if (sent) await markTaskField(task._id, 'overdueNotifiedAt')
  }
  return {
    dueSoon: dueSoon.length,
    overdue: overdue.length,
  }
}

async function runDaily(referenceNow) {
  const current = referenceNow || now()
  const result = await db.collection(TASKS).where({ assigneeId: _.neq('') }).get()
  const tasks = result.data || []
  const expiredChallenges = tasks.filter((task) => {
    const dueAt = task && task.dueAt ? new Date(task.dueAt) : null
    const seedKey = String(task && task.seedKey ? task.seedKey : '')
    if (!seedKey.startsWith('challenge_')) return false
    if (!dueAt || Number.isNaN(dueAt.getTime())) return false
    return !task.challengeExpiredNotifiedAt && dueAt < current
  })
  const users = await listUsersByIds(expiredChallenges.map((task) => task.assigneeId).filter(Boolean))
  const userMap = buildUserMap(users)
  for (let index = 0; index < expiredChallenges.length; index += 1) {
    const task = expiredChallenges[index]
    const user = userMap[task.assigneeId]
    const sent = await trySendTodo(
      user,
      task,
      {
        taskName: task.title || '任务提醒',
        assignee: user && user.nickname ? user.nickname : '',
        dueTime: formatDateTime(task.dueAt),
        remainTime: '已过期',
        remindTime: formatDateTime(current),
        status: '已过期',
        tip: '每日挑战已过期并被系统清理',
      },
      { event: 'challenge_expired', taskId: task._id }
    )
    if (sent) {
      await markTaskField(task._id, 'challengeExpiredNotifiedAt')
    }
    await removeTask(task._id)
  }
  return {
    challengeExpired: expiredChallenges.length,
  }
}

exports.main = async (event) => {
  const mode = String(event && event.mode ? event.mode : 'all')
  const current = now()
  const result = {}
  if (mode === 'all' || mode === 'hourly') {
    result.hourly = await runHourly(current)
  }
  if (mode === 'all' || mode === 'daily') {
    result.daily = await runDaily(current)
  }
  return {
    ok: true,
    data: result,
  }
}
