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

const buildDailyChallengeSeeds = (day) => {
  const dayKey = ymd(day)
  const dueAt = endOfDay(day)
  const createdAt = startOfDay(day)
  const startAt = createdAt

  return [
    {
      seedKey: `challenge_${dayKey}_1`,
      title: testPrefix('风行速练'),
      detail: '配速 6-7, 跑步 4km, 结束拉伸 10min',
      icon: '🏃',
      creatorId: SYSTEM_USER_ID,
      assigneeId: null,
      status: 'pending',
      createdAt,
      startAt,
      dueAt,
      subtasks: [{ title: '完成训练', current: 0, total: 1 }],
      attributeReward: { type: 'strength', value: 20 },
    },
    {
      seedKey: `challenge_${dayKey}_2`,
      title: testPrefix('静心冥想'),
      detail: '专注冥想 45min, 记录 3 个要点',
      icon: '🧘',
      creatorId: SYSTEM_USER_ID,
      assigneeId: null,
      status: 'pending',
      createdAt,
      startAt,
      dueAt,
      subtasks: [{ title: '完成冥想', current: 0, total: 1 }],
      attributeReward: { type: 'wisdom', value: 18 },
    },
    {
      seedKey: `challenge_${dayKey}_3`,
      title: testPrefix('晨光整理'),
      detail: '整理桌面 15min, 清空回收站',
      icon: '🧹',
      creatorId: SYSTEM_USER_ID,
      assigneeId: null,
      status: 'pending',
      createdAt,
      startAt,
      dueAt,
      subtasks: [{ title: '完成整理', current: 0, total: 1 }],
      attributeReward: { type: 'wisdom', value: 12 },
    },
    {
      seedKey: `challenge_${dayKey}_4`,
      title: testPrefix('轻跑热身'),
      detail: '慢跑 3km, 结束拉伸 8min',
      icon: '🏃',
      creatorId: SYSTEM_USER_ID,
      assigneeId: null,
      status: 'pending',
      createdAt,
      startAt,
      dueAt,
      subtasks: [{ title: '完成热身', current: 0, total: 1 }],
      attributeReward: { type: 'strength', value: 16 },
    },
    {
      seedKey: `challenge_${dayKey}_5`,
      title: testPrefix('专注阅读'),
      detail: '阅读 30 页, 写下 3 个收获',
      icon: '📚',
      creatorId: SYSTEM_USER_ID,
      assigneeId: null,
      status: 'pending',
      createdAt,
      startAt,
      dueAt,
      subtasks: [{ title: '完成阅读', current: 0, total: 1 }],
      attributeReward: { type: 'wisdom', value: 14 },
    },
    {
      seedKey: `challenge_${dayKey}_6`,
      title: testPrefix('灵敏训练'),
      detail: '跳绳 600 次, 分 3 组完成',
      icon: '🐾',
      creatorId: SYSTEM_USER_ID,
      assigneeId: null,
      status: 'pending',
      createdAt,
      startAt,
      dueAt,
      subtasks: [{ title: '完成训练', current: 0, total: 1 }],
      attributeReward: { type: 'agility', value: 20 },
    },
    {
      seedKey: `challenge_${dayKey}_7`,
      title: testPrefix('补水计划'),
      detail: '全天喝水 8 杯, 每杯 250ml',
      icon: '🚰',
      creatorId: SYSTEM_USER_ID,
      assigneeId: null,
      status: 'pending',
      createdAt,
      startAt,
      dueAt,
      subtasks: [{ title: '记录补水', current: 0, total: 8 }],
      attributeReward: { type: 'strength', value: 10 },
    },
    {
      seedKey: `challenge_${dayKey}_8`,
      title: testPrefix('呼吸训练'),
      detail: '深呼吸 5min, 记录一次感受',
      icon: '🫁',
      creatorId: SYSTEM_USER_ID,
      assigneeId: null,
      status: 'pending',
      createdAt,
      startAt,
      dueAt,
      subtasks: [{ title: '完成训练', current: 0, total: 1 }],
      attributeReward: { type: 'agility', value: 15 },
    },
  ]
}

async function ensureDailyChallengeTasks() {
  const day = new Date()
  const seeds = buildDailyChallengeSeeds(day)
  const ops = seeds.map((seed) => ({
    updateOne: {
      filter: { seedKey: seed.seedKey },
      update: { $set: seed },
      upsert: true,
    },
  }))

  const res = await Task.bulkWrite(ops, { ordered: false })
  const inserted = res.upsertedCount || 0
  return { inserted }
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
      detail: '整理今日笔记, 归档链接, 提取 3 个要点',
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
      icon: '✅',
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
  const seeds = buildDevScenarioSeeds()
  const ops = seeds.map((seed) => ({
    updateOne: {
      filter: { seedKey: seed.seedKey },
      update: { $set: seed },
      upsert: true,
    },
  }))

  const res = await Task.bulkWrite(ops, { ordered: false })
  const inserted = res.upsertedCount || 0
  return { inserted }
}

module.exports = {
  ensureDailyChallengeTasks,
  ensureDevScenarioTasks,
}
