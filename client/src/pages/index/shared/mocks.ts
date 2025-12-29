export type Attr = '智慧' | '力量' | '敏捷'

export type Difficulty = '简单' | '中等' | '困难'

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'review_pending'
  | 'pending_confirmation'
  | 'completed'
  | 'closed'
  | 'refactored'

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
  startAt?: string
  closedAt?: string | null
  originalDueAt?: string | null
  originalStartAt?: string | null
  originalStatus?: TaskStatus | null
  status: TaskStatus
  creatorId: string
  assigneeId?: string | null
  previousTaskId?: string | null
}

export type RoadTask = TaskBase & {
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

export type CollabTask = TaskBase & {
  progress?: { current: number; total: number }
  subtasks?: Subtask[]
  remain?: string
  dueLabel?: string
  dueAt?: string
  dueDays?: number
  difficulty?: Difficulty
}

export type ArchivedTask = TaskBase & {
  finishedAgo: string
  deleteAt?: string
  deleteRemain?: string
}

export const role = { name: '我的小猫', stars: 5, '智慧': 75, '力量': 60, '敏捷': 85 }

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
export const defaultCreatorId = 'sys:system'
export const defaultAssigneeId = 'dev:self'

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
  const dateLabel = diffDays === 0 ? '今日' : diffDays === 1 ? '明日' : `${due.getMonth() + 1}月${due.getDate()}日`
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

// Mission seeds
type MissionSeed = Omit<
  MissionTask,
  'progress' | 'remain' | 'dueLabel' | 'dueDays' | 'createdAt' | 'status' | 'creatorId' | 'assigneeId'
>

const missionTaskSeedData: MissionSeed[] = [
  {
    id: 'm1',
    title: '子夜休息',
    detail: '连续 5 天 23:30 前就寝，睡前放松并记录体感',
    attr: '智慧',
    points: 20,
    icon: '🛌',
    dueAt: buildDueAt(0, 23, 30),
    subtasks: [
      { id: 'm1-s1', title: '第1晚按时就寝', current: 1, total: 1 },
      { id: 'm1-s2', title: '第2晚放松记录', current: 1, total: 1 },
      { id: 'm1-s3', title: '第3晚继续执行', current: 0, total: 1 },
    ],
  },
  {
    id: 'm2',
    title: '力量训练',
    detail: '三日内完成深蹲/卧推/硬拉各一组，记录重量',
    attr: '力量',
    points: 26,
    icon: '🏋',
    dueAt: buildDueAt(3, 21, 0),
    subtasks: [
      { id: 'm2-s1', title: '深蹲完成', current: 1, total: 1 },
      { id: 'm2-s2', title: '卧推完成', current: 0, total: 1 },
      { id: 'm2-s3', title: '硬拉完成', current: 0, total: 1 },
    ],
  },
  {
    id: 'm3',
    title: '轻灵巡城',
    detail: '跑步或步行巡城 3 次，每次不低于 2 公里',
    attr: '敏捷',
    points: 18,
    icon: '🚴',
    dueAt: buildDueAt(1, 18, 30),
    subtasks: [
      { id: 'm3-s1', title: '巡城 1 次', current: 0, total: 1 },
      { id: 'm3-s2', title: '巡城 2 次', current: 0, total: 1 },
      { id: 'm3-s3', title: '巡城 3 次', current: 0, total: 1 },
    ],
  },
  {
    id: 'm4',
    title: '晨间热身',
    detail: '早上 09:00 前完成 20 分钟拉伸与深呼吸',
    attr: '敏捷',
    points: 12,
    icon: '🌅',
    dueAt: buildDueAt(0, 9, 0),
    subtasks: [
      { id: 'm4-s1', title: '全身拉伸', current: 0, total: 1 },
      { id: 'm4-s2', title: '深呼吸 10 组', current: 0, total: 1 },
    ],
  },
  {
    id: 'm5',
    title: '午间阅读',
    detail: '中午阅读非虚构 20 页，记录 3 条要点',
    attr: '智慧',
    points: 10,
    icon: '📚',
    dueAt: buildDueAt(0, 12, 30),
    subtasks: [
      { id: 'm5-s1', title: '阅读 20 页', current: 0, total: 1 },
      { id: 'm5-s2', title: '记录要点', current: 0, total: 1 },
    ],
  },
  {
    id: 'm6',
    title: '夜跑放松',
    detail: '夜间轻松跑 3 公里，结束做 5 分钟拉伸',
    attr: '敏捷',
    points: 14,
    icon: '🌙',
    dueAt: buildDueAt(0, 21, 30),
    subtasks: [
      { id: 'm6-s1', title: '跑步 3 公里', current: 0, total: 1 },
      { id: 'm6-s2', title: '拉伸 5 分钟', current: 0, total: 1 },
    ],
  },
  {
    id: 'm11',
    title: '午后补水',
    detail: '下午 18:00 前喝水 1200ml，记录体感',
    attr: '智慧',
    points: 8,
    icon: '💧',
    dueAt: buildDueAt(0, 18, 0),
    subtasks: [
      { id: 'm11-s1', title: '喝水 1200ml', current: 0, total: 1 },
      { id: 'm11-s2', title: '记录体感', current: 0, total: 1 },
    ],
  },
  {
    id: 'm12',
    title: '傍晚散步',
    detail: '傍晚步行 30 分钟，放松呼吸',
    attr: '敏捷',
    points: 9,
    icon: '🚶',
    dueAt: buildDueAt(0, 19, 0),
    subtasks: [
      { id: 'm12-s1', title: '步行 30 分钟', current: 0, total: 1 },
    ],
  },
  {
    id: 'm7',
    title: '力量巩固',
    detail: '明天完成俯卧撑 3 组，每组 15 次',
    attr: '力量',
    points: 18,
    icon: '🛡',
    dueAt: buildDueAt(1, 18, 0),
    subtasks: [
      { id: 'm7-s1', title: '俯卧撑组数', current: 0, total: 3 },
    ],
  },
  {
    id: 'm8',
    title: '写作练习',
    detail: '两天内完成 800 字小结，修改一稿',
    attr: '智慧',
    points: 16,
    icon: '✍',
    dueAt: buildDueAt(2, 22, 0),
    subtasks: [
      { id: 'm8-s1', title: '初稿 800 字', current: 0, total: 1 },
      { id: 'm8-s2', title: '修改一稿', current: 0, total: 1 },
    ],
  },
  {
    id: 'm9',
    title: '核心稳定',
    detail: '三天内完成平板支撑 4 组，每组 60 秒',
    attr: '力量',
    points: 15,
    icon: '🧘',
    dueAt: buildDueAt(3, 20, 0),
    subtasks: [
      { id: 'm9-s1', title: '平板支撑组数', current: 0, total: 4 },
    ],
  },
  {
    id: 'm10',
    title: '补给计划',
    detail: '四天内采购本周食材并列清单',
    attr: '智慧',
    points: 12,
    icon: '🛒',
    dueAt: buildDueAt(4, 19, 0),
    subtasks: [
      { id: 'm10-s1', title: '列购物清单', current: 0, total: 1 },
      { id: 'm10-s2', title: '采购完成', current: 0, total: 1 },
    ],
  },
]

const missionTaskSeeds: (Omit<MissionTask, 'progress' | 'remain' | 'dueLabel' | 'dueDays'>)[] =
  missionTaskSeedData.map((task) => ({
    ...task,
    createdAt: defaultCreatedAt,
    status: 'in_progress',
    creatorId: defaultCreatorId,
    assigneeId: defaultAssigneeId,
  }))

export const missionTasks: MissionTask[] = missionTaskSeeds.map((task) => ({
  ...task,
  progress: summarizeSubtasksProgress(task.subtasks),
  remain: humanizeRemain(task.dueAt),
  dueLabel: formatDueLabel(task.dueAt),
  dueDays: calcDueDays(task.dueAt),
}))

// Today picks: tasks due today; if fewer than 5, fill with nearest upcoming
const missionByDue = [...missionTasks].sort(
  (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
)
const dueToday = missionByDue.filter((t) => t.dueDays === 0)
const upcoming = missionByDue.filter((t) => t.dueDays > 0)
const pickTodayTasks = (dueToday.length >= 5 ? dueToday : [...dueToday, ...upcoming]).slice(0, 5)
export const dueTodayCount = dueToday.length

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
  status: t.status,
  creatorId: t.creatorId,
  assigneeId: t.assigneeId,
  difficulty: t.difficulty,
  progress: t.progress,
  subtasks: t.subtasks,
  dueAt: t.dueAt,
  remain: humanizeRemain(t.dueAt),
}))

// Challenge feed: system tasks pending, start 00:00, due 23:59
type FeedTaskSeed = Omit<
  RoadTask,
  'due' | 'progress' | 'subtasks' | 'remain' | 'createdAt' | 'status' | 'creatorId' | 'assigneeId'
>

const feedTaskSeedData: FeedTaskSeed[] = [
  {
    id: 'r1',
    title: '风行速练',
    detail: '配速 6-7 跑步 4 公里，结束拉伸 10 分钟',
    dueAt: buildDueAt(0, 23, 59),
    attr: '力量',
    type: '力量',
    icon: '⏱',
    points: 20,
    difficulty: '中等',
  },
  {
    id: 'r2',
    title: '静心冥想',
    detail: '专注冥想 45 分钟，记录要点',
    dueAt: buildDueAt(0, 23, 59),
    attr: '智慧',
    type: '智慧',
    icon: '📖',
    points: 18,
    difficulty: '中等',
  },
  {
    id: 'r3',
    title: '晨光整理',
    detail: '整理桌面 15 分钟, 清空回收箱',
    dueAt: buildDueAt(0, 23, 59),
    attr: '智慧',
    type: '智慧',
    icon: '🧹',
    points: 12,
    difficulty: '简单',
  },
  {
    id: 'r4',
    title: '轻跑热身',
    detail: '慢跑 3 公里, 结束拉伸 8 分钟',
    dueAt: buildDueAt(0, 23, 59),
    attr: '力量',
    type: '力量',
    icon: '🏃',
    points: 16,
    difficulty: '简单',
  },
  {
    id: 'r5',
    title: '专注阅读',
    detail: '阅读 30 页, 写下 3 个收获',
    dueAt: buildDueAt(0, 23, 59),
    attr: '智慧',
    type: '智慧',
    icon: '📚',
    points: 14,
    difficulty: '简单',
  },
  {
    id: 'r6',
    title: '灵敏训练',
    detail: '跳绳 600 次, 分 3 组完成',
    dueAt: buildDueAt(0, 23, 59),
    attr: '敏捷',
    type: '敏捷',
    icon: '🐾',
    points: 20,
    difficulty: '中等',
  },
  {
    id: 'r7',
    title: '补水计划',
    detail: '全天喝水 8 杯, 每杯 250ml',
    dueAt: buildDueAt(0, 23, 59),
    attr: '力量',
    type: '力量',
    icon: '🚰',
    points: 10,
    difficulty: '简单',
  },
  {
    id: 'r8',
    title: '呼吸训练',
    detail: '深呼吸 5 分钟, 记录一次感受',
    dueAt: buildDueAt(0, 23, 59),
    attr: '敏捷',
    type: '敏捷',
    icon: '🧘',
    points: 15,
    difficulty: '中等',
  },
]

const feedTaskSeeds: (Omit<RoadTask, 'due' | 'progress' | 'subtasks' | 'remain'>)[] =
  feedTaskSeedData.map((task) => ({
    ...task,
    createdAt: buildDueAt(0, 0, 0),
    status: 'pending',
    creatorId: defaultCreatorId,
    assigneeId: null,
  }))

export const feedTasks: RoadTask[] = feedTaskSeeds.map((task) => ({
  ...task,
  due: formatDueLabel(task.dueAt),
  remain: humanizeRemain(task.dueAt),
}))

export function chipText(t: RoadTask) {
  return `${t.attr}+${t.points}`
}

// Collab track: self-published tasks
const collabTaskSeedData: Array<Omit<CollabTask, 'createdAt' | 'progress' | 'remain' | 'dueLabel' | 'dueDays'>> =
  [
    {
      id: 'c1',
      title: '灶火清理',
      detail: '整理灶台，丢弃过期调味料并拍照记录前后对比',
      status: 'in_progress',
      assigneeId: 'dev:self',
      creatorId: 'dev:self',
      attr: '智慧',
      points: 16,
      icon: '🧂',
      dueAt: buildDueAt(0, 22, 0),
      subtasks: [
        { id: 'c1-s1', title: '清洁台面', current: 0, total: 1 },
        { id: 'c1-s2', title: '检查调味料', current: 0, total: 1 },
      ],
    },
    {
      id: 'c2',
      title: '踏青探路',
      detail: '查找 5km 郊野步道，准备随行补给清单',
      status: 'pending',
      assigneeId: null,
      creatorId: 'dev:self',
      attr: '敏捷',
      points: 22,
      icon: '🥾',
      dueAt: buildDueAt(1, 20, 0),
      subtasks: [
        { id: 'c2-s1', title: '确认路线', current: 0, total: 1 },
        { id: 'c2-s2', title: '准备补给', current: 0, total: 1 },
      ],
    },
    {
      id: 'c3',
      title: '旧衣再造',
      detail: '筛出旧衣，分类为捐赠/改造/回收并记录',
      status: 'completed',
      assigneeId: 'dev:self',
      creatorId: 'dev:self',
      attr: '智慧',
      points: 12,
      icon: '🧥',
      dueAt: buildDueAt(2, 18, 0),
      subtasks: [
        { id: 'c3-s1', title: '完成分类', current: 1, total: 1 },
        { id: 'c3-s2', title: '打包记录', current: 0, total: 1 },
      ],
    },
  ]

export const collabTasks: CollabTask[] = collabTaskSeedData.map((task) => ({
  ...task,
  createdAt: defaultCreatedAt,
  status: task.status || 'pending',
  creatorId: task.creatorId || defaultCreatorId,
  assigneeId: typeof task.assigneeId === 'undefined' ? defaultAssigneeId : task.assigneeId,
  progress: task.subtasks ? summarizeSubtasksProgress(task.subtasks) : undefined,
  remain: task.dueAt ? humanizeRemain(task.dueAt) : undefined,
  dueLabel: task.dueAt ? formatDueLabel(task.dueAt) : undefined,
  dueDays: task.dueAt ? calcDueDays(task.dueAt) : undefined,
}))

// Archived wishes
const archivedTaskSeedData: Array<Omit<ArchivedTask, 'createdAt' | 'status' | 'creatorId' | 'assigneeId'>> = [
  {
    id: 'a1',
    title: '甘露序章',
    detail: '每日饮水 1800ml，记录体感变化',
    finishedAgo: '3 天前',
    attr: '智慧',
    points: 24,
    icon: '💧',
  },
  {
    id: 'a2',
    title: '封梯行走',
    detail: '全天只走楼梯，上下班累计 20 层',
    finishedAgo: '5 天前',
    attr: '力量',
    points: 14,
    icon: '🏔',
  },
]

export const archivedTasks: ArchivedTask[] = archivedTaskSeedData.map((task) => ({
  ...task,
  createdAt: defaultCreatedAt,
  status: 'completed',
  creatorId: defaultCreatorId,
  assigneeId: defaultAssigneeId,
}))

export const attrTone: Record<Attr, 'blue' | 'red' | 'green'> = {
  '智慧': 'blue',
  '力量': 'red',
  '敏捷': 'green',
}

export const attrIcon: Record<Attr, string> = {
  '智慧': '🧠',
  '力量': '💪',
  '敏捷': '⚡',
}

export const statusLabel: Record<TaskStatus, string> = {
  pending: '待接取',
  in_progress: '待完成',
  review_pending: '待检视',
  pending_confirmation: '待确认',
  completed: '已完成',
  closed: '已关闭',
  refactored: '已重构',
}

export const quietLines = [
  '把任务写下来，才是完成的第一步。',
  '今天的行动，是未来的缓冲。',
  '慢一点没关系，关键是稳稳向前。',
  '动作小也好，只要持续就会发光。',
  '每一条记录，都是升级的素材。',
  '保持能量，休息也是任务的一部分。',
]

export const challengeQuietLines = [
  '暂时没有新挑战，先巩固手上的任务吧。',
  '补满能量再出发，留点体力给下一个高光。',
  '调匀呼吸，下一波任务马上就到。',
  '没有挑战也好，今天可以练习基本功。',
  '轻装一下，等合适的任务再接。',
]
