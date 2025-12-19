import { View, Text, Swiper, SwiperItem, ScrollView, Button, Input, Textarea, Slider, Picker, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import '../tasks.scss'
import {
  missionTasks as missionSeed,
  collabTasks as collabSeed,
  archivedTasks as archivedSeed,
  defaultCreatedAt,
  statusLabel,
  attrTone,
  attrIcon,
  summarizeSubtasksProgress,
  humanizeRemain,
  formatDueLabel,
  type Attr,
  type Subtask,
  type TaskStatus,
  type MissionTask,
  type CollabTask,
  type ArchivedTask,
} from '../shared/mocks'
import {
  acceptReworkTask,
  closeTask,
  createTask,
  fetchArchivedTasks,
  fetchCollabTasks,
  fetchMissionTasks,
  getTask,
  rejectReworkTask,
  restartTask,
  reworkTask,
  type Task,
} from '@/services/api'

type TabKey = 'mission' | 'collab' | 'archive'

type TasksPaneProps = {
  isActive?: boolean
  onSwipeToHome?: () => void
  onSwipeToAchievements?: () => void
  authVersion?: number
}

const tabs: { key: TabKey; label: string; hint: string }[] = [
  { key: 'mission', label: '使命在身', hint: '进行中' },
  { key: 'collab', label: '奇遇轨迹', hint: '自己发布' },
  { key: 'archive', label: '已结星愿', hint: '已完成' },
]

const statusTone: Record<TaskStatus | 'archived', 'blue' | 'gray' | 'green'> = {
  pending: 'gray',
  in_progress: 'blue',
  review_pending: 'blue',
  pending_confirmation: 'blue',
  completed: 'green',
  closed: 'gray',
  refactored: 'gray',
  archived: 'green',
}

const statusIcon: Record<TaskStatus | 'archived', string> = {
  pending: '⏳',
  in_progress: '🚀',
  review_pending: '📑',
  pending_confirmation: '⏳',
  completed: '✅',
  closed: '📦',
  refactored: '♻️',
  archived: '📂',
}

const metaIcon = {
  remain: '⏱',
  due: '🗓',
  start: '📅',
  assignee: '🙌',
} as const

const metaText = {
  remain: '剩余时间:',
  deleteRemain: '删除倒计时:',
  due: '截止:',
  deleteDue: '删除于:',
  start: '起始:',
  closed: '关闭于:',
  assignee: '执行人:',
  creator: '发起人:',
  unassigned: '未指派',
  closeBlocked: '请执行人放弃任务后再关闭',
  restart: '重启任务',
  close: '关闭任务',
  edit: '重构奇遇',
  assign: '指派任务',
} as const

type SubtaskInput = { title: string; total: number }

const DAY = 24 * 60 * 60 * 1000
const pad2 = (num: number) => (num < 10 ? `0${num}` : `${num}`)

const calcPercent = (current: number, total: number) =>
  Math.min(100, Math.round((current / Math.max(1, total || 1)) * 100))

const formatStartDate = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`
}

function AttributeTag({ attr, points }: { attr: Attr; points: number }) {
  const tone = attrTone[attr]
  return (
    <View className={`attr-tag tone-${tone}`}>
      <Text className='tag-icon'>{attrIcon[attr]}</Text>
      <Text className='tag-text'>
        {attr}+{points}
      </Text>
    </View>
  )
}

const historyIcon =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAyNCAyNCcgZmlsbD0nbm9uZSc+PHBhdGggZD0nTTMgMTJhOSA5IDAgMSAwIDMtNi43JyBzdHJva2U9JyM3YzNhZWQnIHN0cm9rZS13aWR0aD0nMS44JyBzdHJva2UtbGluZWNhcD0ncm91bmQnIHN0cm9rZS1saW5lam9pbj0ncm91bmQnLz48cGF0aCBkPSdNMyA1djRoNCcgc3Ryb2tlPScjN2MzYWVkJyBzdHJva2Utd2lkdGg9JzEuOCcgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJyBzdHJva2UtbGluZWpvaW49J3JvdW5kJy8+PHBhdGggZD0nTTEyIDd2NWwzIDInIHN0cm9rZT0nIzdjM2FlZCcgc3Ryb2tlLXdpZHRoPScxLjgnIHN0cm9rZS1saW5lY2FwPSdyb3VuZCcgc3Ryb2tlLWxpbmVqb2luPSdyb3VuZCcvPjwvc3ZnPg=='

function HistoryButton({ onClick }: { onClick?: () => void }) {
  return (
    <View
      className='history-btn'
      onClick={(e) => {
        e.stopPropagation?.()
        onClick?.()
      }}
    >
      <Image className='history-icon' src={historyIcon} mode='aspectFit' />
    </View>
  )
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = calcPercent(current, total)
  return (
    <View className='progress'>
      <View className='progress-head'>
        <Text className='progress-label'>
          进度 {current}/{total}
        </Text>
        <Text className='progress-percent'>{percent}%</Text>
      </View>
      <View className='progress-track'>
        <View className='progress-fill' style={{ width: `${percent}%` }} />
      </View>
    </View>
  )
}

function StatusBadge({ status }: { status: TaskStatus | 'archived' }) {
  const tone = statusTone[status]
  const label = status === 'archived' ? '已归档' : statusLabel[status]
  return (
    <View className={`status-badge tone-${tone}`}>
      <Text className='status-icon'>{statusIcon[status]}</Text>
      <Text className='status-text'>{label}</Text>
    </View>
  )
}

function ActionButton({
  icon,
  label,
  ghost,
  disabled,
  onClick,
}: {
  icon: string
  label: string
  ghost?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <View
      className={`task-action ${ghost ? 'ghost' : ''} ${disabled ? 'disabled' : ''}`}
      data-noexpand
      hoverClass={disabled ? '' : 'pressing'}
      hoverStartTime={0}
      hoverStayTime={120}
      hoverStopPropagation
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        if (disabled) return
        onClick?.()
      }}
    >
      <Text className='action-icon'>{icon}</Text>
      <Text data-noexpand>{label}</Text>
    </View>
  )
}

function MissionCard({
  task,
  expanded,
  editing,
  subtasks,
  progress,
  onChangeSubtask,
  onEdit,
  onSubmit,
  onCancel,
  onToggleExpand,
  onReview,
  onCollect,
  onAccept,
  onReject,
  onHistory,
}: {
  task: MissionTask
  expanded: boolean
  editing: boolean
  subtasks: Subtask[]
  progress: { current: number; total: number }
  onChangeSubtask?: (subId: string, value: number) => void
  onEdit?: () => void
  onSubmit?: () => void
  onCancel?: () => void
  onToggleExpand?: (taskId: string) => void
  onReview?: () => void
  onCollect?: () => void
  onAccept?: () => void
  onReject?: () => void
  onHistory?: (taskId?: string | null) => void
}) {
  const tone = attrTone[task.attr]
  const hasSubtasks = subtasks?.length > 0
  const remainLabel = task.dueAt ? humanizeRemain(task.dueAt) : task.remain
  const dueLabel = task.dueAt ? formatDueLabel(task.dueAt) : task.dueLabel
  const startLabel = formatStartDate(task.startAt || task.createdAt)
  const assigneeLabel = task.assigneeId || metaText.unassigned
  const creatorLabel = task.creatorId || ''

  return (
    <View
      className={
        'task-card tone-' +
        tone +
        (hasSubtasks ? ' has-subtasks' : '') +
        (expanded ? ' expanded' : '') +
        (editing ? ' editing' : '')
      }
    >
      <View className='card-click-area'>
        <View className='card-main'>
          <View className='card-head'>
          <View className='title-wrap'>
            <Text className='task-icon'>{task.icon}</Text>
            <Text className='task-title'>{task.title}</Text>
          </View>
          <View className='attr-wrap'>
            {task.previousTaskId ? (
              <HistoryButton onClick={() => onHistory?.(task.previousTaskId)} />
            ) : null}
            <AttributeTag attr={task.attr} points={task.points} />
          </View>
        </View>
          <Text className='task-desc'>{task.detail}</Text>
          <ProgressBar current={progress.current} total={progress.total} />
          <View className='card-meta'>
            <View className='meta-item'>
              <Text>{metaIcon.remain}</Text>
              <Text>{metaText.remain}</Text>
              <Text>{remainLabel}</Text>
            </View>
            <View className='meta-item'>
              <Text>{metaIcon.due}</Text>
              <Text>{metaText.due}</Text>
              <Text>{dueLabel}</Text>
            </View>
            <View className='meta-item meta-start'>
              <Text>{metaIcon.start}</Text>
              <Text>{metaText.start}</Text>
              <Text>{startLabel}</Text>
            </View>
            <View className='meta-item meta-start'>
              <Text>{metaIcon.assignee}</Text>
              <Text>{metaText.assignee}</Text>
              <Text>{assigneeLabel}</Text>
              <Text>{metaText.creator}</Text>
              <Text>{creatorLabel}</Text>
            </View>
          </View>
          {hasSubtasks && (
            <>
              <View
                className={'subtask-toggle ' + (expanded ? 'expanded' : '')}
                hoverClass='toggle-pressing'
                onClick={(e) => {
                  e.stopPropagation?.()
                  if (!hasSubtasks || editing) return
                  onToggleExpand?.(task.id)
                }}
              >
                <View className='toggle-arrow'>
                  <Text className={'toggle-icon ' + (!expanded ? 'is-on' : '')}>⭐</Text>
                  <Text className={'toggle-icon ' + (expanded && !editing ? 'is-on' : '')}>✨</Text>
                  <Text className={'toggle-icon ' + (expanded && editing ? 'is-on' : '')}>🌟</Text>
                </View>
                <Text className='toggle-text'>
                  {expanded ? (editing ? '编辑子任务' : '收起子任务') : '展开子任务'}
                </Text>
              </View>
              <View className={'subtask-group ' + (expanded ? 'open' : '')}>
                <View
                  className='subtask-group-inner'
                  onTouchMove={(e) => e.stopPropagation()}
                >
                  {subtasks.map((s) => {
                    const percent = calcPercent(s.current, s.total)
                    return (
                      <View className='subtask-item' key={s.id}>
                        <View className='subtask-row'>
                          <Text className='subtask-title'>{s.title}</Text>
                          <Text className='subtask-count'>
                            {s.current}/{s.total}
                          </Text>
                        </View>
                        {editing ? (
                          <View
                            className='subtask-slider-wrap'
                            onTouchStart={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                            onTouchEnd={(e) => e.stopPropagation()}
                          >
                            <Slider
                              className='subtask-slider'
                              min={0}
                              max={s.total}
                              step={1}
                              value={s.current}
                              activeColor='#7c3aed'
                              backgroundColor='#e5e7eb'
                              onChange={(e) => onChangeSubtask?.(s.id, Number(e.detail.value))}
                            />
                          </View>
                        ) : (
                          <View className='subtask-track'>
                            <View className='subtask-fill' style={{ width: percent + '%' }} />
                          </View>
                        )}
                      </View>
                    )
                  })}
                </View>
              </View>
            </>
          )}
        </View>
      </View>
      <View
        className='action-row'
        data-noexpand
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {editing ? (
          <>
            <ActionButton icon='✅' label='提交变更' onClick={onSubmit} />
            <ActionButton icon='📝' label='提交检视' onClick={onReview} />
            <ActionButton icon='✖' label='取消变更' ghost onClick={onCancel} />
          </>
        ) : task.status === 'pending_confirmation' ? (
          <>
            <ActionButton icon='✅' label='接受奇遇' onClick={onAccept} />
            <ActionButton icon='✖' label='拒绝奇遇' ghost onClick={onReject} />
          </>
        ) : (
          <>
            <ActionButton icon='🔁' label='更新进度' onClick={onEdit} />
            <ActionButton icon='📝' label='提交检视' onClick={onReview} />
            <ActionButton icon='📥' label='放弃任务' ghost onClick={onCollect} />
          </>
        )}
      </View>
    </View>
  )
}

function CollabCard({
  task,
  expanded,
  onToggleExpand,
  onEdit,
  onAssign,
  onClose,
  onRestart,
  onHistory,
}: {
  task: CollabTask
  expanded: boolean
  onToggleExpand?: (taskId: string) => void
  onEdit?: () => void
  onAssign?: () => void
  onClose?: () => void
  onRestart?: () => void
  onHistory?: (taskId?: string | null) => void
}) {
  const tone = attrTone[task.attr]
  const hasSubtasks = !!task.subtasks && task.subtasks.length > 0
  const isClosed = task.status === 'closed'
  const progress = task.progress || summarizeSubtasksProgress(task.subtasks || [])
  const remainLabel = task.dueAt ? humanizeRemain(task.dueAt) : task.remain || ''
  const dueLabel = task.dueAt ? formatDueLabel(task.dueAt) : task.dueLabel || ''
  const startIso = isClosed ? task.closedAt || task.startAt || task.createdAt : task.startAt || task.createdAt
  const startLabel = formatStartDate(startIso)
  const assigneeLabel = task.assigneeId || metaText.unassigned
  const creatorLabel = task.creatorId || ''

  return (
    <View className={`task-card tone-${tone} ${hasSubtasks && expanded ? 'expanded' : ''}`}>
      <View className='card-head'>
        <View className='title-stack'>
          <StatusBadge status={task.status as TaskStatus} />
          <View className='title-wrap'>
            <Text className='task-icon'>{task.icon}</Text>
            <Text className='task-title'>{task.title}</Text>
          </View>
        </View>
        <View className='attr-wrap'>
          {task.previousTaskId ? (
            <HistoryButton onClick={() => onHistory?.(task.previousTaskId)} />
          ) : null}
          <AttributeTag attr={task.attr} points={task.points} />
        </View>
      </View>
      <Text className='task-desc'>{task.detail}</Text>
      <ProgressBar current={progress.current} total={progress.total} />
      <View className='card-meta'>
        <View className='meta-item'>
          <Text>{metaIcon.remain}</Text>
          <Text>{isClosed ? metaText.deleteRemain : metaText.remain}</Text>
          <Text>{remainLabel}</Text>
        </View>
        <View className='meta-item'>
          <Text>{metaIcon.due}</Text>
          <Text>{isClosed ? metaText.deleteDue : metaText.due}</Text>
          <Text>{dueLabel}</Text>
        </View>
        <View className='meta-item meta-start'>
          <Text>{metaIcon.start}</Text>
          <Text>{isClosed ? metaText.closed : metaText.start}</Text>
          <Text>{startLabel}</Text>
        </View>
        <View className='meta-item'>
          <Text>{metaIcon.assignee}</Text>
          <Text>{metaText.assignee}</Text>
          <Text>{assigneeLabel}</Text>
          <Text>{metaText.creator}</Text>
          <Text>{creatorLabel}</Text>
        </View>
      </View>
      {hasSubtasks && (
        <>
          <View
            className={`subtask-toggle ${expanded ? 'expanded' : ''}`}
            hoverClass='toggle-pressing'
            onClick={(e) => {
              e.stopPropagation?.()
              if (!hasSubtasks) return
              onToggleExpand?.(task.id)
            }}
          >
            <View className='toggle-arrow'>
              <Text className={`toggle-icon ${!expanded ? 'is-on' : ''}`}>▶</Text>
              <Text className={`toggle-icon ${expanded ? 'is-on' : ''}`}>✓</Text>
            </View>
            <Text className='toggle-text'>{expanded ? '收起子任务' : '展开子任务'}</Text>
          </View>
          <View className={`subtask-group ${expanded ? 'open' : ''}`}>
            <View className='subtask-group-inner' onTouchMove={(e) => e.stopPropagation()}>
              {task.subtasks?.map((s) => {
                const percent = calcPercent(s.current, s.total)
                return (
                  <View className='subtask-item' key={s.id}>
                    <View className='subtask-row'>
                      <Text className='subtask-title'>{s.title}</Text>
                      <Text className='subtask-count'>
                        {s.current}/{s.total}
                      </Text>
                    </View>
                    <View className='subtask-track'>
                      <View className='subtask-fill' style={{ width: percent + '%' }} />
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        </>
      )}
      <View
        className='action-row'
        data-noexpand
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <ActionButton icon='✏' label={metaText.edit} disabled={isClosed} onClick={onEdit} />
        <ActionButton icon='🧭' label={metaText.assign} disabled={isClosed} onClick={onAssign} />
        {isClosed ? (
          <ActionButton icon='🚀' label={metaText.restart} onClick={onRestart} />
        ) : (
          <ActionButton
            icon='📦'
            label={metaText.close}
            ghost
            onClick={() => {
              if (task.assigneeId) {
                Taro.showToast({ title: metaText.closeBlocked, icon: 'none' })
                return
              }
              onClose?.()
            }}
          />
        )}
      </View>
    </View>
  )
}

function ArchivedCard({ task }: { task: ArchivedTask }) {
  const tone = attrTone[task.attr]
  return (
    <View className={`task-card tone-${tone}`}>
      <View className='card-head'>
        <View className='title-wrap'>
          <Text className='task-icon'>{task.icon}</Text>
          <Text className='task-title'>{task.title}</Text>
        </View>
        <StatusBadge status='archived' />
      </View>
      <Text className='task-desc'>{task.detail}</Text>
      <View className='card-meta'>
        <Text className='meta-item'>✅ 完成于：{task.finishedAgo}</Text>
      </View>
      <View className='archive-foot'>
        <AttributeTag attr={task.attr} points={task.points} />
      </View>
    </View>
  )
}

function HistoryCard({ task }: { task: CollabTask }) {
  const tone = attrTone[task.attr]
  const hasSubtasks = !!task.subtasks && task.subtasks.length > 0
  const progress = task.progress || summarizeSubtasksProgress(task.subtasks || [])
  const remainLabel = task.dueAt ? humanizeRemain(task.dueAt) : task.remain || ''
  const dueLabel = task.dueAt ? formatDueLabel(task.dueAt) : task.dueLabel || ''
  const startIso = task.startAt || task.createdAt
  const startLabel = formatStartDate(startIso)
  const assigneeLabel = task.assigneeId || metaText.unassigned
  const creatorLabel = task.creatorId || ''

  return (
    <View className={`task-card tone-${tone}`}>
      <View className='card-head'>
        <View className='title-stack'>
          <StatusBadge status={task.status as TaskStatus} />
          <View className='title-wrap'>
            <Text className='task-icon'>{task.icon}</Text>
            <Text className='task-title'>{task.title}</Text>
          </View>
        </View>
        <AttributeTag attr={task.attr} points={task.points} />
      </View>
      <Text className='task-desc'>{task.detail}</Text>
      <ProgressBar current={progress.current} total={progress.total} />
      <View className='card-meta'>
        <View className='meta-item'>
          <Text>{metaIcon.remain}</Text>
          <Text>{metaText.remain}</Text>
          <Text>{remainLabel}</Text>
        </View>
        <View className='meta-item'>
          <Text>{metaIcon.due}</Text>
          <Text>{metaText.due}</Text>
          <Text>{dueLabel}</Text>
        </View>
        <View className='meta-item meta-start'>
          <Text>{metaIcon.start}</Text>
          <Text>{metaText.start}</Text>
          <Text>{startLabel}</Text>
        </View>
        <View className='meta-item'>
          <Text>{metaIcon.assignee}</Text>
          <Text>{metaText.assignee}</Text>
          <Text>{assigneeLabel}</Text>
          <Text>{metaText.creator}</Text>
          <Text>{creatorLabel}</Text>
        </View>
      </View>
      {hasSubtasks && (
        <View className='subtask-group open'>
          <View className='subtask-group-inner' onTouchMove={(e) => e.stopPropagation()}>
            {task.subtasks?.map((s) => {
              const percent = calcPercent(s.current, s.total)
              return (
                <View className='subtask-item' key={s.id}>
                  <View className='subtask-row'>
                    <Text className='subtask-title'>{s.title}</Text>
                    <Text className='subtask-count'>
                      {s.current}/{s.total}
                    </Text>
                  </View>
                  <View className='subtask-track'>
                    <View className='subtask-fill' style={{ width: percent + '%' }} />
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}

export default function TasksPane({
  isActive = true,
  onSwipeToHome,
  onSwipeToAchievements,
  authVersion = 0,
}: TasksPaneProps) {
  const today = useMemo(() => new Date(), [])
  const [activeTab, setActiveTab] = useState<TabKey>('mission')
  const [missionTasks, setMissionTasks] = useState<MissionTask[]>(missionSeed)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [draftSubtasks, setDraftSubtasks] = useState<Record<string, Subtask[]>>({})
  const [collabTasks, setCollabTasks] = useState<CollabTask[]>(collabSeed)
  const [expandedCollabId, setExpandedCollabId] = useState<string | null>(null)
  const [archivedTasks, setArchivedTasks] = useState<ArchivedTask[]>(archivedSeed)
  const [loadingRemote, setLoadingRemote] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [reworkTaskId, setReworkTaskId] = useState<string | null>(null)
  const [historyTask, setHistoryTask] = useState<CollabTask | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [confirmReworkOpen, setConfirmReworkOpen] = useState(false)
  const [confirmPayload, setConfirmPayload] = useState<{
    taskId: string
    payload: {
      title: string
      detail?: string
      dueAt: string
      subtasks: { title: string; total: number; current?: number }[]
      attributeReward: { type: 'wisdom' | 'strength' | 'agility'; value: number }
    }
  } | null>(null)
  const [creating, setCreating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [oneLine, setOneLine] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [descInput, setDescInput] = useState('')
  const [attrReward, setAttrReward] = useState<'wisdom' | 'strength' | 'agility' | ''>('')
  const [attrValue, setAttrValue] = useState('')
  const [dueYear, setDueYear] = useState(today.getFullYear())
  const [dueMonth, setDueMonth] = useState(today.getMonth() + 1)
  const [dueDay, setDueDay] = useState(today.getDate())
  const [dueHour, setDueHour] = useState(23)
  const [dueMinute, setDueMinute] = useState(59)
  const [subtasks, setSubtasks] = useState<SubtaskInput[]>([
    { title: '', total: 1 },
    { title: '', total: 1 },
  ])
  const baseYear = today.getFullYear()
  const yearOptions = useMemo(() => [baseYear, baseYear + 1], [baseYear])
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])
  const dayOptions = useMemo(
    () => Array.from({ length: new Date(dueYear, dueMonth, 0).getDate() }, (_, i) => i + 1),
    [dueYear, dueMonth]
  )
  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])
  const minuteOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => i), [])
  const dueDisplay = `${dueYear}年${pad2(dueMonth)}月${pad2(dueDay)}日 ${pad2(dueHour)}:${pad2(dueMinute)}`
  const historyVisible = historyLoading || !!historyTask

  useEffect(() => {
    const maxDay = new Date(dueYear, dueMonth, 0).getDate()
    if (dueDay > maxDay) setDueDay(maxDay)
  }, [dueDay, dueMonth, dueYear])

  const current = tabs.findIndex((t) => t.key === activeTab)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchStartTab = useRef<TabKey>('mission')
  const didScrollVert = useRef(false)


  const handleTouchStart = (e: any) => {
    const t = e?.touches?.[0]
    if (!t) return
    touchStartX.current = t.clientX
    touchStartY.current = t.clientY
    touchStartTab.current = activeTab
    didScrollVert.current = false
  }

  const handleTouchEnd = (e: any) => {
    const t = e?.changedTouches?.[0]
    if (touchStartX.current === null || touchStartY.current === null || !t) return

    const startX = touchStartX.current
    const dx = t.clientX - startX
    const dy = t.clientY - touchStartY.current

    touchStartX.current = null
    touchStartY.current = null

    if (didScrollVert.current) return

    const THRESHOLD_X = 150
    if (Math.abs(dx) < THRESHOLD_X) return

    // Swipe right from mission tab to home.
    if (touchStartTab.current === 'mission' && dx > 0) {
      if (editingTaskId) handleCancelEditing()
      onSwipeToHome?.()
      return
    }

    // Swipe left from archive tab to achievements.
    if (touchStartTab.current === 'archive' && dx < 0) {
      onSwipeToAchievements?.()
    }
  }

  const selectedDueAt = () =>
    new Date(dueYear, dueMonth - 1, dueDay, dueHour, dueMinute, 0, 0).toISOString()

  const computeDueMeta = (iso: string) => {
    const due = new Date(iso)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate())
    const dueDays = Math.floor((dueStart.getTime() - todayStart.getTime()) / DAY)
    return {
      dueAt: iso,
      remain: humanizeRemain(iso),
      dueLabel: formatDueLabel(iso),
      dueDays,
    }
  }

  const applyTaskLists = (mission: Task[], collab: Task[], archived: Task[]) => {
    setMissionTasks(
      mission
        .map((t) => mapApiTaskToMission(t))
        .filter((t) => t.status !== 'refactored')
    )
    setCollabTasks(
      collab
        .map((t) => mapApiTaskToCollab(t))
        .filter((t) => t.status !== 'refactored')
    )
    setArchivedTasks(
      archived
        .map((t) => mapApiTaskToArchived(t))
        .filter((t) => t.status !== 'refactored')
    )
  }

  const refreshTasks = async (shouldCancel?: () => boolean) => {
    if (loadingRemote) return
    setLoadingRemote(true)
    try {
      const [mission, collab, archived] = await Promise.all([
        fetchMissionTasks(),
        fetchCollabTasks(),
        fetchArchivedTasks(),
      ])
      if (shouldCancel?.()) return
      applyTaskLists(mission, collab, archived)
    } catch (err: any) {
      console.error('load tasks error', err)
    } finally {
      if (!shouldCancel?.()) setLoadingRemote(false)
    }
  }

  useEffect(() => {
    if (!isActive) {
      setExpandedTaskId(null)
      setEditingTaskId(null)
      setDraftSubtasks({})
      setExpandedCollabId(null)
      setShowCreate(false)
    }
  }, [authVersion, isActive])

  useEffect(() => {
    if (!isActive) return
    let cancelled = false
    const cancelCheck = () => cancelled
    void refreshTasks(cancelCheck)
    return () => {
      cancelled = true
    }
  }, [isActive])

  const handleToggleCard = (taskId: string, hasSubtasks: boolean) => {
    if (!hasSubtasks) return

    // Cancel editing before toggling expansion.
    if (editingTaskId) {
      handleCancelEditing()
      if (editingTaskId === taskId) {
        setExpandedTaskId(null)
        return
      }
    }

    setExpandedTaskId((prev) => (prev === taskId ? null : taskId))
  }

  const handleToggleCollabCard = (taskId: string, hasSubtasks: boolean) => {
    if (!hasSubtasks) return
    setExpandedCollabId((prev) => (prev === taskId ? null : taskId))
  }

  const showPlaceholder = (title: string) => {
    Taro.showToast({ title, icon: 'none' })
  }

  const updateCollabTaskInState = (taskId: string, updated: Task) => {
    const mapped = mapApiTaskToCollab(updated)
    setCollabTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...mapped } : t)))
  }

  const handleCloseCollabTask = async (taskId: string) => {
    try {
      const updated = await closeTask(taskId)
      updateCollabTaskInState(taskId, updated)
      Taro.showToast({ title: '已关闭', icon: 'success' })
    } catch (err: any) {
      console.error('close task error', err)
      Taro.showToast({ title: err?.message || '关闭失败', icon: 'none' })
    }
  }

  const handleRestartCollabTask = async (taskId: string) => {
    try {
      const updated = await restartTask(taskId)
      updateCollabTaskInState(taskId, updated)
      Taro.showToast({ title: '已重启', icon: 'success' })
    } catch (err: any) {
      console.error('restart task error', err)
      Taro.showToast({ title: err?.message || '重启失败', icon: 'none' })
    }
  }

  const startEditing = (task: MissionTask) => {
    if (!task.subtasks?.length) return
    setExpandedTaskId(task.id)
    setEditingTaskId(task.id)
    setDraftSubtasks((prev) => ({
      ...prev,
      [task.id]: task.subtasks.map((s) => ({ ...s })),
    }))
  }

  const handleDraftChange = (taskId: string, subId: string, value: number) => {
    setDraftSubtasks((prev) => {
      const next = { ...prev }
      const list = next[taskId]?.map((s) => (s.id === subId ? { ...s, current: value } : s)) || []
      next[taskId] = list
      return next
    })
  }

  const handleCancelEditing = () => {
    if (!editingTaskId) return
    setEditingTaskId(null)
    setDraftSubtasks((prev) => {
      const next = { ...prev }
      delete next[editingTaskId]
      return next
    })
  }

  const handleSubmitEditing = () => {
    if (!editingTaskId) return
    const draft = draftSubtasks[editingTaskId]
    if (!draft) return
    const progress = summarizeSubtasksProgress(draft)
    setMissionTasks((prev) =>
      prev.map((t) =>
        t.id === editingTaskId ? { ...t, subtasks: draft, progress } : t
      )
    )
    setEditingTaskId(null)
    setDraftSubtasks((prev) => {
      const next = { ...prev }
      delete next[editingTaskId]
      return next
    })
  }

  const rewardOptions = useMemo(
    () => [
      { label: '智慧', value: 'wisdom' as const, tone: 'blue', icon: '🧠' },
      { label: '力量', value: 'strength' as const, tone: 'red', icon: '💪' },
      { label: '敏捷', value: 'agility' as const, tone: 'green', icon: '⚡' },
  ],
  []
)

  const handleAddSubtask = () => {
    setSubtasks((prev) => [...prev, { title: '', total: 1 }])
  }

  const handleRemoveSubtask = (index: number) => {
    setSubtasks((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const handleSubtaskChange = (index: number, field: 'title' | 'total', value: string) => {
    setSubtasks((prev) =>
      prev.map((s, i) =>
        i === index
          ? {
              ...s,
              [field]: field === 'total' ? Math.max(1, parseInt(value || '1', 10)) : value,
            }
          : s
      )
    )
  }

  const mapRewardToAttr = (val: 'wisdom' | 'strength' | 'agility') => {
    if (val === 'wisdom') return '智慧'
    if (val === 'strength') return '力量'
    return '敏捷'
  }

  const formatAgo = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const diff = Date.now() - d.getTime()
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return '刚刚'
    if (diff < hour) return `${Math.floor(diff / minute)}分钟前`
    if (diff < day) return `${Math.floor(diff / hour)}小时前`
    return `${Math.floor(diff / day)}天前`
  }

  const mapApiTaskToMission = (task: Task): MissionTask => {
    const attr = mapRewardToAttr(task.attributeReward.type)
    const createdAt = task.createdAt || defaultCreatedAt
    const baseId = task._id || 'task'
    const subtasks = (
      task.subtasks && task.subtasks.length > 0
        ? task.subtasks.map((s, idx) => ({
            id: s._id || baseId + '-sub-' + (idx + 1),
            title: s.title || '子任务 ' + (idx + 1),
            current: s.current ?? 0,
            total: s.total || 1,
          }))
        : [
            {
              id: baseId + '-sub-1',
              title: task.title,
              current: 0,
              total: 1,
            },
          ]
    )
    const progress = task.computedProgress || summarizeSubtasksProgress(subtasks)
    const dueIso = task.dueAt || task.updatedAt || task.createdAt || new Date(Date.now() + DAY).toISOString()
    const dueMeta = computeDueMeta(dueIso)
    const difficulty = task.attributeReward.value >= 20 ? '中等' : '简单'
    return {
      id: task._id || Math.random().toString(36).slice(2),
      title: task.title,
      detail: task.detail || '',
      attr,
      points: task.attributeReward.value,
      createdAt,
      previousTaskId: task.previousTaskId ?? null,
      status: task.status,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId ?? null,
      icon: task.icon || '✨',
      progress: { current: progress.current, total: progress.total || 1 },
      subtasks,
      ...dueMeta,
      difficulty,
    }
  }

  const mapApiTaskToCollab = (task: Task): CollabTask => {
    const attr = mapRewardToAttr(task.attributeReward.type)
    const createdAt = task.createdAt || defaultCreatedAt
    const baseId = task._id || 'task'
    const subtasks =
      task.subtasks && task.subtasks.length > 0
        ? task.subtasks.map((s, idx) => ({
            id: s._id || baseId + '-sub-' + (idx + 1),
            title: s.title || '子任务 ' + (idx + 1),
            current: s.current ?? 0,
            total: s.total || 1,
          }))
        : []

    const progress = task.computedProgress || summarizeSubtasksProgress(subtasks)
    const dueIso = task.dueAt || task.updatedAt || task.createdAt || new Date(Date.now() + DAY).toISOString()
    const dueMeta = computeDueMeta(dueIso)

    return {
      id: task._id || Math.random().toString(36).slice(2),
      title: task.title,
      detail: task.detail || '',
      attr,
      points: task.attributeReward.value,
      createdAt,
      previousTaskId: task.previousTaskId ?? null,
      startAt: task.startAt || undefined,
      closedAt: task.closedAt ?? null,
      originalDueAt: task.originalDueAt ?? null,
      originalStartAt: task.originalStartAt ?? null,
      originalStatus: task.originalStatus ?? null,
      status: task.status,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId ?? null,
      icon: task.icon || '✨',
      progress: { current: progress.current, total: progress.total || 1 },
      subtasks,
      ...dueMeta,
    }
  }

  const mapApiTaskToArchived = (task: Task): ArchivedTask => {
    const attr = mapRewardToAttr(task.attributeReward.type)
    const createdAt = task.createdAt || defaultCreatedAt
    const finishedAt = task.updatedAt || task.createdAt
    return {
      id: task._id || Math.random().toString(36).slice(2),
      title: task.title,
      detail: task.detail || '',
      attr,
      points: task.attributeReward.value,
      createdAt,
      previousTaskId: task.previousTaskId ?? null,
      status: task.status,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId ?? null,
      icon: task.icon || '✨',
      finishedAgo: formatAgo(finishedAt),
    }
  }

  const resetForm = (clearLine = true) => {
    if (clearLine) setOneLine('')
    setTitleInput('')
    setDescInput('')
    setAttrReward('')
    setAttrValue('')
    setDueYear(today.getFullYear())
    setDueMonth(today.getMonth() + 1)
    setDueDay(today.getDate())
    setDueHour(23)
    setDueMinute(59)
    setSubtasks([
      { title: '', total: 1 },
      { title: '', total: 1 },
    ])
    setReworkTaskId(null)
  }

  const mapAttrToReward = (attr: Attr): 'wisdom' | 'strength' | 'agility' => {
    if (attr === '智慧') return 'wisdom'
    if (attr === '力量') return 'strength'
    return 'agility'
  }

  const fillFormFromTask = (task: CollabTask) => {
    setTitleInput(task.title || '')
    setDescInput(task.detail || '')
    setAttrReward(mapAttrToReward(task.attr))
    setAttrValue(String(task.points || ''))
    const due = task.dueAt ? new Date(task.dueAt) : new Date()
    if (!Number.isNaN(due.getTime())) {
      setDueYear(due.getFullYear())
      setDueMonth(due.getMonth() + 1)
      setDueDay(due.getDate())
      setDueHour(due.getHours())
      setDueMinute(due.getMinutes())
    }
    if (task.subtasks && task.subtasks.length > 0) {
      setSubtasks(task.subtasks.map((s) => ({ title: s.title, total: s.total || 1 })))
    }
  }

  const handleStartRework = (task: CollabTask) => {
    resetForm(false)
    setReworkTaskId(task.id)
    fillFormFromTask(task)
    setShowCreate(true)
  }

  const handleAcceptRework = async (taskId: string) => {
    try {
      await acceptReworkTask(taskId)
      Taro.showToast({ title: '已接受', icon: 'success' })
      await refreshTasks()
    } catch (err: any) {
      console.error('accept rework error', err)
      Taro.showToast({ title: err?.message || '接受失败', icon: 'none' })
    }
  }

  const handleRejectRework = async (taskId: string) => {
    try {
      await rejectReworkTask(taskId)
      Taro.showToast({ title: '已拒绝', icon: 'success' })
      await refreshTasks()
    } catch (err: any) {
      console.error('reject rework error', err)
      Taro.showToast({ title: err?.message || '拒绝失败', icon: 'none' })
    }
  }

  const handleOpenHistory = async (taskId?: string | null) => {
    if (!taskId) return
    setHistoryLoading(true)
    try {
      const task = await getTask(taskId)
      setHistoryTask(mapApiTaskToCollab(task))
    } catch (err: any) {
      console.error('load history error', err)
      Taro.showToast({ title: err?.message || '加载失败', icon: 'none' })
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleCloseHistory = () => {
    setHistoryTask(null)
    setHistoryLoading(false)
  }

  const handleConfirmRework = async () => {
    if (!confirmPayload) return
    setCreating(true)
    try {
      const created = await reworkTask(confirmPayload.taskId, {
        ...confirmPayload.payload,
        confirmDeletePrevious: true,
      })
      const actualTask: any = (created as any).task ? (created as any).task : created
      const mapped = mapApiTaskToCollab(actualTask as Task)
      setCollabTasks((prev) => [
        mapped,
        ...prev.filter((t) => t.id !== confirmPayload.taskId && t.status !== 'refactored'),
      ])
      setActiveTab('collab')
      Taro.showToast({ title: '奇遇已重构', icon: 'success' })
      setShowCreate(false)
      resetForm()
      setConfirmReworkOpen(false)
      setConfirmPayload(null)
    } catch (err: any) {
      console.error('confirm rework error', err)
      Taro.showToast({ title: err?.message || '重构失败', icon: 'none' })
    } finally {
      setCreating(false)
    }
  }

  const handleCancelConfirmRework = () => {
    setConfirmReworkOpen(false)
    setConfirmPayload(null)
  }

  const handleSubmitCreate = async () => {
    if (creating) return
    const title = titleInput.trim()
    if (!title) {
      Taro.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    if (!attrReward) {
      Taro.showToast({ title: '请选择属性奖励', icon: 'none' })
      return
    }
    const rewardValNum = Number(attrValue)
    if (!attrValue || Number.isNaN(rewardValNum) || rewardValNum <= 0) {
      Taro.showToast({ title: '请输入正数奖励', icon: 'none' })
      return
    }
    const validSubtasks = subtasks
      .map((s) => ({ ...s, title: s.title.trim(), total: Math.max(1, s.total || 1) }))
      .filter((s) => s.title)

    if (validSubtasks.length === 0) {
      Taro.showToast({ title: '请至少添加一条子任务', icon: 'none' })
      return
    }

    setCreating(true)
    try {
      if (reworkTaskId) {
        let created: any
        try {
          created = await reworkTask(reworkTaskId, {
            title,
            detail: descInput.trim(),
            dueAt: selectedDueAt(),
            subtasks: validSubtasks.map((s) => ({ ...s, current: 0 })),
            attributeReward: { type: attrReward, value: rewardValNum },
          })
        } catch (err: any) {
          const data = err?.data
          if (data?.code === 'REWORK_CONFIRM_REQUIRED') {
            setConfirmPayload({
              taskId: reworkTaskId,
              payload: {
                title,
                detail: descInput.trim(),
                dueAt: selectedDueAt(),
                subtasks: validSubtasks.map((s) => ({ ...s, current: 0 })),
                attributeReward: { type: attrReward, value: rewardValNum },
              },
            })
            setConfirmReworkOpen(true)
            setCreating(false)
            return
          } else {
            throw err
          }
        }
        const actualTask: any = (created as any).task ? (created as any).task : created
        if ((created as any).message === 'no changes') {
          Taro.showToast({ title: '未检测到改动，已取消', icon: 'none' })
        } else {
          const mapped = mapApiTaskToCollab(actualTask as Task)
          setCollabTasks((prev) => [
            mapped,
            ...prev.filter((t) => t.id !== reworkTaskId && t.status !== 'refactored'),
          ])
          setActiveTab('collab')
          Taro.showToast({ title: '奇遇已重构', icon: 'success' })
        }
      } else {
        const created = await createTask({
          title,
          detail: descInput.trim(),
          dueAt: selectedDueAt(),
          subtasks: validSubtasks.map((s) => ({ ...s, current: 0 })),
          attributeReward: { type: attrReward, value: rewardValNum },
        })
        const mapped = mapApiTaskToCollab(created)
        setCollabTasks((prev) => [mapped, ...prev])
        setActiveTab('collab')
        Taro.showToast({ title: '奇遇已发起', icon: 'success' })
      }
      setShowCreate(false)
      resetForm()
    } catch (err: any) {
      console.error('create task error', err)
      Taro.showToast({ title: err?.message || '创建失败', icon: 'none' })
    } finally {
      setCreating(false)
    }
  }

  const handleGenerate = async () => {
    if (generating) return
    const prompt = oneLine.trim()
    if (!prompt) {
      Taro.showToast({ title: '请先写一句奇遇描述', icon: 'none' })
      return
    }
    setGenerating(true)
    try {
      const data = await generateTaskSuggestion(prompt)
      if (data.title) setTitleInput(data.title)
      if (data.description) setDescInput(data.description)
      if (Array.isArray(data.subtasks) && data.subtasks.length > 0) {
        setSubtasks(
          data.subtasks.map((s) => ({
            title: s.title || '',
            total: Math.max(1, s.total || 1),
          }))
        )
      }
      if (data.attributeReward?.type) {
        setAttrReward(data.attributeReward.type)
      }
      if (data.attributeReward?.value) {
        setAttrValue(String(data.attributeReward.value))
      }
      Taro.showToast({ title: '已生成奇遇草稿', icon: 'success' })
    } catch (err: any) {
      console.error('generate task error', err)
      Taro.showToast({ title: err?.message || '生成失败', icon: 'none' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <View className='tasks-pane' onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <View className='task-shell card'>
        <View className='task-tabs'>
          {tabs.map((tab) => (
            <View
              key={tab.key}
              className={`task-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => {
                if (editingTaskId) handleCancelEditing()
                setActiveTab(tab.key)
              }}
            >
              <Text className='tab-label'>{tab.label}</Text>
              <Text className='tab-hint'>{tab.hint}</Text>
            </View>
          ))}
        </View>

        <Swiper
          className='task-swiper'
          current={current}
          onChange={(e) => {
            if (editingTaskId) handleCancelEditing()
            setActiveTab(tabs[e.detail.current].key)
          }}
          duration={220}
        >
          <SwiperItem>
            <ScrollView
              scrollY
              scrollWithAnimation
              enableFlex
              className='task-scroll'
              onScroll={() => {
                didScrollVert.current = true
              }}
            >
              <View className='task-list'>
                {missionTasks
                  .filter((t) => t.status !== 'refactored')
                  .map((task) => {
                    const editing = editingTaskId === task.id
                    const subsDraft = (editing && draftSubtasks[task.id]) || task.subtasks
                    const progress = editing
                      ? summarizeSubtasksProgress(subsDraft || [])
                      : task.progress
                  return (
                    <MissionCard
                      key={task.id}
                      task={task}
                      expanded={expandedTaskId === task.id || editing}
                      editing={editing}
                      subtasks={subsDraft || []}
                      progress={progress}
                      onChangeSubtask={(subId, val) => handleDraftChange(task.id, subId, val)}
                      onSubmit={handleSubmitEditing}
                      onCancel={handleCancelEditing}
                      onEdit={() => startEditing(task)}
                      onToggleExpand={(id) => handleToggleCard(id, !!task.subtasks?.length)}
                      onReview={() => showPlaceholder('提交检视待接入')}
                      onCollect={() => showPlaceholder('放弃任务待接入')}
                      onAccept={() => handleAcceptRework(task.id)}
                      onReject={() => handleRejectRework(task.id)}
                      onHistory={handleOpenHistory}
                    />
                  )
                })}
              </View>
            </ScrollView>
          </SwiperItem>

          <SwiperItem>
            <ScrollView scrollY scrollWithAnimation enableFlex className='task-scroll'>
              <View className='task-list'>
                {collabTasks
                  .filter((t) => t.status !== 'refactored')
                  .map((task) => {
                    const hasSubtasks = !!task.subtasks && task.subtasks.length > 0
                    return (
                      <CollabCard
                        key={task.id}
                        task={task}
                        expanded={expandedCollabId === task.id}
                        onToggleExpand={(id) => handleToggleCollabCard(id, hasSubtasks)}
                        onEdit={() => handleStartRework(task)}
                        onAssign={() => showPlaceholder('指派任务待接入')}
                        onClose={() => void handleCloseCollabTask(task.id)}
                        onRestart={() => void handleRestartCollabTask(task.id)}
                        onHistory={handleOpenHistory}
                      />
                    )
                  })}
                </View>
              </ScrollView>
           </SwiperItem>

          <SwiperItem>
            <ScrollView scrollY scrollWithAnimation enableFlex className='task-scroll'>
              <View className='task-list'>
                {archivedTasks.map((task) => (
                  <ArchivedCard key={task.id} task={task} />
                ))}
              </View>
            </ScrollView>
          </SwiperItem>
        </Swiper>
      </View>

      <Button
        className='fab'
        hoverClass='pressing'
        onClick={() => {
          resetForm()
          setShowCreate(true)
        }}
      >
        发起奇遇
      </Button>

      {showCreate && (
        <View
          className='task-modal-overlay'
          onClick={() => {
            setShowCreate(false)
            resetForm()
          }}
        >
          <View
            className='task-modal card'
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <View className='modal-head'>
              <View>
                <Text className='modal-title'>{reworkTaskId ? '重构奇遇' : '发起一场新的奇遇'}</Text>
                <Text className='modal-sub'>{reworkTaskId ? '奇遇重塑，命途再启' : '写下你想完成的事，其余交给星辰来编织'}</Text>
              </View>
              <Text
                className='modal-close'
                onClick={() => {
                  setShowCreate(false)
                  resetForm()
                }}
              >
                ✕
              </Text>
            </View>

            <View className='modal-body'>
              {!reworkTaskId && (
                <View className='modal-section bubble soft'>
                  <View className='section-head-row'>
                    <Text className='modal-label'>一句话奇遇</Text>
                    <Text className='modal-hint'>先随便描述一下，星旅帮你织成完整奇遇</Text>
                  </View>
                  <View className='one-line-col'>
                    <View className='one-line-row'>
                      <Input
                        className='modal-input'
                        value={oneLine}
                        onInput={(e) => setOneLine(e.detail.value)}
                        placeholder='例如：每天睡前冥想 10 分钟，坚持一周'
                      />
                      <View className='one-line-actions'>
                        <Button className='ai-btn' loading={generating} onClick={handleGenerate}>
                          ✨ 由星旅生成
                        </Button>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              <View className='modal-section bubble soft'>
                <Text className='modal-label'>详细设定</Text>
                <Input
                  className='modal-input'
                  value={titleInput}
                  onInput={(e) => setTitleInput(e.detail.value)}
                  placeholder='给这场奇遇起个名字吧'
                />
                <Textarea
                  className='modal-textarea'
                  value={descInput}
                  onInput={(e) => setDescInput(e.detail.value)}
                  placeholder='可以写下修行方式、故事背景或注意事项……'
                />
                <View className='sub-card'>
                  <View className='modal-row task-step-head'>
                    <View className='task-step-text'>
                      <Text className='modal-label'>任务步骤</Text>
                      <Text className='modal-hint'>请将步骤拆解为可以执行的小步骤</Text>
                    </View>
                    <Button className='modal-add compact' onClick={handleAddSubtask}>
                      + 添加一步
                    </Button>
                  </View>
                  <View className='subtask-list'>
                    {subtasks.map((s, idx) => (
                      <View key={idx} className='subtask-row'>
                        <Input
                          className='subtask-input'
                          value={s.title}
                          onInput={(e) => handleSubtaskChange(idx, 'title', e.detail.value)}
                          placeholder='比如：购买食材 / 完成章节一'
                        />
                        <Input
                          className='subtask-num'
                          type='number'
                          value={String(s.total)}
                          onInput={(e) => handleSubtaskChange(idx, 'total', e.detail.value)}
                          placeholder='目标数'
                        />
                        <Button
                          className='subtask-remove'
                          disabled={subtasks.length <= 1}
                          onClick={() => handleRemoveSubtask(idx)}
                        >
                          🗑
                        </Button>
                      </View>
                    ))}
                  </View>
                </View>
                <View className='due-row'>
                  <Text className='modal-label'>设定日期与时间</Text>
                  <View className='due-pickers'>
                    <Picker
                      mode='selector'
                      range={yearOptions.map(String)}
                      value={Math.max(yearOptions.indexOf(dueYear), 0)}
                      onChange={(e) => setDueYear(yearOptions[Number(e.detail.value)])}
                    >
                      <View className='picker-pill'>{dueYear}年</View>
                    </Picker>
                    <Picker
                      mode='selector'
                      range={monthOptions.map((m) => `${m}月`)}
                      value={Math.max(monthOptions.indexOf(dueMonth), 0)}
                      onChange={(e) => setDueMonth(monthOptions[Number(e.detail.value)])}
                    >
                      <View className='picker-pill'>{pad2(dueMonth)}月</View>
                    </Picker>
                    <Picker
                      mode='selector'
                      range={dayOptions.map((d) => `${d}日`)}
                      value={Math.max(dayOptions.indexOf(dueDay), 0)}
                      onChange={(e) => setDueDay(dayOptions[Number(e.detail.value)])}
                    >
                      <View className='picker-pill'>{pad2(dueDay)}日</View>
                    </Picker>
                    <Picker
                      mode='selector'
                      range={hourOptions.map((h) => `${pad2(h)}时`)}
                      value={Math.max(hourOptions.indexOf(dueHour), 0)}
                      onChange={(e) => setDueHour(hourOptions[Number(e.detail.value)])}
                    >
                      <View className='picker-pill'>{pad2(dueHour)}时</View>
                    </Picker>
                    <Picker
                      mode='selector'
                      range={minuteOptions.map((m) => `${pad2(m)}分`)}
                      value={Math.max(minuteOptions.indexOf(dueMinute), 0)}
                      onChange={(e) => setDueMinute(minuteOptions[Number(e.detail.value)])}
                    >
                      <View className='picker-pill'>{pad2(dueMinute)}分</View>
                    </Picker>
                  </View>
                  <Text className='modal-hint inline'>默认今天 23:59，可下拉调整</Text>
                  <Text className='modal-hint inline'>当前选择：{dueDisplay}</Text>
                </View>
              </View>

              <View className='modal-section bubble soft'>
                <Text className='modal-label'>星辰奖励</Text>
                <Text className='modal-hint'>完成后，你的角色将获得怎样的加成？</Text>
                <View className='reward-row'>
                  {rewardOptions.map((opt) => (
                    <View
                      key={opt.value}
                      className={`reward-pill ${attrReward === opt.value ? 'active' : ''}`}
                      onClick={() => setAttrReward(opt.value)}
                    >
                      <Text className='reward-icon'>{opt.icon}</Text>
                      <Text>{opt.label}</Text>
                    </View>
                  ))}
                </View>
                <Input
                  className='modal-input'
                  type='number'
                  value={attrValue}
                  onInput={(e) => setAttrValue(e.detail.value)}
                  placeholder='完成后获得多少点属性？'
                />
              </View>
            </View>

            <View className='modal-actions'>
              <Button
                className='modal-cancel'
                onClick={() => {
                  setShowCreate(false)
                  resetForm()
                }}
              >
                取消
              </Button>
              <Button className='modal-submit' loading={creating} onClick={handleSubmitCreate}>
                {reworkTaskId ? '发起重构' : '发起奇遇'}
              </Button>
            </View>
          </View>
        </View>
      )}

      {historyVisible && (
        <View className='task-modal-overlay' onClick={handleCloseHistory}>
          <View
            className='task-modal card'
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <View className='modal-head'>
              <View>
                <Text className='modal-title'>上一版奇遇</Text>
                <Text className='modal-sub'>仅供查看，不可编辑</Text>
              </View>
              <Text className='modal-close' onClick={handleCloseHistory}>
                ✕
              </Text>
            </View>
            <View className='modal-body'>
              {historyLoading || !historyTask ? (
                <Text className='modal-hint'>加载中...</Text>
              ) : (
                <HistoryCard task={historyTask} />
              )}
            </View>
          </View>
        </View>
      )}

      {confirmReworkOpen && (
        <View className='task-modal-overlay' onClick={handleCancelConfirmRework}>
          <View
            className='task-modal card confirm-modal'
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <View className='modal-head'>
              <View>
                <Text className='modal-title'>确认重构</Text>
                <Text className='modal-sub'>将删除更早版本的内容</Text>
              </View>
              <Text className='modal-close' onClick={handleCancelConfirmRework}>
                ✕
              </Text>
            </View>
            <View className='modal-body'>
              <Text className='modal-hint'>
                该任务已存在上一版。继续重构会删除更早版本，是否确认？
              </Text>
            </View>
            <View className='modal-actions'>
              <Button className='modal-cancel' onClick={handleCancelConfirmRework}>
                取消
              </Button>
              <Button className='modal-submit' loading={creating} onClick={handleConfirmRework}>
                确认删除
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
