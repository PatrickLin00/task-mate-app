const cloud = require('wx-server-sdk')
const {
  SCENES,
  getTemplateConfig,
  normalizePreferences,
  applySubscribeResult,
  markSceneConsumed,
  buildSubscribeData,
  sendSubscribeMessage,
} = require('./subscribe')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const USERS = 'users'
const TASKS = 'tasks'
const ARCHIVES = 'task_archives'
const SYSTEM_PREFIX = 'sys:'
const STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  REVIEW_PENDING: 'review_pending',
  PENDING_CONFIRMATION: 'pending_confirmation',
  COMPLETED: 'completed',
  CLOSED: 'closed',
  REFACTORED: 'refactored',
}
const REWARD_TYPES = ['wisdom', 'strength', 'agility']
const ACTIVE_ASSIGNEE_STATUS = [STATUS.IN_PROGRESS, STATUS.PENDING_CONFIRMATION]
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000
const SENSITIVE_HINT = '内容包含敏感词，请调整后再试'
const SENSITIVE_WORDS = [
  '赌博',
  '毒品',
  '色情',
  '约炮',
  '法轮功',
  '爆炸',
  'cao',
  'fuck',
  'sb',
]

const CHALLENGE_TEMPLATES = [
  {
    id: 'deep_focus',
    title: '深潜专注',
    detail: '留出 30 分钟，推进一项最难拖延的任务。',
    icon: 'focus',
    reward: { type: 'wisdom', value: 8 },
    subtasks: [{ title: '完成一次深度专注', total: 1 }],
  },
  {
    id: 'quick_reset',
    title: '快速整理',
    detail: '清掉一个小范围的混乱点，让空间重新可用。',
    icon: 'reset',
    reward: { type: 'agility', value: 6 },
    subtasks: [{ title: '整理一个区域', total: 1 }],
  },
  {
    id: 'body_wake',
    title: '身体唤醒',
    detail: '做一组短时运动，给今天补一点体能。',
    icon: 'body',
    reward: { type: 'strength', value: 7 },
    subtasks: [{ title: '完成一次活动', total: 1 }],
  },
  {
    id: 'notes_recap',
    title: '笔记回收',
    detail: '复盘当天信息，把零散记录整理成一个结果。',
    icon: 'notes',
    reward: { type: 'wisdom', value: 9 },
    subtasks: [{ title: '整理一份摘要', total: 1 }],
  },
  {
    id: 'errand_burst',
    title: '杂务冲刺',
    detail: '快速处理一件堆着不想做的小任务。',
    icon: 'errand',
    reward: { type: 'agility', value: 5 },
    subtasks: [{ title: '解决一件杂务', total: 1 }],
  },
]

function success(data) {
  return { ok: true, data }
}

function fail(message, code, extra) {
  return {
    ok: false,
    error: Object.assign(
      {
        message,
        code: code || 'BAD_REQUEST',
      },
      extra || {}
    ),
  }
}

function assert(condition, message, code, extra) {
  if (!condition) {
    const error = new Error(message)
    error.code = code || 'BAD_REQUEST'
    error.extra = extra || null
    throw error
  }
}

function now() {
  return new Date()
}

function toIso(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max))
}

function formatYmd(date) {
  const value = date instanceof Date ? date : new Date(date)
  const yyyy = String(value.getFullYear())
  const mm = String(value.getMonth() + 1).padStart(2, '0')
  const dd = String(value.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

function startOfDay(date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function endOfDay(date) {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)
  return value
}

function hashSeed(input) {
  const text = String(input || '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function xorshift32(seed) {
  let value = seed >>> 0
  return () => {
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    return value >>> 0
  }
}

function buildChallengeSeedKey(userId, dayKey, templateId) {
  return `challenge_${dayKey}_${templateId}_${hashSeed(userId)}`
}

function buildChallengeSystemId(userId) {
  return `${SYSTEM_PREFIX}${userId}`
}

function pickDailyChallengeTemplates(userId, dayKey, count) {
  const random = xorshift32(hashSeed(`${userId}|${dayKey}|challenge`))
  const pool = CHALLENGE_TEMPLATES.slice()
  const selected = []
  while (pool.length && selected.length < count) {
    const index = random() % pool.length
    selected.push(pool.splice(index, 1)[0])
  }
  return selected
}

function buildChallengeSeeds(userId, date) {
  const reference = date || now()
  const dayKey = formatUtc8Ymd(reference)
  const start = startOfUtc8Day(reference)
  const end = endOfUtc8Day(reference)
  const creatorId = buildChallengeSystemId(userId)
  const seeds = pickDailyChallengeTemplates(userId, dayKey, 3).map((template) => ({
    template,
    seedKey: buildChallengeSeedKey(userId, dayKey, template.id),
  }))
  return { dayKey, start, end, creatorId, seeds }
}

function formatUtc8Ymd(date) {
  const reference = date instanceof Date ? date : new Date(date)
  const shifted = new Date(reference.getTime() + UTC8_OFFSET_MS)
  const yyyy = String(shifted.getUTCFullYear())
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

function startOfUtc8Day(date) {
  const reference = date instanceof Date ? date : new Date(date)
  const shifted = new Date(reference.getTime() + UTC8_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - UTC8_OFFSET_MS)
}

function endOfUtc8Day(date) {
  const reference = date instanceof Date ? date : new Date(date)
  const shifted = new Date(reference.getTime() + UTC8_OFFSET_MS)
  shifted.setUTCHours(23, 59, 59, 999)
  return new Date(shifted.getTime() - UTC8_OFFSET_MS)
}

function isChallengeTask(task) {
  return Boolean(task && (task.category === 'challenge' || String(task.seedKey || '').startsWith('challenge_')))
}

function isExpiredChallengeTask(task, referenceNow) {
  if (!isChallengeTask(task)) return false
  if (task.status === STATUS.COMPLETED) return false
  const dueAt = task && task.dueAt ? new Date(task.dueAt) : null
  if (!dueAt || Number.isNaN(dueAt.getTime())) return false
  return dueAt.getTime() < referenceNow.getTime()
}

async function cleanupExpiredChallengeTasks(userId, referenceNow) {
  const creatorId = buildChallengeSystemId(userId)
  const current = referenceNow || now()
  const result = await db.collection(TASKS).where({ creatorId, category: 'challenge' }).get()
  const expired = (result.data || []).filter((task) => isExpiredChallengeTask(task, current))
  if (!expired.length) return []
  await Promise.all(expired.map((task) => db.collection(TASKS).doc(task._id).remove().catch(() => null)))
  return expired
}

function normalizeSubtasks(subtasks) {
  const list = Array.isArray(subtasks) ? subtasks : []
  return list
    .map((item) => {
      const title = String(item && item.title ? item.title : '').trim()
      const total = Math.max(1, Math.floor(Number(item && item.total ? item.total : 1)))
      const current = clamp(Math.floor(Number(item && item.current ? item.current : 0)), 0, total)
      return { title, total, current }
    })
    .filter((item) => item.title)
}

function areSubtasksEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index]
    const rightItem = right[index]
    if (String(leftItem && leftItem.title ? leftItem.title : '').trim() !== String(rightItem && rightItem.title ? rightItem.title : '').trim()) {
      return false
    }
    if (Number(leftItem && leftItem.total ? leftItem.total : 0) !== Number(rightItem && rightItem.total ? rightItem.total : 0)) {
      return false
    }
  }
  return true
}

function normalizeReward(reward) {
  const type = reward && reward.type ? String(reward.type) : 'wisdom'
  const value = Math.max(1, Math.floor(Number(reward && reward.value ? reward.value : 10)))
  assert(REWARD_TYPES.includes(type), 'Invalid reward type', 'INVALID_REWARD')
  return { type, value }
}

function containsSensitiveText(input) {
  const text = String(input || '').trim().toLowerCase()
  if (!text) return false
  return SENSITIVE_WORDS.some((word) => text.includes(String(word).toLowerCase()))
}

function containsSensitiveTask(task) {
  if (!task) return false
  if (containsSensitiveText(task.title) || containsSensitiveText(task.detail)) return true
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : []
  return subtasks.some((item) => containsSensitiveText(item && item.title))
}

async function moderateWithAI(text) {
  const input = String(text || '').trim()
  if (!input) return false
  try {
    const result = await cloud.callFunction({
      name: 'moderateContent',
      data: { text: input },
    })
    const payload = result && result.result ? result.result : null
    if (!payload || !payload.ok || !payload.data) return false
    return Boolean(payload.data.blocked)
  } catch (error) {
    return false
  }
}

function computeProgress(task) {
  const subtasks = Array.isArray(task && task.subtasks) ? task.subtasks : []
  const current = subtasks.reduce((sum, item) => sum + Number(item.current || 0), 0)
  const total = subtasks.reduce((sum, item) => sum + Number(item.total || 0), 0)
  return { current, total }
}

function sortByDateDesc(list, key) {
  return list.slice().sort((left, right) => {
    const leftTime = new Date(left && left[key] ? left[key] : left && left.updatedAt ? left.updatedAt : 0).getTime()
    const rightTime = new Date(right && right[key] ? right[key] : right && right.updatedAt ? right.updatedAt : 0).getTime()
    return rightTime - leftTime
  })
}

function normalizeTask(task, nameMap) {
  if (!task) return null
  const creatorName =
    task.creatorId && String(task.creatorId).startsWith(SYSTEM_PREFIX)
      ? '星旅系统'
      : (nameMap && nameMap[task.creatorId]) || task.creatorName || '未命名旅者'
  const assigneeName = task.assigneeId ? (nameMap && nameMap[task.assigneeId]) || task.assigneeName || '未命名旅者' : ''
  return {
    _id: task._id,
    title: task.title || '',
    detail: task.detail || '',
    offlineRewardPromise: task.offlineRewardPromise || '',
    icon: task.icon || '',
    status: task.status || STATUS.PENDING,
    category: task.category || 'normal',
    creatorId: task.creatorId || '',
    creatorName,
    assigneeId: task.assigneeId || '',
    assigneeName,
    dueAt: toIso(task.dueAt),
    startAt: toIso(task.startAt),
    submittedAt: toIso(task.submittedAt),
    completedAt: toIso(task.completedAt),
    closedAt: toIso(task.closedAt),
    deleteAt: toIso(task.deleteAt),
    originalDueAt: toIso(task.originalDueAt),
    originalStartAt: toIso(task.originalStartAt),
    originalStatus: task.originalStatus || null,
    previousTaskId: task.previousTaskId || '',
    seedKey: task.seedKey || '',
    subtasks: normalizeSubtasks(task.subtasks),
    attributeReward: normalizeReward(task.attributeReward || { type: 'wisdom', value: 10 }),
    createdAt: toIso(task.createdAt),
    updatedAt: toIso(task.updatedAt),
    isVirtual: Boolean(task.isVirtual),
    computedProgress: computeProgress(task),
  }
}

function normalizeArchive(archive, nameMap) {
  return {
    _id: archive._id,
    ownerId: archive.ownerId,
    sourceTaskId: archive.sourceTaskId,
    status: archive.status,
    completedAt: toIso(archive.completedAt),
    submittedAt: toIso(archive.submittedAt),
    deleteAt: toIso(archive.deleteAt),
    createdAt: toIso(archive.createdAt),
    updatedAt: toIso(archive.updatedAt),
    snapshot: normalizeTask(archive.snapshot, nameMap),
  }
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

async function saveUserSubscribePreferences(user, preferences) {
  if (!user || !user._id) return null
  await db.collection(USERS).doc(user._id).update({
    data: {
      subscribePreferences: preferences,
      updatedAt: now(),
    },
  })
  return preferences
}

async function sendSceneNotification(toUserId, sceneKey, dataByLabel, context) {
  const userId = String(toUserId || '').trim()
  if (!userId) return { ok: false, reason: 'missing user' }
  const templates = getTemplateConfig()
  const templateId = templates[sceneKey]
  if (!templateId) return { ok: false, reason: 'missing template' }
  const user = await ensureUser(userId)
  const preferences = normalizePreferences(user.subscribePreferences, templates)
  const scene = preferences[sceneKey]
  if (!scene || scene.templateId !== templateId || scene.status !== 'accepted') {
    return { ok: false, reason: 'not accepted' }
  }
  const result = await sendSubscribeMessage({
    toUserId: userId,
    templateId,
    page: 'pages/home/index',
    dataByLabel,
    context,
  })
  if (!result.ok) return result
  const nextPreferences = markSceneConsumed(preferences, sceneKey, now())
  await saveUserSubscribePreferences(user, nextPreferences)
  return result
}

async function getCurrentUserId() {
  const context = cloud.getWXContext()
  const userId = context && context.OPENID ? context.OPENID : ''
  assert(userId, 'Missing user context', 'UNAUTHORIZED')
  return userId
}

async function getUserById(userId) {
  const result = await db.collection(USERS).where({ userId }).limit(1).get()
  return result.data[0] || null
}

async function ensureUser(userId) {
  let user = await getUserById(userId)
  if (user) return user
  const createdAt = now()
  await db.collection(USERS).add({
    data: {
      nickname: `旅者-${String(userId).slice(-4)}`,
      userId,
      avatar: '',
      onboarding: {
        seen: false,
        seenAt: null,
      },
      subscribePreferences: {},
      stars: 0,
      wisdom: 0,
      strength: 0,
      agility: 0,
      createdAt,
      updatedAt: createdAt,
    },
  })
  user = await getUserById(userId)
  assert(user, 'Failed to initialize user', 'BOOTSTRAP_FAILED')
  return user
}

async function getUserNameMap(userIds) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)))
  if (!ids.length) return {}
  const result = await db.collection(USERS).where({ userId: _.in(ids) }).get()
  return result.data.reduce((map, item) => {
    map[item.userId || item._openid] = item.nickname || `旅者-${String(item.userId || item._openid).slice(-4)}`
    return map
  }, {})
}

async function getTaskById(taskId) {
  const result = await db.collection(TASKS).doc(taskId).get()
  return result.data || null
}

async function deletePreviousTask(taskDoc) {
  if (!taskDoc || !taskDoc.previousTaskId) return
  try {
    await db.collection(TASKS).doc(taskDoc.previousTaskId).remove()
  } catch (error) {
    void error
  }
}

async function deleteRefactoredChain(taskId, userId) {
  let currentId = taskId
  const visited = new Set()
  while (currentId && !visited.has(String(currentId))) {
    visited.add(String(currentId))
    const current = await getTaskById(String(currentId))
    if (!current || current.creatorId !== userId || current.status !== STATUS.REFACTORED) break
    const nextId = current.previousTaskId
    try {
      await db.collection(TASKS).doc(current._id).remove()
    } catch (error) {
      break
    }
    currentId = nextId
  }
}

async function getArchiveBySourceId(sourceTaskId, ownerId) {
  const result = await db.collection(ARCHIVES).where({ sourceTaskId, ownerId }).limit(1).get()
  return result.data[0] || null
}

async function upsertArchive(ownerId, task, statusValue) {
  if (!ownerId) return null
  const current = await getArchiveBySourceId(task._id, ownerId)
  const createdAt = current && current.createdAt ? current.createdAt : now()
  const payload = {
    ownerId,
    sourceTaskId: task._id,
    status: statusValue,
    snapshot: Object.assign({}, task),
    completedAt: task.completedAt || null,
    submittedAt: task.submittedAt || null,
    deleteAt: task.deleteAt || null,
    createdAt,
    updatedAt: now(),
  }
  if (current) {
    await db.collection(ARCHIVES).doc(current._id).update({ data: payload })
    const updated = await db.collection(ARCHIVES).doc(current._id).get()
    return updated.data
  }
  const added = await db.collection(ARCHIVES).add({ data: payload })
  const inserted = await db.collection(ARCHIVES).doc(added._id).get()
  return inserted.data
}

async function removeArchive(ownerId, sourceTaskId) {
  const result = await db.collection(ARCHIVES).where({ ownerId, sourceTaskId }).get()
  const list = result.data || []
  await Promise.all(list.map((item) => db.collection(ARCHIVES).doc(item._id).remove()))
}

async function awardUser(userId, reward) {
  if (!userId || !reward || !REWARD_TYPES.includes(reward.type)) return
  const user = await ensureUser(userId)
  const nextValue = Number(user[reward.type] || 0) + Number(reward.value || 0)
  await db.collection(USERS).doc(user._id).update({
    data: {
      [reward.type]: nextValue,
      updatedAt: now(),
    },
  })
}

async function refreshTask(taskId) {
  return getTaskById(taskId)
}

function buildTodayTasks(tasks) {
  const current = now()
  const todayStart = startOfDay(current)
  const todayEnd = endOfDay(current)
  const active = (tasks || [])
    .filter((task) => ACTIVE_ASSIGNEE_STATUS.includes(task.status))
    .filter((task) => task && task.dueAt)
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime())
  const overdue = active.filter((task) => new Date(task.dueAt) < todayStart)
  const dueToday = active.filter((task) => new Date(task.dueAt) >= todayStart && new Date(task.dueAt) <= todayEnd)
  const upcoming = active.filter((task) => new Date(task.dueAt) > todayEnd).slice(0, 5)
  const selected = overdue.concat(dueToday, upcoming).sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime())
  return {
    dueTodayCount: dueToday.length,
    tasks: selected,
  }
}

function countOpenTasks(creatorTasks, assigneeTasks) {
  const ids = new Set()
  creatorTasks
    .concat(assigneeTasks)
    .filter((task) => task && task.status !== STATUS.COMPLETED && task.status !== STATUS.CLOSED && task.status !== STATUS.REFACTORED)
    .forEach((task) => {
      ids.add(String(task._id))
    })
  return ids.size
}

function visibleToUser(task, userId) {
  return (
    task &&
    (task.creatorId === userId ||
      task.assigneeId === userId ||
      String(task.creatorId || '').startsWith(SYSTEM_PREFIX))
  )
}

function sameInstant(left, right) {
  const leftTime = left ? new Date(left).getTime() : NaN
  const rightTime = right ? new Date(right).getTime() : NaN
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return false
  return leftTime === rightTime
}

async function listTasksByWhere(where, orderField, orderDirection) {
  const result = await db
    .collection(TASKS)
    .where(where)
    .orderBy(orderField || 'updatedAt', orderDirection || 'desc')
    .get()
  return result.data || []
}

async function listArchivesByWhere(where) {
  const result = await db.collection(ARCHIVES).where(where).orderBy('updatedAt', 'desc').get()
  return result.data || []
}

async function buildDashboard(userId) {
  await cleanupExpiredChallengeTasks(userId, now())
  const { seeds, start, end, creatorId } = buildChallengeSeeds(userId, now())
  const seedKeys = seeds.map((item) => item.seedKey)

  const [creatorRes, assigneeRes, archiveRes, challengeRes] = await Promise.all([
    db.collection(TASKS).where({ creatorId: userId }).orderBy('updatedAt', 'desc').get(),
    db.collection(TASKS).where({ assigneeId: userId }).orderBy('updatedAt', 'desc').get(),
    db.collection(ARCHIVES).where({ ownerId: userId }).orderBy('updatedAt', 'desc').get(),
    seedKeys.length
      ? db.collection(TASKS).where({ creatorId, seedKey: _.in(seedKeys) }).orderBy('createdAt', 'asc').get()
      : Promise.resolve({ data: [] }),
  ])

  const creatorTasks = creatorRes.data
  const assigneeTasks = assigneeRes.data
  const archives = archiveRes.data
  const challengeExisting = challengeRes.data

  const challengeMap = challengeExisting.reduce((map, item) => {
    map[item.seedKey] = item
    return map
  }, {})

  const challengeTasks = seeds.map(({ seedKey, template }) => {
    if (challengeMap[seedKey]) return challengeMap[seedKey]
    return {
      _id: seedKey,
      title: template.title,
      detail: template.detail,
      icon: template.icon,
      category: 'challenge',
      status: STATUS.PENDING,
      creatorId,
      assigneeId: '',
      dueAt: end,
      startAt: start,
      seedKey,
      subtasks: template.subtasks.map((item) => ({ title: item.title, total: item.total, current: 0 })),
      attributeReward: template.reward,
      isVirtual: true,
      createdAt: start,
      updatedAt: start,
    }
  })

  const nameMap = await getUserNameMap(
    creatorTasks
      .concat(assigneeTasks)
      .concat(challengeExisting)
      .map((task) => [task.creatorId, task.assigneeId])
      .flat()
      .concat([userId])
      .filter(Boolean)
  )

  const today = buildTodayTasks(assigneeTasks)

  const history = creatorTasks.filter((task) => task.status === STATUS.REFACTORED)

  return {
    summary: {
      pending: creatorTasks.filter((task) => task.status === STATUS.PENDING).length,
      inProgress: assigneeTasks.filter((task) => task.status === STATUS.IN_PROGRESS).length,
      reviewPending: assigneeTasks.filter((task) => task.status === STATUS.REVIEW_PENDING).length,
      completed: archives.filter((item) => item.status === STATUS.COMPLETED).length,
      totalOpen: countOpenTasks(creatorTasks, assigneeTasks),
    },
    creator: creatorTasks.map((item) => normalizeTask(item, nameMap)),
    assignee: assigneeTasks.map((item) => normalizeTask(item, nameMap)),
    completed: sortByDateDesc(archives, 'completedAt').map((item) => normalizeArchive(item, nameMap)),
    history: history.map((item) => normalizeTask(item, nameMap)),
    today: {
      dueTodayCount: today.dueTodayCount,
      tasks: today.tasks.map((item) => normalizeTask(item, nameMap)),
    },
    challenge: challengeTasks.map((item) => normalizeTask(item, nameMap)),
  }
}

async function conflictRefresh(userId, message, taskId) {
  return fail(message || 'Task updated, page refreshed', 'CONFLICT_REFRESH', {
    taskId: taskId || '',
    dashboard: await buildDashboard(userId),
  })
}

async function ensureTaskFresh(task, payload, userId) {
  const clientUpdatedAt = payload && payload.clientUpdatedAt ? String(payload.clientUpdatedAt) : ''
  if (!clientUpdatedAt) return null
  if (sameInstant(clientUpdatedAt, task && task.updatedAt)) return null
  return conflictRefresh(userId, 'Task updated, page refreshed', task && task._id ? task._id : '')
}

async function bootstrap() {
  const userId = await getCurrentUserId()
  const user = await ensureUser(userId)
  const dashboard = await buildDashboard(userId)
  const templates = getTemplateConfig()
  return success({
    profile: {
      _id: user._id || user.userId,
      userId: user.userId,
      nickname: user.nickname || `旅者-${String(user.userId).slice(-4)}`,
      avatar: user.avatar || '',
      stars: Number(user.stars || 0),
      wisdom: Number(user.wisdom || 0),
      strength: Number(user.strength || 0),
      agility: Number(user.agility || 0),
      onboarding: {
        seen: Boolean(user.onboarding && user.onboarding.seen),
        seenAt: toIso(user.onboarding && user.onboarding.seenAt),
      },
      subscribePreferences: normalizePreferences(user.subscribePreferences, templates),
      subscribeTemplates: templates,
      createdAt: toIso(user.createdAt),
      updatedAt: toIso(user.updatedAt),
    },
    dashboard,
  })
}

async function updateProfile(payload) {
  const userId = await getCurrentUserId()
  const user = await ensureUser(userId)
  const nickname = payload && payload.nickname ? String(payload.nickname).trim() : user.nickname
  const avatar = payload && payload.avatar ? String(payload.avatar).trim() : user.avatar
  assert(nickname, 'Nickname is required', 'INVALID_NICKNAME')
  assert(!containsSensitiveText(nickname), SENSITIVE_HINT, 'SENSITIVE_CONTENT')
  assert(!(await moderateWithAI(nickname)), SENSITIVE_HINT, 'SENSITIVE_CONTENT')
  await db.collection(USERS).doc(user._id).update({
    data: {
      nickname,
      avatar,
      updatedAt: now(),
    },
  })
  return bootstrap()
}

async function saveSubscribeSettings(payload) {
  const userId = await getCurrentUserId()
  const user = await ensureUser(userId)
  const templates = getTemplateConfig()
  const resultMap = payload && payload.result && typeof payload.result === 'object' ? payload.result : {}
  const nextPreferences = applySubscribeResult(user.subscribePreferences, resultMap, templates, now())
  await saveUserSubscribePreferences(user, nextPreferences)
  return success({
    preferences: nextPreferences,
    templates,
  })
}

async function completeOnboarding() {
  const userId = await getCurrentUserId()
  const user = await ensureUser(userId)
  const completedAt = now()
  await db.collection(USERS).doc(user._id).update({
    data: {
      onboarding: {
        seen: true,
        seenAt: completedAt,
      },
      updatedAt: completedAt,
    },
  })
  return success({
    seen: true,
    seenAt: toIso(completedAt),
  })
}

async function createTask(payload) {
  const userId = await getCurrentUserId()
  const user = await ensureUser(userId)
  const title = String(payload && payload.title ? payload.title : '').trim()
  const detail = String(payload && payload.detail ? payload.detail : '').trim()
  const offlineRewardPromise = String(payload && payload.offlineRewardPromise ? payload.offlineRewardPromise : '').trim()
  const dueAt = new Date(payload && payload.dueAt ? payload.dueAt : '')
  const subtasks = normalizeSubtasks(payload && payload.subtasks)
  const attributeReward = normalizeReward(payload && payload.attributeReward)
  const createdAt = now()

  assert(title, 'Title is required', 'INVALID_TITLE')
  assert(!Number.isNaN(dueAt.getTime()), 'Valid dueAt is required', 'INVALID_DUE_AT')
  assert(subtasks.length > 0, 'At least one subtask is required', 'INVALID_SUBTASKS')
  assert(!containsSensitiveTask({ title, detail, offlineRewardPromise, subtasks }), SENSITIVE_HINT, 'SENSITIVE_CONTENT')
  assert(!(await moderateWithAI([title, detail, offlineRewardPromise].concat(subtasks.map((item) => item.title)).filter(Boolean).join(' '))), SENSITIVE_HINT, 'SENSITIVE_CONTENT')

  const record = {
    title,
    detail,
    offlineRewardPromise,
    icon: payload && payload.icon ? String(payload.icon) : '',
    status: payload && payload.selfAssign ? STATUS.IN_PROGRESS : STATUS.PENDING,
    category: 'normal',
    creatorId: userId,
    creatorName: user.nickname || `旅者-${String(userId).slice(-4)}`,
    assigneeId: payload && payload.selfAssign ? userId : '',
    assigneeName: payload && payload.selfAssign ? user.nickname || `旅者-${String(userId).slice(-4)}` : '',
    ownerScope: 'personal',
    dueAt,
    startAt: createdAt,
    submittedAt: null,
    completedAt: null,
    closedAt: null,
    deleteAt: null,
    dueSoonNotifiedAt: null,
    overdueNotifiedAt: null,
    challengeExpiredNotifiedAt: null,
    seedKey: '',
    subtasks,
    attributeReward,
    createdAt,
    updatedAt: createdAt,
  }

  const added = await db.collection(TASKS).add({ data: record })
  const task = await db.collection(TASKS).doc(added._id).get()
  return success(normalizeTask(task.data, { [userId]: user.nickname }))
}

async function getTask(payload) {
  const userId = await getCurrentUserId()
  const taskId = String(payload && payload.taskId ? payload.taskId : '')
  assert(taskId, 'taskId is required', 'INVALID_TASK_ID')

  if (taskId.startsWith('challenge_')) {
    const { seeds, start, end, creatorId } = buildChallengeSeeds(userId, now())
    const hit = seeds.find((item) => item.seedKey === taskId)
    assert(hit, 'Task not found', 'NOT_FOUND')
    const nameMap = await getUserNameMap([userId])
    return success(
      normalizeTask(
        {
          _id: hit.seedKey,
          title: hit.template.title,
          detail: hit.template.detail,
          icon: hit.template.icon,
          category: 'challenge',
          status: STATUS.PENDING,
          creatorId,
          dueAt: end,
          startAt: start,
          seedKey: hit.seedKey,
          subtasks: hit.template.subtasks.map((item) => ({ title: item.title, total: item.total, current: 0 })),
          attributeReward: hit.template.reward,
          isVirtual: true,
          createdAt: start,
          updatedAt: start,
        },
        nameMap
      )
    )
  }

  let task = null
  try {
    task = await getTaskById(taskId)
  } catch (error) {
    task = null
  }

  if (task) {
    const isVisible =
      task.creatorId === userId ||
      task.assigneeId === userId ||
      String(task.creatorId || '').startsWith(SYSTEM_PREFIX)
    const isSharePreviewAllowed = task.status === STATUS.PENDING && !task.assigneeId
    const nameMap = await getUserNameMap([task.creatorId, task.assigneeId])
    const normalized = normalizeTask(task, nameMap)
    if (isVisible || isSharePreviewAllowed) {
      return success(normalized)
    }
    return success(
      Object.assign({}, normalized, {
        sharedPreviewLocked: true,
        title: normalized.title || '分享任务',
        detail: '任务已被接取',
        sharedPreviewMessage: '任务已被接取',
        assigneeName: '',
      })
    )
  }

  const archiveRes = await db.collection(ARCHIVES).where({ sourceTaskId: taskId, ownerId: userId }).limit(1).get()
  const archive = archiveRes.data[0]
  assert(archive, 'Task not found', 'NOT_FOUND')
  const nameMap = await getUserNameMap([archive.snapshot.creatorId, archive.snapshot.assigneeId])
  return success({
    archive: true,
    data: normalizeArchive(archive, nameMap),
  })
}

async function acceptChallengeTask(payload) {
  const userId = await getCurrentUserId()
  const user = await ensureUser(userId)
  const seedKey = String(payload && payload.seedKey ? payload.seedKey : '')
  assert(seedKey, 'seedKey is required', 'INVALID_SEED_KEY')

  const { seeds, start, end, creatorId } = buildChallengeSeeds(userId, now())
  const hit = seeds.find((item) => item.seedKey === seedKey)
  assert(hit, 'Challenge not found', 'NOT_FOUND')

  const existingRes = await db.collection(TASKS).where({ creatorId, seedKey }).limit(1).get()
  const existing = existingRes.data[0]
  if (existing) {
    if (existing.status === STATUS.PENDING && !existing.assigneeId) {
      await db.collection(TASKS).doc(existing._id).update({
        data: {
          assigneeId: userId,
          assigneeName: user.nickname || `旅者-${String(userId).slice(-4)}`,
          status: STATUS.IN_PROGRESS,
          updatedAt: now(),
        },
      })
      const updated = await refreshTask(existing._id)
      return success(normalizeTask(updated, { [userId]: user.nickname }))
    }
    return success(normalizeTask(existing, { [userId]: user.nickname }))
  }

  const createdAt = now()
  const added = await db.collection(TASKS).add({
    data: {
      title: hit.template.title,
      detail: hit.template.detail,
      icon: hit.template.icon,
      status: STATUS.IN_PROGRESS,
      category: 'challenge',
      creatorId,
      creatorName: '星旅系统',
      assigneeId: userId,
      assigneeName: user.nickname || `旅者-${String(userId).slice(-4)}`,
      ownerScope: 'personal',
      dueAt: end,
      startAt: start,
      submittedAt: null,
      completedAt: null,
      closedAt: null,
      deleteAt: end,
      dueSoonNotifiedAt: null,
      overdueNotifiedAt: null,
      challengeExpiredNotifiedAt: null,
      seedKey,
      subtasks: hit.template.subtasks.map((item) => ({
        title: item.title,
        total: item.total,
        current: 0,
      })),
      attributeReward: hit.template.reward,
      createdAt,
      updatedAt: createdAt,
    },
  })
  const task = await getTaskById(added._id)
  return success(normalizeTask(task, { [userId]: user.nickname }))
}

async function acceptTask(payload) {
  const userId = await getCurrentUserId()
  const user = await ensureUser(userId)
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.status === STATUS.PENDING, 'Task state changed', 'STATE_CHANGED')
  assert(!task.assigneeId, 'Task already accepted', 'STATE_CHANGED')
  await db.collection(TASKS).doc(task._id).update({
    data: {
      assigneeId: userId,
      assigneeName: user.nickname || `旅者-${String(userId).slice(-4)}`,
      status: STATUS.IN_PROGRESS,
      dueSoonNotifiedAt: null,
      overdueNotifiedAt: null,
      updatedAt: now(),
    },
  })
  const updated = await refreshTask(task._id)
  await sendSceneNotification(
    updated.creatorId,
    SCENES.work,
    buildSubscribeData({
      taskName: updated.title || '任务提醒',
      assignee: updated.assigneeName || '',
      startTime: formatDateTime(updated.createdAt || updated.startAt || now()),
      dueTime: formatDateTime(updated.dueAt || updated.createdAt || now()),
      status: '已接取',
      tip: updated.assigneeName ? `${updated.assigneeName}接取了任务` : '已接取',
    }),
    { event: 'task_assigned', actorId: userId, taskId: updated._id }
  ).catch(() => null)
  return success(normalizeTask(updated, await getUserNameMap([updated.creatorId, updated.assigneeId])))
}

async function updateProgress(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.assigneeId === userId, 'Forbidden', 'FORBIDDEN')
  assert(task.status === STATUS.IN_PROGRESS, 'Task state changed', 'STATE_CHANGED')
  const index = Number(payload && payload.subtaskIndex)
  const current = Number(payload && payload.current)
  assert(Number.isInteger(index), 'subtaskIndex is required', 'INVALID_SUBTASK')
  assert(Number.isFinite(current), 'current is required', 'INVALID_SUBTASK')
  const subtasks = normalizeSubtasks(task.subtasks)
  assert(subtasks[index], 'subtaskIndex out of range', 'INVALID_SUBTASK')
  subtasks[index].current = clamp(Math.floor(current), 0, subtasks[index].total)
  await db.collection(TASKS).doc(task._id).update({
    data: {
      subtasks,
      updatedAt: now(),
    },
  })
  const updated = await refreshTask(task._id)
  return success(normalizeTask(updated, await getUserNameMap([updated.creatorId, updated.assigneeId])))
}

async function submitReview(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.assigneeId === userId, 'Forbidden', 'FORBIDDEN')
  assert(task.status === STATUS.IN_PROGRESS, 'Task state changed', 'STATE_CHANGED')
  const submittedAt = now()
  const subtasks = normalizeSubtasks(task.subtasks).map((item) => ({
    title: item.title,
    total: item.total,
    current: item.total,
  }))
  await db.collection(TASKS).doc(task._id).update({
    data: {
      subtasks,
      status: STATUS.REVIEW_PENDING,
      submittedAt,
      updatedAt: submittedAt,
    },
  })
  const updated = await refreshTask(task._id)
  await upsertArchive(userId, updated, STATUS.REVIEW_PENDING)
  await sendSceneNotification(
    updated.creatorId,
    SCENES.review,
    buildSubscribeData({
      reviewType: '提交检视',
      reviewResult: '待确认',
      notifyTime: formatDateTime(submittedAt),
      reviewer: updated.assigneeName || '',
      status: '待检视',
      tip: updated.assigneeName ? `${updated.assigneeName}提交了检视` : '待检视',
    }),
    { event: 'task_review_submitted', actorId: userId, taskId: updated._id }
  ).catch(() => null)
  return success(normalizeTask(updated, await getUserNameMap([updated.creatorId, updated.assigneeId])))
}

async function continueReview(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.creatorId === userId, 'Forbidden', 'FORBIDDEN')
  assert(task.status === STATUS.REVIEW_PENDING, 'Task state changed', 'STATE_CHANGED')
  await db.collection(TASKS).doc(task._id).update({
    data: {
      status: STATUS.IN_PROGRESS,
      submittedAt: null,
      updatedAt: now(),
    },
  })
  if (task.assigneeId) {
    await removeArchive(task.assigneeId, task._id)
  }
  const updated = await refreshTask(task._id)
  if (task.assigneeId) {
    await sendSceneNotification(
      task.assigneeId,
      SCENES.work,
      buildSubscribeData({
        taskName: updated.title || '任务提醒',
        assignee: task.assigneeName || '',
        startTime: formatDateTime(task.originalStartAt || updated.createdAt || closedAt),
        dueTime: formatDateTime(task.originalDueAt || updated.dueAt || closedAt),
        status: '已关闭',
        tip: '任务已被发布者关闭',
      }),
      { event: 'task_closed', actorId: userId, taskId: updated._id }
    ).catch(() => null)
  }
  return success(normalizeTask(updated, await getUserNameMap([updated.creatorId, updated.assigneeId])))
}

async function completeTask(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.creatorId === userId || task.assigneeId === userId, 'Forbidden', 'FORBIDDEN')
  const completedAt = now()
  const deleteAt =
    task.category === 'challenge'
      ? endOfDay(completedAt)
      : new Date(completedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
  const subtasks = normalizeSubtasks(task.subtasks).map((item) => ({
    title: item.title,
    total: item.total,
    current: item.total,
  }))
  await db.collection(TASKS).doc(task._id).update({
    data: {
      subtasks,
      status: STATUS.COMPLETED,
      completedAt,
      deleteAt,
      updatedAt: completedAt,
    },
  })
  const updated = await refreshTask(task._id)
  if (updated.assigneeId) {
    await upsertArchive(updated.assigneeId, updated, STATUS.COMPLETED)
    await awardUser(updated.assigneeId, updated.attributeReward)
  }
  return success(normalizeTask(updated, await getUserNameMap([updated.creatorId, updated.assigneeId])))
}

async function abandonTask(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.assigneeId === userId, 'Forbidden', 'FORBIDDEN')
  assert(ACTIVE_ASSIGNEE_STATUS.includes(task.status), 'Task state changed', 'STATE_CHANGED')
  await db.collection(TASKS).doc(task._id).update({
    data: {
      assigneeId: '',
      assigneeName: '',
      status: STATUS.PENDING,
      submittedAt: null,
      dueSoonNotifiedAt: null,
      overdueNotifiedAt: null,
      updatedAt: now(),
    },
  })
  await removeArchive(userId, task._id)
  const updated = await refreshTask(task._id)
  await sendSceneNotification(
    updated.creatorId,
    SCENES.work,
    buildSubscribeData({
      taskName: updated.title || '任务提醒',
      assignee: task.assigneeName || '',
      startTime: formatDateTime(updated.startAt || updated.createdAt),
      dueTime: formatDateTime(updated.dueAt || updated.createdAt),
      status: '已放弃',
      tip: task.assigneeName ? `${task.assigneeName}已放弃任务` : '已放弃',
    }),
    { event: 'task_abandoned', actorId: userId, taskId: updated._id }
  ).catch(() => null)
  return success(normalizeTask(updated, await getUserNameMap([updated.creatorId, updated.assigneeId])))
}

async function closeTask(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.creatorId === userId, 'Forbidden', 'FORBIDDEN')
  const closedAt = now()
  await db.collection(TASKS).doc(task._id).update({
    data: {
      originalStatus: task.originalStatus || (task.assigneeId ? STATUS.PENDING : task.status),
      originalStartAt: task.originalStartAt || task.startAt || task.createdAt,
      originalDueAt: task.originalDueAt || task.dueAt,
      status: STATUS.CLOSED,
      assigneeId: '',
      assigneeName: '',
      closedAt,
      startAt: closedAt,
      dueAt: new Date(closedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      deleteAt: new Date(closedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      updatedAt: closedAt,
    },
  })
  if (task.assigneeId) {
    await removeArchive(task.assigneeId, task._id)
  }
  const updated = await refreshTask(task._id)
  if (task.assigneeId) {
    await sendSceneNotification(
      task.assigneeId,
      SCENES.work,
      buildSubscribeData({
        taskName: updated.title || '任务提醒',
        assignee: task.assigneeName || '',
        startTime: formatDateTime(task.originalStartAt || task.startAt || task.createdAt),
        dueTime: formatDateTime(task.originalDueAt || task.dueAt || closedAt),
        status: '已关闭',
        tip: '任务已被关闭',
      }),
      { event: 'task_closed', actorId: userId, taskId: updated._id }
    ).catch(() => null)
  }
  return success(normalizeTask(updated, await getUserNameMap([updated.creatorId, updated.assigneeId])))
}

async function restartTask(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.creatorId === userId, 'Forbidden', 'FORBIDDEN')
  assert(task.status === STATUS.CLOSED, 'Task state changed', 'STATE_CHANGED')
  await db.collection(TASKS).doc(task._id).update({
    data: {
      status: STATUS.PENDING,
      startAt: task.originalStartAt || task.startAt || task.createdAt,
      dueAt: task.originalDueAt || task.dueAt,
      closedAt: null,
      deleteAt: null,
      dueSoonNotifiedAt: null,
      overdueNotifiedAt: null,
      originalStatus: null,
      originalStartAt: null,
      originalDueAt: null,
      updatedAt: now(),
    },
  })
  const updated = await refreshTask(task._id)
  return success(normalizeTask(updated, await getUserNameMap([updated.creatorId, updated.assigneeId])))
}

async function getAllTasks() {
  const userId = await getCurrentUserId()
  await cleanupExpiredChallengeTasks(userId, now())
  const [creatorTasks, assigneeTasks] = await Promise.all([
    listTasksByWhere({ creatorId: userId }, 'dueAt', 'asc'),
    listTasksByWhere({ assigneeId: userId }, 'dueAt', 'asc'),
  ])
  const merged = [...creatorTasks]
  const seen = new Set(creatorTasks.map((item) => String(item._id)))
  assigneeTasks.forEach((item) => {
    if (seen.has(String(item._id))) return
    seen.add(String(item._id))
    merged.push(item)
  })
  const nameMap = await getUserNameMap(
    merged
      .map((item) => [item.creatorId, item.assigneeId])
      .flat()
      .filter(Boolean)
  )
  return success(merged.map((item) => normalizeTask(item, nameMap)))
}

async function getMissionTasks() {
  const userId = await getCurrentUserId()
  await cleanupExpiredChallengeTasks(userId, now())
  const tasks = await listTasksByWhere({ assigneeId: userId }, 'dueAt', 'asc')
  const filtered = tasks.filter((task) => ACTIVE_ASSIGNEE_STATUS.includes(task.status))
  const nameMap = await getUserNameMap(filtered.map((item) => [item.creatorId, item.assigneeId]).flat().filter(Boolean))
  return success(filtered.map((item) => normalizeTask(item, nameMap)))
}

async function getCollabTasks() {
  const userId = await getCurrentUserId()
  const tasks = await listTasksByWhere({ creatorId: userId }, 'dueAt', 'asc')
  const filtered = tasks.filter((task) => {
    if (task.status === STATUS.REFACTORED) return false
    if (task.assigneeId && task.assigneeId === userId) return false
    if (task.status === STATUS.COMPLETED && (!task.assigneeId || task.assigneeId === userId)) return false
    return true
  })
  const nameMap = await getUserNameMap(filtered.map((item) => [item.creatorId, item.assigneeId]).flat().filter(Boolean))
  return success(filtered.map((item) => normalizeTask(item, nameMap)))
}

async function getArchivedTasks() {
  const userId = await getCurrentUserId()
  const archives = await listArchivesByWhere({ ownerId: userId })
  const nameMap = await getUserNameMap(
    archives
      .map((item) => [item.snapshot && item.snapshot.creatorId, item.snapshot && item.snapshot.assigneeId])
      .flat()
      .filter(Boolean)
  )
  return success(archives.map((item) => normalizeArchive(item, nameMap)))
}

async function getChallengeTasks() {
  const userId = await getCurrentUserId()
  await cleanupExpiredChallengeTasks(userId, now())
  const { seeds, start, end, creatorId } = buildChallengeSeeds(userId, now())
  const seedKeys = seeds.map((item) => item.seedKey)
  const existingRes = seedKeys.length
    ? await db.collection(TASKS).where({ creatorId, seedKey: _.in(seedKeys) }).orderBy('createdAt', 'asc').get()
    : { data: [] }
  const existingMap = (existingRes.data || []).reduce((map, item) => {
    map[item.seedKey] = item
    return map
  }, {})
  const nameMap = await getUserNameMap([userId])
  const tasks = seeds.reduce((list, item) => {
    const existing = existingMap[item.seedKey]
    if (existing) {
      if (existing.status === STATUS.PENDING && !existing.assigneeId) list.push(existing)
      return list
    }
    list.push({
      _id: item.seedKey,
      title: item.template.title,
      detail: item.template.detail,
      icon: item.template.icon,
      category: 'challenge',
      status: STATUS.PENDING,
      creatorId,
      assigneeId: '',
      dueAt: end,
      startAt: start,
      seedKey: item.seedKey,
      subtasks: item.template.subtasks.map((subtask) => ({ title: subtask.title, total: subtask.total, current: 0 })),
      attributeReward: item.template.reward,
      isVirtual: true,
      createdAt: start,
      updatedAt: start,
    })
    return list
  }, [])
  return success(tasks.map((item) => normalizeTask(item, nameMap)))
}

async function getTodayTasks() {
  const userId = await getCurrentUserId()
  await cleanupExpiredChallengeTasks(userId, now())
  const tasks = await listTasksByWhere({ assigneeId: userId }, 'dueAt', 'asc')
  const today = buildTodayTasks(tasks)
  const nameMap = await getUserNameMap(today.tasks.map((item) => [item.creatorId, item.assigneeId]).flat().filter(Boolean))
  return success({
    dueTodayCount: today.dueTodayCount,
    tasks: today.tasks.map((item) => normalizeTask(item, nameMap)),
  })
}

async function refreshTaskSchedule(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.creatorId === userId, 'Forbidden', 'FORBIDDEN')
  assert(!task.assigneeId, 'Task already assigned', 'BAD_REQUEST')
  assert(task.status === STATUS.PENDING, 'Task state changed', 'STATE_CHANGED')
  assert(task.dueAt, 'task missing dueAt', 'BAD_REQUEST')
  const current = now()
  assert(new Date(task.dueAt).getTime() < current.getTime(), 'task not overdue', 'BAD_REQUEST')
  const baseStart = task.startAt ? new Date(task.startAt) : task.createdAt ? new Date(task.createdAt) : null
  assert(baseStart, 'task missing startAt', 'BAD_REQUEST')
  const durationMs = Math.max(60000, new Date(task.dueAt).getTime() - baseStart.getTime())
  const nextDueAt = new Date(current.getTime() + durationMs)
  await db.collection(TASKS).doc(task._id).update({
    data: {
      startAt: current,
      dueAt: nextDueAt,
      dueSoonNotifiedAt: null,
      overdueNotifiedAt: null,
      updatedAt: current,
    },
  })
  const updated = await refreshTask(task._id)
  return success(normalizeTask(updated, await getUserNameMap([updated.creatorId, updated.assigneeId])))
}

async function deleteTask(payload) {
  const userId = await getCurrentUserId()
  const taskId = String(payload && payload.taskId ? payload.taskId : '')
  assert(taskId, 'taskId is required', 'INVALID_TASK_ID')
  const archiveRes = await db.collection(ARCHIVES).where({ _id: taskId, ownerId: userId }).limit(1).get()
  const archive = archiveRes.data[0]
  if (archive) {
    assert(archive.status !== STATUS.REVIEW_PENDING, 'Review pending archive cannot be deleted', 'BAD_REQUEST')
    await db.collection(ARCHIVES).doc(archive._id).remove()
    return success({ ok: true, deleted: 'archive' })
  }
  const task = await getTaskById(taskId)
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.creatorId === userId, 'Forbidden', 'FORBIDDEN')
  assert(task.status === STATUS.CLOSED, 'Only closed tasks can be deleted', 'BAD_REQUEST')
  await db.collection(TASKS).doc(task._id).remove()
  if (task.previousTaskId) {
    await deleteRefactoredChain(task.previousTaskId, userId)
  }
  return success({ ok: true, deleted: 'task' })
}

async function reworkTask(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.creatorId === userId, 'Forbidden', 'FORBIDDEN')
  assert(task.status !== STATUS.REFACTORED, 'Task already refactored', 'STATE_CHANGED')

  const title = String(payload && payload.title ? payload.title : '').trim()
  const detail = String(payload && payload.detail ? payload.detail : '').trim()
  const offlineRewardPromise = String(payload && payload.offlineRewardPromise ? payload.offlineRewardPromise : '').trim()
  const dueAt = new Date(payload && payload.dueAt ? payload.dueAt : '')
  const subtasks = normalizeSubtasks(payload && payload.subtasks)
  const attributeReward = normalizeReward(payload && payload.attributeReward)
  const icon = payload && payload.icon ? String(payload.icon) : task.icon || ''
  assert(title, 'Title is required', 'INVALID_TITLE')
  assert(!Number.isNaN(dueAt.getTime()), 'Valid dueAt is required', 'INVALID_DUE_AT')
  assert(subtasks.length > 0, 'At least one subtask is required', 'INVALID_SUBTASKS')
  assert(!containsSensitiveTask({ title, detail, offlineRewardPromise, subtasks }), SENSITIVE_HINT, 'SENSITIVE_CONTENT')
  assert(!(await moderateWithAI([title, detail, offlineRewardPromise].concat(subtasks.map((item) => item.title)).filter(Boolean).join(' '))), SENSITIVE_HINT, 'SENSITIVE_CONTENT')

  const isSame =
    title === String(task.title || '').trim() &&
    detail === String(task.detail || '').trim() &&
    offlineRewardPromise === String(task.offlineRewardPromise || '').trim() &&
    Number(dueAt.getTime()) === Number(new Date(task.dueAt).getTime()) &&
    attributeReward.type === (task.attributeReward && task.attributeReward.type) &&
    Number(attributeReward.value) === Number(task.attributeReward && task.attributeReward.value) &&
    areSubtasksEqual(
      subtasks,
      normalizeSubtasks(task.subtasks).map((item) => ({ title: item.title, total: item.total }))
    )

  if (isSame) {
    return success({
      message: 'no changes',
      task: normalizeTask(task, await getUserNameMap([task.creatorId, task.assigneeId])),
    })
  }

  const isSelfAssigned = Boolean(task.creatorId && task.assigneeId && task.creatorId === task.assigneeId)
  if (task.previousTaskId && !payload.confirmDeletePrevious && !isSelfAssigned) {
    return fail('confirm required', 'REWORK_CONFIRM_REQUIRED', {
      previousTaskId: task.previousTaskId,
    })
  }

  const current = now()
  await db.collection(TASKS).doc(task._id).update({
    data: {
      status: STATUS.REFACTORED,
      originalStatus: task.originalStatus || task.status,
      originalStartAt: task.originalStartAt || task.startAt || task.createdAt || current,
      originalDueAt: task.originalDueAt || task.dueAt,
      assigneeId: '',
      assigneeName: '',
      updatedAt: current,
    },
  })

  const user = await ensureUser(userId)
  const added = await db.collection(TASKS).add({
    data: {
      title,
      detail,
      offlineRewardPromise,
      icon,
      dueAt,
      startAt: current,
      closedAt: null,
      deleteAt: null,
      originalDueAt: null,
      originalStartAt: null,
      originalStatus: null,
      status: task.assigneeId ? STATUS.PENDING_CONFIRMATION : STATUS.PENDING,
      creatorId: userId,
      creatorName: user.nickname || `旅者-${String(userId).slice(-4)}`,
      assigneeId: task.assigneeId || '',
      assigneeName: task.assigneeName || '',
      previousTaskId: task._id,
      subtasks,
      attributeReward,
      seedKey: task.seedKey || '',
      dueSoonNotifiedAt: null,
      overdueNotifiedAt: null,
      challengeExpiredNotifiedAt: null,
      category: task.category || 'normal',
      createdAt: current,
      updatedAt: current,
    },
  })

  if (task.previousTaskId && (payload.confirmDeletePrevious || isSelfAssigned) && !task.assigneeId) {
    await deletePreviousTask(task)
  }

  const created = await getTaskById(added._id)
  if (created.assigneeId) {
    await sendSceneNotification(
      created.assigneeId,
      SCENES.taskUpdate,
      buildSubscribeData({
        taskName: created.title || '任务提醒',
        changeDetail: '待确认变更',
        changeTime: formatDateTime(current),
        status: '待确认变更',
        tip: '任务已重构，请确认变更',
      }),
      { event: 'task_rework_pending', actorId: userId, taskId: created._id }
    ).catch(() => null)
  }
  return success(normalizeTask(created, await getUserNameMap([created.creatorId, created.assigneeId])))
}

async function acceptReworkTask(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.assigneeId === userId, 'Forbidden', 'FORBIDDEN')
  assert(task.status === STATUS.PENDING_CONFIRMATION, 'Task state changed', 'STATE_CHANGED')
  const current = now()
  await db.collection(TASKS).doc(task._id).update({
    data: {
      status: STATUS.IN_PROGRESS,
      updatedAt: current,
    },
  })
  if (task.previousTaskId) {
    try {
      const previous = await getTaskById(task.previousTaskId)
      if (previous) {
        await db.collection(TASKS).doc(task.previousTaskId).update({
        data: {
          status: STATUS.REFACTORED,
          originalStatus: previous.originalStatus || previous.status,
          originalStartAt: previous.originalStartAt || previous.startAt || previous.createdAt,
          originalDueAt: previous.originalDueAt || previous.dueAt,
          assigneeId: '',
          assigneeName: '',
          updatedAt: current,
        },
        })
        await deletePreviousTask(previous)
      }
    } catch (error) {
      void error
    }
  }
  const updated = await refreshTask(task._id)
  return success(normalizeTask(updated, await getUserNameMap([updated.creatorId, updated.assigneeId])))
}

async function rejectReworkTask(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.assigneeId === userId, 'Forbidden', 'FORBIDDEN')
  assert(task.status === STATUS.PENDING_CONFIRMATION, 'Task state changed', 'STATE_CHANGED')
  const current = now()
  if (task.previousTaskId) {
    try {
      const previous = await getTaskById(task.previousTaskId)
      if (previous) {
        await db.collection(TASKS).doc(task.previousTaskId).update({
          data: {
            status: STATUS.REFACTORED,
            originalStatus: previous.originalStatus || previous.status,
            originalStartAt: previous.originalStartAt || previous.startAt || previous.createdAt,
            originalDueAt: previous.originalDueAt || previous.dueAt,
            assigneeId: '',
            assigneeName: '',
            updatedAt: current,
          },
        })
        await deletePreviousTask(previous)
      }
    } catch (error) {
      void error
    }
  }
  await db.collection(TASKS).doc(task._id).update({
    data: {
      originalStatus: STATUS.PENDING,
      originalStartAt: task.originalStartAt || task.startAt || task.createdAt,
      originalDueAt: task.originalDueAt || task.dueAt,
      status: STATUS.CLOSED,
      assigneeId: '',
      assigneeName: '',
      closedAt: current,
      startAt: current,
      dueAt: new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000),
      deleteAt: new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000),
      updatedAt: current,
    },
  })
  await sendSceneNotification(
    task.creatorId,
    SCENES.review,
    buildSubscribeData({
      reviewType: '任务变更',
      reviewResult: '已拒绝',
      notifyTime: formatDateTime(current),
      rejectReason: task.assigneeName ? `${task.assigneeName}拒绝了变更` : '对方拒绝变更',
      reviewer: task.assigneeName || '',
      status: '已拒绝',
      tip: `${task.title || '任务提醒'} · 变更被拒绝`,
    }),
    { event: 'task_rework_rejected', actorId: userId, taskId: task._id }
  ).catch(() => null)
  return success({ ok: true })
}

async function cancelReworkTask(payload) {
  const userId = await getCurrentUserId()
  const task = await getTaskById(String(payload && payload.taskId ? payload.taskId : ''))
  assert(task, 'Task not found', 'NOT_FOUND')
  const stale = await ensureTaskFresh(task, payload, userId)
  if (stale) return stale
  assert(task.creatorId === userId, 'Forbidden', 'FORBIDDEN')
  assert(task.status === STATUS.PENDING_CONFIRMATION, 'Task state changed', 'STATE_CHANGED')
  const previousId = task.previousTaskId
  await db.collection(TASKS).doc(task._id).remove()
  if (previousId) {
    try {
      const previous = await getTaskById(previousId)
      if (previous && previous.creatorId === userId && previous.status === STATUS.REFACTORED) {
        await db.collection(TASKS).doc(previous._id).update({
          data: {
            status: STATUS.IN_PROGRESS,
            startAt: previous.originalStartAt || previous.startAt || previous.createdAt,
            dueAt: previous.originalDueAt || previous.dueAt,
            closedAt: null,
            originalStatus: null,
            originalStartAt: null,
            originalDueAt: null,
            updatedAt: now(),
          },
        })
      }
    } catch (error) {
      void error
    }
  }
  if (task.assigneeId) {
    await sendSceneNotification(
      task.assigneeId,
      SCENES.taskUpdate,
      buildSubscribeData({
        taskName: task.title || '任务提醒',
        changeDetail: '变更已撤销',
        changeTime: formatDateTime(now()),
        status: '变更已撤销',
        tip: '发布者撤销了重构',
      }),
      { event: 'task_rework_canceled', actorId: userId, taskId: task._id }
    ).catch(() => null)
  }
  return success({ ok: true })
}

async function route(action, payload) {
  switch (action) {
    case 'bootstrap':
      return bootstrap()
    case 'getDashboard':
      return success(await buildDashboard(await getCurrentUserId()))
    case 'getAllTasks':
      return getAllTasks()
    case 'getMissionTasks':
      return getMissionTasks()
    case 'getCollabTasks':
      return getCollabTasks()
    case 'getArchivedTasks':
      return getArchivedTasks()
    case 'getChallengeTasks':
      return getChallengeTasks()
    case 'getTodayTasks':
      return getTodayTasks()
    case 'updateProfile':
      return updateProfile(payload)
    case 'saveSubscribeSettings':
      return saveSubscribeSettings(payload)
    case 'completeOnboarding':
      return completeOnboarding()
    case 'createTask':
      return createTask(payload)
    case 'getTask':
      return getTask(payload)
    case 'deleteTask':
      return deleteTask(payload)
    case 'refreshTaskSchedule':
      return refreshTaskSchedule(payload)
    case 'acceptChallengeTask':
      return acceptChallengeTask(payload)
    case 'acceptTask':
      return acceptTask(payload)
    case 'reworkTask':
      return reworkTask(payload)
    case 'acceptReworkTask':
      return acceptReworkTask(payload)
    case 'rejectReworkTask':
      return rejectReworkTask(payload)
    case 'cancelReworkTask':
      return cancelReworkTask(payload)
    case 'updateProgress':
      return updateProgress(payload)
    case 'submitReview':
      return submitReview(payload)
    case 'continueReview':
      return continueReview(payload)
    case 'completeTask':
      return completeTask(payload)
    case 'abandonTask':
      return abandonTask(payload)
    case 'closeTask':
      return closeTask(payload)
    case 'restartTask':
      return restartTask(payload)
    default:
      return fail(`Unsupported action: ${action}`, 'UNSUPPORTED_ACTION')
  }
}

exports.main = async (event) => {
  try {
    const action = event && event.action ? String(event.action) : ''
    return await route(action, event && event.data ? event.data : {})
  } catch (error) {
    return fail(error.message || 'Task gateway failed', error.code || 'INTERNAL_ERROR', error.extra || undefined)
  }
}
