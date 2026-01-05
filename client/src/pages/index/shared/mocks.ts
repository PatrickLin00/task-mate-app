import { taskStrings } from './strings'

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
  isChallenge?: boolean
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
  submittedAt?: string | null
  completedAt?: string | null
  deleteAt?: string | null
  deleteRemain?: string
  difficulty?: Difficulty
}

export type ArchivedTask = TaskBase & {
  finishedAgo: string
  deleteAt?: string
  deleteRemain?: string
  submittedAt?: string | null
  status: TaskStatus
  subtasks?: Subtask[]
}

export const defaultCreatedAt = '2000-01-01T00:00:00'

const avatarBaseUrl = 'https://task-mate-avatars-1393072338.piccd.myqcloud.com'
const avatarFrameNames = [
  'cat_f2_idle_01.png',
  'cat_f2_idle_02.png',
  'cat_f2_idle_03.png',
  'cat_f2_idle_04.png',
  'cat_f2_idle_05.png',
  'cat_f2_idle_06.png',
  'cat_f2_idle_07.png',
  'cat_f2_idle_08.png',
  'cat_f2_idle_09.png',
] as const

export const catIdleFrames = avatarFrameNames.map((name) => `${avatarBaseUrl}/${name}`)

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

const toDate = (val: string | Date) => (val instanceof Date ? val : new Date(val))

export function formatDueLabel(dueAt: string | Date) {
  const due = toDate(dueAt)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueStart.getTime() - start.getTime()) / DAY)
  const labels = taskStrings.time.labels
  const dateLabel =
    diffDays === 0
      ? labels.today
      : diffDays === 1
        ? labels.tomorrow
        : `${due.getMonth() + 1}${taskStrings.time.month}${due.getDate()}${taskStrings.time.day}`
  return `${dateLabel} ${pad2(due.getHours())}:${pad2(due.getMinutes())}`
}

export function humanizeRemain(dueAt: string | Date) {
  const due = toDate(dueAt)
  const diff = due.getTime() - Date.now()
  if (Number.isNaN(due.getTime())) return ''
  const labels = taskStrings.time.labels
  if (diff <= 0) return labels.overdue
  if (diff < MINUTE) return labels.lessThanMinute
  const minutes = diff / MINUTE
  if (minutes < 30) return `${Math.ceil(minutes)}${labels.minute}`
  const hours = minutes / 60
  if (hours < 1) return labels.lessThanHour
  if (hours < 24) return `${labels.lessThanPrefix}${Math.ceil(hours)}${labels.hour}`
  const days = Math.ceil(hours / 24)
  return `${days}${labels.day}`
}

export function chipText(t: RoadTask) {
  return `${t.attr}+${t.points}`
}

export const attrTone: Record<Attr, 'blue' | 'red' | 'green'> = {
  [taskStrings.rewards.wisdom.label]: 'blue',
  [taskStrings.rewards.strength.label]: 'red',
  [taskStrings.rewards.agility.label]: 'green',
}

export const attrIcon: Record<Attr, string> = {
  [taskStrings.rewards.wisdom.label]: taskStrings.rewards.wisdom.icon,
  [taskStrings.rewards.strength.label]: taskStrings.rewards.strength.icon,
  [taskStrings.rewards.agility.label]: taskStrings.rewards.agility.icon,
}
