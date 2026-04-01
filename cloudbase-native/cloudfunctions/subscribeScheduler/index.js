const cloud = require('wx-server-sdk')
const {
  SCENES,
  getTemplateConfig,
  normalizePreferences,
  markSceneConsumed,
  buildSubscribeData,
  sendSubscribeMessage,
} = require('./subscribe')
const strings = require('./strings')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const USERS = 'users'
const TASKS = 'tasks'
const MINUTE_MS = 60 * 1000
const SCAN_INTERVAL_MS = 30 * MINUTE_MS
const TOLERANCE_MS = 15 * MINUTE_MS
const MAX_REMINDER_MINUTES = 365 * 24 * 60
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000

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
  const totalMinutes = Math.max(0, Math.ceil(ms / MINUTE_MS))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}${strings.remain.day}${hours}${strings.remain.hour}`
  if (hours > 0) return `${hours}${strings.remain.hour}${minutes}${strings.remain.minute}`
  return `${minutes}${strings.remain.minute}`
}

function formatUtc8Ymd(date) {
  const reference = date instanceof Date ? date : new Date(date)
  const shifted = new Date(reference.getTime() + UTC8_OFFSET_MS)
  const yyyy = String(shifted.getUTCFullYear())
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

function isExpiredChallengeTask(task, referenceNow) {
  const seedKey = String(task && task.seedKey ? task.seedKey : '')
  const matched = seedKey.match(/^challenge_(\d{8})_/)
  if (!matched) return false
  return matched[1] < formatUtc8Ymd(referenceNow)
}

function defaultReminderSettings() {
  return {
    categoryEnabled: {
      taskDeadlineExact: true,
      taskDeadlineBefore: true,
      taskDeadlineAfter: true,
      work: true,
      dailyTaskAutoAccept: true,
      taskUpdate: true,
      review: true,
      challengeExpired: true,
    },
    taskDeadline: [
      { direction: 'exact', minutes: 0 },
      { direction: 'before', minutes: 30 },
      { direction: 'after', minutes: 60 },
    ],
  }
}

function dedupeReminderItems(items) {
  const source = Array.isArray(items) ? items : []
  const seen = new Set()
  const unique = []
  for (let index = 0; index < source.length; index += 1) {
    const item = source[index]
    const direction = item && item.direction === 'after' ? 'after' : item && item.direction === 'exact' ? 'exact' : 'before'
    const minutes = direction === 'exact' ? 0 : Math.max(1, Math.min(MAX_REMINDER_MINUTES, Math.floor(Number(item && item.minutes ? item.minutes : 0))))
    const key = `${direction}:${minutes}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ direction, minutes })
  }
  return unique
}

function normalizeReminderSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const defaults = defaultReminderSettings()
  const categoryEnabledSource = source.categoryEnabled && typeof source.categoryEnabled === 'object' ? source.categoryEnabled : {}
  const categoryEnabled = {
    taskDeadlineExact: categoryEnabledSource.taskDeadlineExact !== false,
    taskDeadlineBefore: categoryEnabledSource.taskDeadlineBefore !== false,
    taskDeadlineAfter: categoryEnabledSource.taskDeadlineAfter !== false,
    work: categoryEnabledSource.work !== false,
    dailyTaskAutoAccept: categoryEnabledSource.dailyTaskAutoAccept !== false,
    taskUpdate: categoryEnabledSource.taskUpdate !== false,
    review: categoryEnabledSource.review !== false,
    challengeExpired: categoryEnabledSource.challengeExpired !== false,
  }
  const rawTaskDeadline = Array.isArray(source.taskDeadline)
    ? source.taskDeadline
        .map((item) => {
          const rawDirection = String(item && item.direction ? item.direction : '').trim()
          const direction = rawDirection === 'after' ? 'after' : rawDirection === 'exact' ? 'exact' : 'before'
          const rawMinutes = Math.floor(Number(item && Object.prototype.hasOwnProperty.call(item, 'minutes') ? item.minutes : 0))
          const minutes = direction === 'exact' ? 0 : Math.max(1, Math.min(MAX_REMINDER_MINUTES, rawMinutes))
          if (direction !== 'exact' && !minutes) return null
          return { direction, minutes }
        })
        .filter(Boolean)
    : []
  const dedupedTaskDeadline = dedupeReminderItems(rawTaskDeadline)
  const exactList = dedupedTaskDeadline.filter((item) => item.direction === 'exact')
  const beforeList = dedupedTaskDeadline.filter((item) => item.direction === 'before')
  const afterList = dedupedTaskDeadline.filter((item) => item.direction === 'after')
  return {
    categoryEnabled,
    taskDeadline: []
      .concat(exactList.length ? exactList : defaults.taskDeadline.filter((item) => item.direction === 'exact'))
      .concat(beforeList.length ? beforeList : defaults.taskDeadline.filter((item) => item.direction === 'before'))
      .concat(afterList.length ? afterList : defaults.taskDeadline.filter((item) => item.direction === 'after'))
      .slice(0, 8),
  }
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

async function markTaskReminderKey(task, field, key) {
  if (!task || !task._id || !key) return
  const currentKeys = Array.isArray(task[field]) ? task[field].map((item) => String(item)) : []
  if (currentKeys.includes(String(key))) return
  const nextKeys = currentKeys.concat(String(key))
  await db.collection(TASKS).doc(task._id).update({
    data: {
      [field]: nextKeys,
      updatedAt: now(),
    },
  })
  task[field] = nextKeys
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

function buildReminderKey(reminder) {
  return `${reminder.direction}:${reminder.minutes}`
}

function shouldSendDeadlineReminder(task, reminder, current) {
  const dueAt = task && task.dueAt ? new Date(task.dueAt) : null
  if (!dueAt || Number.isNaN(dueAt.getTime())) return false

  if (reminder.direction === 'exact') {
    return Math.abs(current.getTime() - dueAt.getTime()) <= TOLERANCE_MS
  }

  const targetDiffMs = reminder.minutes * MINUTE_MS
  const actualDiffMs = reminder.direction === 'after' ? current.getTime() - dueAt.getTime() : dueAt.getTime() - current.getTime()
  if (actualDiffMs < 0) return false

  return actualDiffMs >= targetDiffMs - TOLERANCE_MS && actualDiffMs <= targetDiffMs + TOLERANCE_MS
}

function buildTaskReminderMessage(task, user, reminder, current) {
  if (reminder.direction === 'exact') {
    return {
      taskName: task.title || 'Task Reminder',
      assignee: user && user.nickname ? user.nickname : '',
      dueTime: formatDateTime(task.dueAt),
      remainTime: 'Due now',
      remindTime: formatDateTime(current),
      status: 'Due Now',
      tip: 'Task due reminder around the deadline.',
    }
  }
  const isAfter = reminder.direction === 'after'
  const offsetText = formatRemain(reminder.minutes * MINUTE_MS)
  return {
    taskName: task.title || 'Task Reminder',
    assignee: user && user.nickname ? user.nickname : '',
    dueTime: formatDateTime(task.dueAt),
    remainTime: isAfter ? `Overdue by ${formatRemain(current.getTime() - new Date(task.dueAt).getTime())}` : formatRemain(new Date(task.dueAt).getTime() - current.getTime()),
    remindTime: formatDateTime(current),
    status: isAfter ? 'Overdue' : 'Due Soon',
    tip: isAfter ? `Task overdue reminder at about ${offsetText}.` : `Task due reminder at about ${offsetText} before deadline.`,
  }
}

async function runDeadlineReminders(current) {
  const result = await db.collection(TASKS).where({ status: 'in_progress', assigneeId: _.neq('') }).get()
  const tasks = result.data || []
  const users = await listUsersByIds(tasks.map((task) => task.assigneeId).filter(Boolean))
  const userMap = buildUserMap(users)

  let deadlineReminders = 0

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index]
    const user = userMap[task.assigneeId]
    if (!user) continue

    const reminderSettings = normalizeReminderSettings(user.subscribeReminderSettings)
    const sentKeys = Array.isArray(task.todoReminderSentKeys) ? task.todoReminderSentKeys.map((item) => String(item)) : []
    if (task.category === 'challenge') continue

    for (let reminderIndex = 0; reminderIndex < reminderSettings.taskDeadline.length; reminderIndex += 1) {
      const reminder = reminderSettings.taskDeadline[reminderIndex]
      const categoryKey = reminder.direction === 'exact' ? 'taskDeadlineExact' : reminder.direction === 'after' ? 'taskDeadlineAfter' : 'taskDeadlineBefore'
      if (reminderSettings.categoryEnabled[categoryKey] === false) continue

      const reminderKey = buildReminderKey(reminder)
      if (sentKeys.includes(reminderKey)) continue
      if (!shouldSendDeadlineReminder(task, reminder, current)) continue

      const sent = await trySendTodo(
        user,
        task,
        buildTaskReminderMessage(task, user, reminder, current),
        {
          event: reminder.direction === 'exact' ? 'task_due_exact' : reminder.direction === 'after' ? 'task_overdue_custom' : 'task_due_soon_custom',
          taskId: task._id,
          reminderKey,
        }
      )
      if (!sent) continue

      await markTaskReminderKey(task, 'todoReminderSentKeys', reminderKey)
      deadlineReminders += 1
      break
    }
  }

  return { deadlineReminders }
}

async function runChallengeExpiredReminders(current) {
  const result = await db.collection(TASKS).where({ assigneeId: _.neq('') }).get()
  const tasks = result.data || []
  const expiredChallenges = tasks.filter((task) => !task.challengeExpiredNotifiedAt && isExpiredChallengeTask(task, current))
  const users = await listUsersByIds(expiredChallenges.map((task) => task.assigneeId).filter(Boolean))
  const userMap = buildUserMap(users)
  let deletedCount = 0
  let pendingAuthCount = 0

  for (let index = 0; index < expiredChallenges.length; index += 1) {
    const task = expiredChallenges[index]
    const user = userMap[task.assigneeId]
    const reminderSettings = normalizeReminderSettings(user && user.subscribeReminderSettings)
    let shouldDelete = reminderSettings.categoryEnabled.challengeExpired === false
    if (reminderSettings.categoryEnabled.challengeExpired !== false) {
      const sent = await trySendTodo(
        user,
        task,
        {
          taskName: task.title || 'Task Reminder',
          assignee: user && user.nickname ? user.nickname : '',
          dueTime: formatDateTime(task.dueAt),
          remainTime: 'Expired',
          remindTime: formatDateTime(current),
          status: 'Expired',
          tip: 'Daily challenge expired and was cleaned up.',
        },
        { event: 'challenge_expired', taskId: task._id }
      )
      if (sent) {
        await markTaskField(task._id, 'challengeExpiredNotifiedAt')
        shouldDelete = true
      } else {
        pendingAuthCount += 1
      }
    }
    if (!shouldDelete) continue
    await removeTask(task._id)
    deletedCount += 1
  }

  return {
    challengeExpired: expiredChallenges.length,
    challengeDeleted: deletedCount,
    challengePendingAuth: pendingAuthCount,
  }
}

exports.main = async (event) => {
  const mode = String(event && event.mode ? event.mode : 'all')
  const current = now()
  const result = {}
  if (mode === 'all' || mode === 'hourly') {
    result.hourly = await runDeadlineReminders(current)
  }
  if (mode === 'all' || mode === 'daily') {
    result.daily = await runChallengeExpiredReminders(current)
  }
  result.meta = {
    scanIntervalMinutes: SCAN_INTERVAL_MS / MINUTE_MS,
    toleranceMinutes: TOLERANCE_MS / MINUTE_MS,
  }
  return {
    ok: true,
    data: result,
  }
}
