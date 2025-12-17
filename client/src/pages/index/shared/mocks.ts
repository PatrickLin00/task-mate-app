export type Attr = '智慧' | '力量' | '敏捷'

export type Difficulty = '简单' | '中等' | '困难'

export type Subtask = {
  id: string
  title: string
  current: number
  total: number
}

type TaskBase = {
  id: string
  title: string
  detail: string
  attr: Attr
  icon: string
  points: number
  createdAt: string
}

export type RoadTask = TaskBase & {
  // Home card compatibility: type equals attr
  type: Attr
  due: string
  dueAt?: string
  difficulty?: Difficulty
  progress?: { current: number; total: number }
  subtasks?: Subtask[]
  remain?: string
}

export type MissionTask = TaskBase & {
  progress: { current: number; total: number }
  subtasks: Subtask[]
  remain: string
  dueLabel: string
  dueAt: string
  dueDays: number
  difficulty?: Difficulty
}

export type CollabStatus = '进行中' | '待接应' | '已完成'

export type CollabTask = TaskBase & {
  status: CollabStatus
  assignee: string
}

export type ArchivedTask = TaskBase & {
  finishedAgo: string
}

export const role = { name: '我的小猫', stars: 5, 智慧: 75, 力量: 60, 敏捷: 85 }

export const catIdleFrames = [
  '/assets/avatars/series_orange/cat_f2_idle_01.png',
  '/assets/avatars/series_orange/cat_f2_idle_02.png',
  '/assets/avatars/series_orange/cat_f2_idle_03.png',
  '/assets/avatars/series_orange/cat_f2_idle_04.png',
  '/assets/avatars/series_orange/cat_f2_idle_05.png',
  '/assets/avatars/series_orange/cat_f2_idle_06.png',
  '/assets/avatars/series_orange/cat_f2_idle_07.png',
  '/assets/avatars/series_orange/cat_f2_idle_08.png',
  '/assets/avatars/series_orange/cat_f2_idle_09.png',
] as const

export function summarizeSubtasksProgress(subtasks: Subtask[]) {
  const total = subtasks.reduce((sum, s) => sum + Math.max(1, s.total || 1), 0)
  const current = subtasks.reduce(
    (sum, s) => sum + Math.min(Math.max(0, s.current || 0), Math.max(1, s.total || 1)),
    0
  )
  return { current, total }
}

const DAY = 24 * 60 * 60 * 1000
const MINUTE = 60 * 1000

const pad2 = (num: number) => (num < 10 ? `0${num}` : `${num}`)

export const defaultCreatedAt = '2000-01-01T00:00:00'

const toDate = (val: string | Date) => (val instanceof Date ? val : new Date(val))

const buildDueAt = (daysFromToday: number, hour: number, minute: number) => {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  base.setDate(base.getDate() + daysFromToday)
  base.setHours(hour, minute, 0, 0)
  return base.toISOString()
}

const calcDueDays = (dueAt: string | Date) => {
  const due = toDate(dueAt)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  return Math.floor((dueStart.getTime() - start.getTime()) / DAY)
}

export function formatDueLabel(dueAt: string | Date) {
  const due = toDate(dueAt)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueStart.getTime() - start.getTime()) / DAY)
  const dateLabel =
    diffDays === 0 ? '今日' : diffDays === 1 ? '明日' : `${due.getMonth() + 1}月${due.getDate()}日`
  return `${dateLabel} ${pad2(due.getHours())}:${pad2(due.getMinutes())}`
}

export function humanizeRemain(dueAt: string | Date) {
  const due = toDate(dueAt)
  const diff = due.getTime() - Date.now()
  if (Number.isNaN(due.getTime())) return ''
  if (diff <= 0) return '超时'
  if (diff < MINUTE) return '不足一分钟'
  const minutes = diff / MINUTE
  if (minutes < 30) return `${Math.ceil(minutes)} 分钟`
  const hours = minutes / 60
  if (hours < 1) return '不足一小时'
  if (hours < 24) return `不足${Math.ceil(hours)}小时`
  const days = Math.ceil(hours / 24)
  return `${days}天`
}

// Unified mission seeds shared across pages
type MissionSeed = Omit<MissionTask, 'progress' | 'remain' | 'dueLabel' | 'dueDays' | 'createdAt'>
const missionTaskSeedData: MissionSeed[] = [
  {
    id: 'm1',
    title: '子夜息神诀',
    detail: '连修 5 日子夜息神：23:30 前就寝，睡前 30 分钟做放松序列并记下体感',
    attr: '智慧',
    points: 20,
    icon: '🌙',
    dueAt: buildDueAt(0, 23, 30),
    subtasks: [
      { id: 'm1-s1', title: '第一夜：23:30 前就寝', current: 1, total: 2 },
      { id: 'm1-s2', title: '第二夜：放松序列与体感记录', current: 1, total: 1 },
      { id: 'm1-s3', title: '第三夜：继续息神练习', current: 0, total: 1 },
      { id: 'm1-s4', title: '第四夜：体验可持续调息', current: 0, total: 1 },
      { id: 'm1-s5', title: '第五夜：完成总结记录', current: 0, total: 1 },
    ],
  },
  {
    id: 'm2',
    title: '镇岳力场',
    detail: '三日内完成3 次力场淬炼：深蹲 / 卧推 / 硬拉推举各 3 组，记录重量',
    attr: '力量',
    points: 26,
    icon: '🏋️',
    dueAt: buildDueAt(3, 21, 0),
    subtasks: [
      { id: 'm2-s1', title: '第一次：深蹲 3 组', current: 1, total: 1 },
      { id: 'm2-s2', title: '第二次：卧推 3 组', current: 0, total: 1 },
      { id: 'm2-s3', title: '第三次：硬拉推举完成', current: 0, total: 1 },
    ],
  },
  {
    id: 'm3',
    title: '轻灵巡城',
    detail: '以跑行或步行巡城通勤 3 次，每次里程不低于 2 公里，感受风中身法',
    attr: '敏捷',
    points: 18,
    icon: '🚲',
    dueAt: buildDueAt(1, 18, 30),
    subtasks: [
      { id: 'm3-s1', title: '巡城训练 1：步行 2 公里', current: 0, total: 1 },
      { id: 'm3-s2', title: '巡城训练 2：跑步 2.5 公里', current: 0, total: 1 },
      { id: 'm3-s3', title: '巡城训练 3：轻灵压轴', current: 0, total: 1 },
    ],
  },
  {
    id: 'm4',
    title: '晨行轻功·第一式',
    detail: '黎明时分于公园快跑 30 分钟，当作轻功热身，收尾做 3 组拉伸巩固筋骨',
    attr: '力量',
    points: 12,
    icon: '🏃',
    dueAt: buildDueAt(0, 23, 0),
    subtasks: [
      { id: 'm4-s1', title: '晨跑热身 15 分钟', current: 1, total: 1 },
      { id: 'm4-s2', title: '收尾核心练习 3 组', current: 0, total: 1 },
      { id: 'm4-s3', title: '拉伸巩固筋骨 3 组', current: 0, total: 1 },
    ],
  },
  {
    id: 'm5',
    title: '雷影步·序章',
    detail: '跳绳 800 下，分 4 组，每组 200 下稳住呼吸节奏，练就雷影步的轻盈',
    attr: '敏捷',
    points: 14,
    icon: '🦶',
    dueAt: buildDueAt(0, 18, 0),
    subtasks: [
      { id: 'm5-s1', title: '热身跳绳开始 2 组', current: 1, total: 2 },
      { id: 'm5-s2', title: '主角跳绳稳节奏 2 组', current: 0, total: 2 },
    ],
  },
  {
    id: 'm6',
    title: '灶台炼丹·午时局',
    detail: '午时开炉炼一份低油轻食，记下食材与份量，视作今日能量丹方',
    attr: '智慧',
    points: 10,
    icon: '🍗',
    dueAt: buildDueAt(0, 13, 0),
    subtasks: [{ id: 'm6-s1', title: '点火炼制开始', current: 0, total: 1 }],
  },
  {
    id: 'm7',
    title: '居所净化·夜巡',
    detail: '夜巡客厅，物品归位、垃圾分类清空，打理出一方清净道场',
    attr: '智慧',
    points: 8,
    icon: '🧹',
    dueAt: buildDueAt(1, 22, 0),
    subtasks: [{ id: 'm7-s1', title: '客厅大扫除', current: 0, total: 1 }],
  },
  {
    id: 'm8',
    title: '药谷采买令',
    detail: '采购本周食材与补给：蔬菜 5 份、蛋白 3 份、杂粮 2 份，记录花费',
    attr: '智慧',
    points: 12,
    icon: '🧺',
    dueAt: buildDueAt(2, 18, 0),
    subtasks: [{ id: 'm8-s1', title: '备好购货清单', current: 0, total: 1 }],
  },
  {
    id: 'm9',
    title: '定力静坐',
    detail: '每日晚间静坐 12 分钟，记录心率与感受，连修三日',
    attr: '智慧',
    points: 16,
    icon: '🧘',
    dueAt: buildDueAt(2, 21, 30),
    difficulty: '简单',
    subtasks: [
      { id: 'm9-s1', title: '第一次静坐 12 分钟', current: 1, total: 1 },
      { id: 'm9-s2', title: '第二次静坐 12 分钟', current: 0, total: 1 },
      { id: 'm9-s3', title: '第三次静坐 12 分钟', current: 0, total: 1 },
    ],
  },
]

const missionTaskSeeds: (Omit<MissionTask, 'progress' | 'remain' | 'dueLabel' | 'dueDays'>)[] =
  missionTaskSeedData.map((task) => ({
    ...task,
    createdAt: defaultCreatedAt,
  }))

export const missionTasks: MissionTask[] = missionTaskSeeds.map((task) => ({
  ...task,
  progress: summarizeSubtasksProgress(task.subtasks),
  remain: humanizeRemain(task.dueAt),
  dueLabel: formatDueLabel(task.dueAt),
  dueDays: calcDueDays(task.dueAt),
}))
// Today picks: tasks within three days; if more than 5, keep only today
const withinThreeDays = missionTasks.filter((t) => t.dueDays <= 3)
const todayOnly = missionTasks.filter((t) => t.dueDays <= 0)
const pickTodayTasks = withinThreeDays.length > 5 ? todayOnly : withinThreeDays

export const todayTasks: RoadTask[] = pickTodayTasks.map((t) => ({
  id: t.id,
  title: t.title,
  detail: t.detail,
  due: t.dueLabel,
  attr: t.attr,
  type: t.attr,
  icon: t.icon,
  points: t.points,
  createdAt: t.createdAt,
  difficulty: t.difficulty,
  progress: t.progress,
  subtasks: t.subtasks,
  dueAt: t.dueAt,
  remain: humanizeRemain(t.dueAt),
}))

// Challenge feed: recommended new tasks
type FeedTaskSeed = Omit<RoadTask, 'due' | 'progress' | 'subtasks' | 'remain' | 'createdAt'>
const feedTaskSeedData: FeedTaskSeed[] = [
  {
    id: 'r1',
    title: '风行诀·心率篇',
    detail: '以 6’30 配速奔行 4 公里，跑毕拉伸 10 分钟，调息如练风行诀',
    dueAt: buildDueAt(0, 21, 30),
    attr: '力量',
    type: '力量',
    icon: '⌱️',
    points: 20,
    difficulty: '中等',
  },
  {
    id: 'r2',
    title: '静心观想·番茄阵',
    detail: '布下番茄阵：3 轮 × 45 分钟深度专注，阵后写要点复盘心得',
    dueAt: buildDueAt(0, 22, 15),
    attr: '智慧',
    type: '智慧',
    icon: '📚',
    points: 18,
    difficulty: '中等',
  },
  {
    id: 'r3',
    title: '铁马桩·核心篇',
    detail: '平板支撑 4 组 × 60 秒，间歇 40 秒调息，锻出铁马桩般的稳固核心',
    dueAt: buildDueAt(0, 20, 45),
    attr: '力量',
    type: '力量',
    icon: '🧘',
    points: 16,
    difficulty: '简单',
  },
  {
    id: 'r4',
    title: '夜半藏书阁',
    detail: '夜半入阁，阅读非虚构 30 页，落笔 80 字摘记，累积悟道心得',
    dueAt: buildDueAt(1, 23, 0),
    attr: '智慧',
    type: '智慧',
    icon: '📖',
    points: 15,
    difficulty: '简单',
  },
  {
    id: 'r5',
    title: '登云梯·试炼',
    detail: '快步登楼 10 层（上下各 5 层），稳控膝盖，以此当作登云梯试炼',
    dueAt: buildDueAt(1, 19, 0),
    attr: '敏捷',
    type: '敏捷',
    icon: '🌀',
    points: 14,
    difficulty: '中等',
  },
]

const feedTaskSeeds: (Omit<RoadTask, 'due' | 'progress' | 'subtasks' | 'remain'>)[] =
  feedTaskSeedData.map((task) => ({
    ...task,
    createdAt: defaultCreatedAt,
  }))

export const feedTasks: RoadTask[] = feedTaskSeeds.map((task) => ({
  ...task,
  due: formatDueLabel(task.dueAt),
  remain: humanizeRemain(task.dueAt),
}))
export function chipText(t: RoadTask) {
  return `${t.attr}+${t.points}`
}

// Collab track: self-published collab/delegated tasks
const collabTaskSeedData: Omit<CollabTask, 'createdAt'>[] = [
  {
    id: 'c1',
    title: '灶火清明令',
    detail: '整理灶台，淘汰过期调味料、收拾台面，拍照记录前后景象，维持灶火清明',
    status: '进行中',
    assignee: '自己',
    attr: '智慧',
    points: 16,
    icon: '🧂',
  },
  {
    id: 'c2',
    title: '踏青探路帖',
    detail: '查好 5km 郊野步道，约伴同行，写下补给清单，做踏青探路前置',
    status: '待接应',
    assignee: '待定',
    attr: '敏捷',
    points: 22,
    icon: '🥾',
  },
  {
    id: 'c3',
    title: '旧衣再造契',
    detail: '筛出 10 件旧衣，分门别类：捐赠 / 改造 / 回收，完成再造契约',
    status: '已完成',
    assignee: '自己',
    attr: '智慧',
    points: 12,
    icon: '🧥',
  },
]

export const collabTasks: CollabTask[] = collabTaskSeedData.map((task) => ({
  ...task,
  createdAt: defaultCreatedAt,
}))

// Archived wishes: completed tasks
const archivedTaskSeedData: Omit<ArchivedTask, 'createdAt'>[] = [
  {
    id: 'a1',
    title: '甘露序章',
    detail: '每日饮下 1800ml 甘露之水，结算后写下体感变化，做序章留档',
    finishedAgo: '3 天前',
    attr: '智慧',
    points: 24,
    icon: '💧',
  },
  {
    id: 'a2',
    title: '封梯行走令',
    detail: '施行封梯令，全天只走楼梯，上下班累计 20 层，当作身法行走训练',
    finishedAgo: '5 天前',
    attr: '力量',
    points: 14,
    icon: '🏢',
  },
  {
    id: 'a3',
    title: '静夜封印',
    detail: '连续 7 夜于 22:00 后封印短视频，换取清明心境',
    finishedAgo: '1 周前',
    attr: '智慧',
    points: 18,
    icon: '📵',
  },
]

export const archivedTasks: ArchivedTask[] = archivedTaskSeedData.map((task) => ({
  ...task,
  createdAt: defaultCreatedAt,
}))

export const attrTone: Record<Attr, 'blue' | 'red' | 'green'> = {
  智慧: 'blue',
  力量: 'red',
  敏捷: 'green',
}

export const attrIcon: Record<Attr, string> = {
  智慧: '🧠',
  力量: '💪',
  敏捷: '⚡',
}

export const quietLines = [
  '把任务写下来，才是完成的第一步。',
  '今天的行动，是未来的缓冲。',
  '慢一点没关系，关键是稳稳向前。',
  '动作小也好，只要持续就会发光。',
  '每一条记录，都是升级的素材。',
  '保持能量，休息也是任务的一部分。',
  '先处理简单的，再去拿下关键的。',
  '把注意力放在当下的下一步即可。',
  '小小的完成感，也值得庆祝。',
  '有间歇才有爆发，节奏自己掌握。',
]

export const challengeQuietLines = [
  '暂时没有新挑战，先巩固手上的任务吧。',
  '补满能量再出发，留点体力给下一个高光。',
  '调整呼吸，下一波任务马上就到。',
  '没有挑战也好，今天可以练习基本功。',
  '轻装一下，等合适的任务再接。',
  '保持热身状态，机会来了就抓住。',
  '把时间留给重要的事，挑战稍后到。',
  '留点空白页，写下你自己的挑战也行。',
  '静待通知，或主动发起一场小任务。',
  '先把心情理顺，挑战自然会找到你。',
]
