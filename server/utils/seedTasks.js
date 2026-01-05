const Task = require('../models/Task')

const SYSTEM_USER_ID = 'sys:system'
const DEFAULT_CREATED_AT = new Date(2000, 0, 1, 0, 0, 0, 0)

const startOfDay = (date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const endOfDay = (date) => {
  const d = new Date(date)
  d.setHours(23, 59, 0, 0)
  return d
}

const ymd = (d) => {
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

const buildAt = (base, offsetDays, hour, minute) => {
  const d = new Date(base)
  d.setDate(d.getDate() + offsetDays)
  d.setHours(hour, minute, 0, 0)
  return d
}

const testPrefix = (title) => `(测试) ${title}`

const systemCreatorIdForUser = (userId) => `sys:${String(userId || '').trim()}`

const challengeTemplates = [
  {
    id: 't1',
    title: '[星旅] 风行速练',
    detail: '跑步4km, 配速6-7, 结束拉伸10min',
    icon: '🏃',
    reward: { type: 'strength', value: 12 },
    subtasks: [{ title: '完成训练', total: 1 }],
  },
  {
    id: 't2',
    title: '[星旅] 静心冥想',
    detail: '冥想20min, 写下3个感受',
    icon: '🧘',
    reward: { type: 'wisdom', value: 10 },
    subtasks: [{ title: '完成冥想', total: 1 }],
  },
  {
    id: 't3',
    title: '[星旅] 晨光整理',
    detail: '整理桌面15min, 清空回收站',
    icon: '🧹',
    reward: { type: 'wisdom', value: 8 },
    subtasks: [{ title: '完成整理', total: 1 }],
  },
  {
    id: 't4',
    title: '[星旅] 轻跑热身',
    detail: '慢跑3km, 结束拉伸8min',
    icon: '🏃',
    reward: { type: 'strength', value: 10 },
    subtasks: [{ title: '完成热身', total: 1 }],
  },
  {
    id: 't5',
    title: '[星旅] 专注阅读',
    detail: '阅读30页, 写下3个收获',
    icon: '📚',
    reward: { type: 'wisdom', value: 10 },
    subtasks: [{ title: '完成阅读', total: 1 }],
  },
  {
    id: 't6',
    title: '[星旅] 灵敏训练',
    detail: '跳绳600次, 分3组完成',
    icon: '🐾',
    reward: { type: 'agility', value: 12 },
    subtasks: [{ title: '完成训练', total: 1 }],
  },
  {
    id: 't7',
    title: '[星旅] 补水计划',
    detail: '全天喝水8杯, 每杯250ml',
    icon: '🚰',
    reward: { type: 'strength', value: 6 },
    subtasks: [{ title: '记录补水', total: 8 }],
  },
  {
    id: 't8',
    title: '[星旅] 呼吸训练',
    detail: '深呼吸5min, 记录一次感受',
    icon: '🫁',
    reward: { type: 'agility', value: 8 },
    subtasks: [{ title: '完成训练', total: 1 }],
  },
  {
    id: 't9',
    title: '[星旅] 星光散步',
    detail: '散步30min, 不带耳机, 留意周围声音',
    icon: '🚶',
    reward: { type: 'agility', value: 8 },
    subtasks: [{ title: '完成散步', total: 1 }],
  },
  {
    id: 't10',
    title: '[星旅] 静默收尾',
    detail: '整理待办, 选1件最重要的事写在明天第一行',
    icon: '📝',
    reward: { type: 'wisdom', value: 8 },
    subtasks: [{ title: '完成收尾', total: 1 }],
  },
]

const hashSeed = (value) => {
  const str = String(value || '')
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const xorshift32 = (seed) => {
  let x = seed >>> 0
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return x >>> 0
  }
}

const pickDailyTemplates = (userId, dayKey, count) => {
  const seed = hashSeed(`${userId}|${dayKey}|challenge`)
  const next = xorshift32(seed)
  const pool = [...challengeTemplates]
  const picked = []
  const n = Math.max(0, Math.min(count, pool.length))
  for (let i = 0; i < n; i++) {
    const idx = next() % pool.length
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

const buildChallengeSeedKey = (userId, dayKey, templateId) =>
  `challenge_${dayKey}_${templateId}_${hashSeed(userId)}`

const buildChallengeTaskSeed = ({ template, seedKey, creatorId, start, end, assigneeId, status, includeDeleteAt }) => ({
  seedKey,
  title: template.title,
  detail: template.detail,
  icon: template.icon,
  creatorId,
  assigneeId: assigneeId ?? null,
  status,
  createdAt: start,
  startAt: start,
  dueAt: end,
  deleteAt: includeDeleteAt ? end : null,
  subtasks: template.subtasks.map((s) => ({ title: s.title, current: 0, total: s.total })),
  attributeReward: { type: template.reward.type, value: template.reward.value },
})

const buildChallengeVirtualTask = ({ template, seedKey, creatorId, start, end }) => ({
  _id: seedKey,
  ...buildChallengeTaskSeed({
    template,
    seedKey,
    creatorId,
    start,
    end,
    assigneeId: null,
    status: 'pending',
    includeDeleteAt: false,
  }),
})

const getDailyChallengeSeeds = (userId, now = new Date(), count = 5) => {
  const dayKey = ymd(now)
  const creatorId = systemCreatorIdForUser(userId)
  const start = startOfDay(now)
  const end = endOfDay(now)
  const templates = pickDailyTemplates(userId, dayKey, count)
  const seeds = templates.map((t) => ({ seedKey: buildChallengeSeedKey(userId, dayKey, t.id), template: t }))
  return { dayKey, creatorId, start, end, templates, seeds }
}

const buildDevScenarioSeeds = () => {
  const now = new Date()
  const today = startOfDay(now)

  return [
    {
      seedKey: 'scenario_v1_1',
      title: testPrefix('灶火清理'),
      detail: '整理灶台, 去除油渍, 检查调味料并拍照记录',
      icon: '🧽',
      creatorId: 'dev:bob',
      assigneeId: 'dev:alice',
      status: 'in_progress',
      createdAt: DEFAULT_CREATED_AT,
      startAt: DEFAULT_CREATED_AT,
      dueAt: buildAt(today, 0, 22, 0),
      subtasks: [
        { title: '清洁台面', current: 0, total: 1 },
        { title: '检查调味料', current: 0, total: 1 },
      ],
      attributeReward: { type: 'wisdom', value: 16 },
    },
    {
      seedKey: 'scenario_v1_2',
      title: testPrefix('踏青探路'),
      detail: '规划路线, 准备水和帽子, 出发前拉伸',
      icon: '🥾',
      creatorId: 'dev:bob',
      assigneeId: null,
      status: 'pending',
      createdAt: DEFAULT_CREATED_AT,
      startAt: DEFAULT_CREATED_AT,
      dueAt: buildAt(today, 2, 23, 59),
      subtasks: [{ title: '完成准备', current: 0, total: 1 }],
      attributeReward: { type: 'agility', value: 12 },
    },
    {
      seedKey: 'scenario_v1_3',
      title: testPrefix('星图整理'),
      detail: '整理今日笔记, 归档链接, 提取3个要点',
      icon: '🗂',
      creatorId: 'dev:alice',
      assigneeId: null,
      status: 'pending',
      createdAt: DEFAULT_CREATED_AT,
      startAt: DEFAULT_CREATED_AT,
      dueAt: buildAt(today, 1, 23, 59),
      subtasks: [{ title: '完成整理', current: 0, total: 1 }],
      attributeReward: { type: 'wisdom', value: 10 },
    },
    {
      seedKey: 'scenario_v1_4',
      title: testPrefix('静默收尾'),
      detail: '把未完成事项列出, 明天再处理',
      icon: '📝',
      creatorId: SYSTEM_USER_ID,
      assigneeId: 'dev:alice',
      status: 'completed',
      createdAt: DEFAULT_CREATED_AT,
      startAt: DEFAULT_CREATED_AT,
      dueAt: buildAt(today, -1, 23, 59),
      subtasks: [{ title: '完成收尾', current: 1, total: 1 }],
      attributeReward: { type: 'wisdom', value: 8 },
    },
  ]
}

async function ensureDevScenarioTasks() {
  const allowUpsert = String(process.env.DEV_RESET_TEST_TASKS || '').toLowerCase() === 'true'
  const seeds = buildDevScenarioSeeds()
  const ops = seeds.map((seed) => ({
    updateOne: {
      filter: allowUpsert
        ? { seedKey: seed.seedKey }
        : { seedKey: seed.seedKey, status: { $ne: 'refactored' }, previousTaskId: null },
      update: { $set: seed },
      upsert: allowUpsert,
    },
  }))

  const res = await Task.bulkWrite(ops, { ordered: false })
  const inserted = allowUpsert ? res.upsertedCount || 0 : 0
  return { inserted }
}

module.exports = {
  ensureDevScenarioTasks,
  getDailyChallengeSeeds,
  buildChallengeTaskSeed,
  buildChallengeVirtualTask,
  buildChallengeSeedKey,
  systemCreatorIdForUser,
}