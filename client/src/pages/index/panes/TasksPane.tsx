import { View, Text, Swiper, SwiperItem, ScrollView, Button, Input, Textarea, Slider, Picker, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import '../tasks.scss'
import {
  defaultCreatedAt,
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
import { taskStrings } from '../shared/strings'
import { requestTaskSubscribeAuth } from '@/services/subscribe'
import {
  acceptReworkTask,
  cancelReworkTask,
  closeTask,
  completeTask,
  createTask,
  abandonTask,
  submitReview,
  continueReview,
  deleteTask,
  fetchArchivedTasks,
  fetchCollabTasks,
  fetchMissionTasks,
  generateTaskSuggestion,
  getTask,
  patchProgress,
  rejectReworkTask,
  refreshTaskSchedule,
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
  {
    key: 'mission',
    label: taskStrings.tabs.mission.label,
    hint: taskStrings.tabs.mission.hint,
  },
  {
    key: 'collab',
    label: taskStrings.tabs.collab.label,
    hint: taskStrings.tabs.collab.hint,
  },
  {
    key: 'archive',
    label: taskStrings.tabs.archive.label,
    hint: taskStrings.tabs.archive.hint,
  },
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

const statusIcon: Record<TaskStatus | 'archived', string> = taskStrings.icons.status
const metaIcon = taskStrings.icons.meta
const metaText = taskStrings.metaText

type SubtaskInput = { title: string; total: number }

const DAY = 24 * 60 * 60 * 1000
const POLL_INTERVAL = 30 * 1000
const pad2 = (num: number) => (num < 10 ? `0${num}` : `${num}`)
const taskDebug = TASK_DEBUG
const taskMemReport = TASK_MEM_REPORT

const calcPercent = (current: number, total: number) =>
  Math.min(100, Math.round((current / Math.max(1, total || 1)) * 100))

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const snapSubtaskValue = (value: number, total: number) => clampValue(Math.round(value), 0, total)

const formatStartDate = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`
}

const resolveDisplayName = (name?: string | null, id?: string | null) => {
  const rawId = String(id || '')
  if (!rawId) return ''
  const trimmed = String(name || '').trim()
  const candidate = trimmed || rawId
  if (candidate === rawId) return taskStrings.labels.unnamed
  return candidate
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
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAyNCAyNCcgZmlsbD0nbm9uZSc+PHBhdGggZD0nTTMgMTJhOSA5IDAgMSAwIDMtNi43JyBzdHJva2U9JyM0YzFkOTUnIHN0cm9rZS13aWR0aD0nMi44JyBzdHJva2UtbGluZWNhcD0ncm91bmQnIHN0cm9rZS1saW5lam9pbj0ncm91bmQnLz48cGF0aCBkPSdNMyA1djRoNCcgc3Ryb2tlPScjNGMxZDk1JyBzdHJva2Utd2lkdGg9JzIuOCcgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJyBzdHJva2UtbGluZWpvaW49J3JvdW5kJy8+PHBhdGggZD0nTTEyIDd2NWwzIDInIHN0cm9rZT0nIzRjMWQ5NScgc3Ryb2tlLXdpZHRoPScyLjgnIHN0cm9rZS1saW5lY2FwPSdyb3VuZCcgc3Ryb2tlLWxpbmVqb2luPSdyb3VuZCcvPjwvc3ZnPg=='

const mergeById = <T extends { id: string }>(prev: T[], next: T[]) => {
  const nextMap = new Map(next.map((item) => [item.id, item]))
  const prevIds = new Set(prev.map((item) => item.id))
  const kept = prev.map((item) => nextMap.get(item.id)).filter(Boolean) as T[]
  const appended = next.filter((item) => !prevIds.has(item.id))
  return [...kept, ...appended]
}

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
          {taskStrings.labels.progress} {current}/{total}
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
  const label = status === 'archived' ? taskStrings.status.archived : taskStrings.statusLabels[status]
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
  openType,
  taskId,
  taskTitle,
}: {
  icon: string
  label: string
  ghost?: boolean
  disabled?: boolean
  onClick?: () => void
  openType?: 'share'
  taskId?: string
  taskTitle?: string
}) {
  if (openType === 'share') {
    return (
      <Button
        className={`task-action ${ghost ? 'ghost' : ''} ${disabled ? 'disabled' : ''}`}
        data-noexpand
        openType='share'
        data-taskid={taskId}
        data-tasktitle={taskTitle}
        disabled={disabled}
        hoverClass={disabled ? '' : 'pressing'}
        hoverStartTime={0}
        hoverStayTime={120}
        hoverStopPropagation
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <Text className='action-icon'>{icon}</Text>
        <Text data-noexpand>{label}</Text>
      </Button>
    )
  }
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
  onComplete,
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
  onComplete?: () => void
  onHistory?: (taskId?: string | null) => void
}) {
  const tone = attrTone[task.attr]
  const hasSubtasks = subtasks?.length > 0
  const remainLabel = task.dueAt ? humanizeRemain(task.dueAt) : task.remain
  const dueLabel = task.dueAt ? formatDueLabel(task.dueAt) : task.dueLabel
  const startLabel = formatStartDate(task.startAt || task.createdAt)
  const assigneeLabel = task.assigneeId
    ? resolveDisplayName(task.assigneeName || task.assigneeId, task.assigneeId)
    : metaText.unassigned
  const creatorLabel = task.creatorId
    ? resolveDisplayName(task.creatorName || task.creatorId, task.creatorId)
    : ''
  const isChallengeTask = Boolean(task.seedKey?.startsWith('challenge_'))
  const isSelfAssigned = !!task.assigneeId && task.assigneeId === task.creatorId
  const useComplete = isChallengeTask || isSelfAssigned
  const reviewLabel = useComplete ? taskStrings.actions.completeTask : taskStrings.actions.submitReview
  const reviewIcon = useComplete ? taskStrings.icons.actions.completeTask : taskStrings.icons.actions.submitReview
  const reviewHandler = useComplete ? onComplete : onReview
  const [dragValues, setDragValues] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!editing) {
      setDragValues({})
    }
  }, [editing, task.id])

  const handleDrag = (id: string, value: number) => {
    setDragValues((prev) => ({ ...prev, [id]: value }))
  }

  const handleDragCommit = (id: string, value: number, total: number) => {
    const snapped = snapSubtaskValue(value, total)
    setDragValues((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    onChangeSubtask?.(id, snapped)
  }

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
                  <Text className={'toggle-icon ' + (!expanded ? 'is-on' : '')}>
                    {taskStrings.icons.toggle.expand}
                  </Text>
                  <Text className={'toggle-icon ' + (expanded && !editing ? 'is-on' : '')}>
                    {taskStrings.icons.toggle.collapse}
                  </Text>
                  <Text className={'toggle-icon ' + (expanded && editing ? 'is-on' : '')}>
                    {taskStrings.icons.toggle.edit}
                  </Text>
                </View>
                <Text className='toggle-text'>
                  {expanded
                    ? editing
                      ? taskStrings.subtasks.toggleEdit
                      : taskStrings.subtasks.toggleCollapse
                    : taskStrings.subtasks.toggleExpand}
                </Text>
              </View>
              <View className={'subtask-group ' + (expanded ? 'open' : '')}>
                <View
                  className='subtask-group-inner'
                  onTouchMove={(e) => e.stopPropagation()}
                >
                  {subtasks.map((s) => {
                    const dragValue = dragValues[s.id]
                    const rawValue = typeof dragValue === 'number' ? dragValue : s.current
                    const displayCurrent =
                      typeof dragValue === 'number' ? snapSubtaskValue(dragValue, s.total) : s.current
                    const percent = calcPercent(displayCurrent, s.total)
                    return (
                      <View className='subtask-item' key={s.id}>
                        <View className='subtask-row'>
                          <Text className='subtask-title'>{s.title}</Text>
                          <Text className='subtask-count'>
                            {displayCurrent}/{s.total}
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
                              step={0.01}
                              value={rawValue}
                              activeColor='#7c3aed'
                              backgroundColor='#e5e7eb'
                              onChanging={(e) => handleDrag(s.id, Number(e.detail.value))}
                              onChange={(e) => handleDragCommit(s.id, Number(e.detail.value), s.total)}
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
            <ActionButton icon={taskStrings.icons.actions.submitChange} label={taskStrings.actions.submitChange} onClick={onSubmit} />
            <ActionButton icon={reviewIcon} label={reviewLabel} onClick={reviewHandler} />
            <ActionButton icon={taskStrings.icons.actions.cancelChange} label={taskStrings.actions.cancelChange} ghost onClick={onCancel} />
          </>
        ) : task.status === 'pending_confirmation' ? (
          <>
            <ActionButton icon={taskStrings.icons.actions.acceptRework} label={taskStrings.actions.acceptRework} onClick={onAccept} />
            <ActionButton icon={taskStrings.icons.actions.rejectRework} label={taskStrings.actions.rejectRework} ghost onClick={onReject} />
          </>
        ) : (
          <>
            <ActionButton icon={taskStrings.icons.actions.updateProgress} label={taskStrings.actions.updateProgress} onClick={onEdit} />
            <ActionButton icon={reviewIcon} label={reviewLabel} onClick={reviewHandler} />
            <ActionButton icon={taskStrings.icons.actions.abandonTask} label={taskStrings.actions.abandonTask} ghost onClick={onCollect} />
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
    onClose,
    onRestart,
    onHistory,
    onCancelRework,
    onDelete,
    onRefresh,
    onConfirmReview,
    onKeepGoing,
  }: {
    task: CollabTask
    expanded: boolean
    onToggleExpand?: (taskId: string) => void
    onEdit?: () => void
    onClose?: () => void
    onRestart?: () => void
    onHistory?: (taskId?: string | null) => void
    onCancelRework?: () => void
    onDelete?: () => void
    onRefresh?: () => void
    onConfirmReview?: () => void
    onKeepGoing?: () => void
  }) {
    const tone = attrTone[task.attr]
    const hasSubtasks = !!task.subtasks && task.subtasks.length > 0
    const isClosed = task.status === 'closed'
    const isReviewPending = task.status === 'review_pending'
    const isCompleted = task.status === 'completed'
    const isOverdue = Boolean(task.dueAt && new Date(task.dueAt).getTime() < Date.now())
    const progress = task.progress || summarizeSubtasksProgress(task.subtasks || [])
    const remainLabel = task.dueAt ? humanizeRemain(task.dueAt) : task.remain || ''
    const dueLabel = task.dueAt ? formatDueLabel(task.dueAt) : task.dueLabel || ''
    const startIso = isClosed ? task.closedAt || task.startAt || task.createdAt : task.startAt || task.createdAt
    const startLabel = formatStartDate(startIso)
    const submittedLabel = formatStartDate(task.submittedAt || task.updatedAt || task.createdAt)
    const completedLabel = formatStartDate(task.completedAt || task.updatedAt || task.createdAt)
    const deleteRemainLabel = task.deleteAt ? humanizeRemain(task.deleteAt) : task.deleteRemain || ''
    const assigneeLabel = task.assigneeId
      ? resolveDisplayName(task.assigneeName || task.assigneeId, task.assigneeId)
      : metaText.unassigned
    const creatorLabel = task.creatorId
      ? resolveDisplayName(task.creatorName || task.creatorId, task.creatorId)
      : ''

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
        {isCompleted ? null : <ProgressBar current={progress.current} total={progress.total} />}
        <View className='card-meta'>
          {isCompleted ? (
            <>
              <View className='meta-item'>
                <Text>{metaIcon.remain}</Text>
                <Text>{metaText.deleteRemain}</Text>
                <Text>{deleteRemainLabel}</Text>
              </View>
              <View className='meta-item'>
                <Text>{taskStrings.icons.actions.completeTask}</Text>
                <Text>{taskStrings.labels.completedAt}</Text>
                <Text>{completedLabel}</Text>
              </View>
            </>
          ) : (
            <>
              <View className='meta-item'>
                <Text>{metaIcon.remain}</Text>
                <Text>{isReviewPending ? metaText.submitted : isClosed ? metaText.deleteRemain : metaText.remain}</Text>
                <Text>{isReviewPending ? submittedLabel : remainLabel}</Text>
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
            </>
          )}
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
              <Text className={`toggle-icon ${!expanded ? 'is-on' : ''}`}>
                {taskStrings.icons.toggle.expand}
              </Text>
              <Text className={`toggle-icon ${expanded ? 'is-on' : ''}`}>
                {taskStrings.icons.toggle.collapse}
              </Text>
            </View>
            <Text className='toggle-text'>
              {expanded ? taskStrings.subtasks.toggleCollapse : taskStrings.subtasks.toggleExpand}
            </Text>
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
                      {isCompleted ? null : (
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
      <View
        className='action-row'
        data-noexpand
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
          {task.status === 'pending_confirmation' ? (
            <ActionButton icon={taskStrings.icons.actions.cancelRework} label={metaText.reworkCancel} onClick={onCancelRework} />
          ) : isReviewPending ? (
            <>
              <ActionButton
                icon={taskStrings.icons.actions.completeTask}
                label={taskStrings.actions.confirmReview}
                onClick={onConfirmReview}
              />
              <ActionButton
                icon={taskStrings.icons.actions.updateProgress}
                label={taskStrings.actions.keepGoing}
                ghost
                onClick={onKeepGoing}
              />
            </>
          ) : isCompleted ? (
            <ActionButton icon={taskStrings.icons.actions.delete} label={metaText.delete} ghost onClick={onDelete} />
          ) : (
            isClosed ? (
              <>
                <ActionButton icon={taskStrings.icons.actions.delete} label={metaText.delete} ghost onClick={onDelete} />
                <ActionButton icon={taskStrings.icons.actions.restart} label={metaText.restart} onClick={onRestart} />
              </>
            ) : (
              <>
                <ActionButton icon={taskStrings.icons.actions.edit} label={metaText.edit} onClick={onEdit} />
                {task.assigneeId ? null : isOverdue ? (
                  <ActionButton
                    icon={taskStrings.icons.actions.refreshTask}
                    label={metaText.refresh}
                    onClick={onRefresh}
                  />
                ) : (
                  <ActionButton
                    icon={taskStrings.icons.actions.assign}
                    label={metaText.assign}
                    openType='share'
                    taskId={task.id}
                    taskTitle={task.title}
                  />
                )}
              <ActionButton icon={taskStrings.icons.actions.close} label={metaText.close} ghost onClick={onClose} />
            </>
          )
        )}
      </View>
    </View>
  )
}

  function ArchivedCard({ task, onDelete }: { task: ArchivedTask; onDelete?: () => void }) {
    const tone = attrTone[task.attr]
    const isReviewPending = task.status === 'review_pending'
    const statusBadge = isReviewPending ? 'review_pending' : 'archived'
    const hasSubtasks = !!task.subtasks && task.subtasks.length > 0
    const [expanded, setExpanded] = useState(false)
    return (
      <View className={`task-card tone-${tone} ${hasSubtasks && expanded ? 'expanded' : ''}`}>
      <View className='card-head'>
        <View className='title-wrap'>
          <Text className='task-icon'>{task.icon}</Text>
          <Text className='task-title'>{task.title}</Text>
        </View>
        <StatusBadge status={statusBadge} />
      </View>
      <Text className='task-desc'>{task.detail}</Text>
      <View className='card-meta'>
          <Text className='meta-item'>
            {taskStrings.icons.actions.completeTask}{' '}
            {isReviewPending ? taskStrings.labels.submittedAt : taskStrings.labels.completedAt}: {task.finishedAgo}
          </Text>
      </View>
        {isReviewPending ? (
          <View className='card-meta'>
            <Text className='meta-item'>
              {metaIcon.remain} {taskStrings.labels.reviewWaiting}
            </Text>
          </View>
        ) : task.deleteRemain ? (
        <View className='card-meta'>
          <Text className='meta-item'>
            {metaIcon.remain} {metaText.deleteRemain}
            {task.deleteRemain}
          </Text>
        </View>
      ) : null}
        {hasSubtasks ? (
          <>
            <View
              className={`subtask-toggle ${expanded ? 'expanded' : ''}`}
              hoverClass='toggle-pressing'
              onClick={(e) => {
                e.stopPropagation?.()
                if (!hasSubtasks) return
                setExpanded((prev) => !prev)
              }}
            >
              <View className='toggle-arrow'>
                <Text className={`toggle-icon ${!expanded ? 'is-on' : ''}`}>
                  {taskStrings.icons.toggle.expand}
                </Text>
                <Text className={`toggle-icon ${expanded ? 'is-on' : ''}`}>
                  {taskStrings.icons.toggle.collapse}
                </Text>
              </View>
              <Text className='toggle-text'>
                {expanded ? taskStrings.subtasks.toggleCollapse : taskStrings.subtasks.toggleExpand}
              </Text>
            </View>
            <View className={`subtask-group ${expanded ? 'open' : ''}`}>
              <View className='subtask-group-inner' onTouchMove={(e) => e.stopPropagation()}>
                {task.subtasks?.map((s) => (
                  <View className='subtask-item' key={s.id}>
                    <View className='subtask-row'>
                      <Text className='subtask-title'>{s.title}</Text>
                      <Text className='subtask-count'>
                        {s.current}/{s.total}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}
        <View className='archive-foot'>
          <AttributeTag attr={task.attr} points={task.points} />
        </View>
      {!isReviewPending ? (
        <View
          className='action-row'
          data-noexpand
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <ActionButton icon={taskStrings.icons.actions.delete} label={taskStrings.actions.delete} ghost onClick={onDelete} />
        </View>
      ) : null}
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
  const assigneeLabel = task.assigneeName || task.assigneeId || metaText.unassigned
  const creatorLabel = task.creatorName || task.creatorId || ''

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
  const [missionTasks, setMissionTasks] = useState<MissionTask[]>([])
  const visibleMissionTasks = useMemo(() => sortMissionTasks(missionTasks), [missionTasks])
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [draftSubtasks, setDraftSubtasks] = useState<Record<string, Subtask[]>>({})
  const [collabTasks, setCollabTasks] = useState<CollabTask[]>([])
  const visibleCollabTasks = useMemo(() => sortCollabTasks(collabTasks), [collabTasks])
  const [expandedCollabId, setExpandedCollabId] = useState<string | null>(null)
  const [archivedTasks, setArchivedTasks] = useState<ArchivedTask[]>([])
  const pollingBusyRef = useRef(false)
  const [loadingRemote, setLoadingRemote] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [reworkTaskId, setReworkTaskId] = useState<string | null>(null)
  const [historyTask, setHistoryTask] = useState<CollabTask | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showOneLineTip, setShowOneLineTip] = useState(false)
  const [oneLineTipStyle, setOneLineTipStyle] = useState({ top: 0, left: 0, width: 0 })
  const oneLineTipAnchorRef = useRef<{ top: number; bottom: number; left: number } | null>(null)
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
  const [attrValue, setAttrValue] = useState('1')
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
  const dueDisplay = `${dueYear}${taskStrings.time.year}${pad2(
    dueMonth
  )}${taskStrings.time.month}${pad2(dueDay)}${taskStrings.time.day} ${pad2(
    dueHour
  )}:${pad2(dueMinute)}`
  const historyVisible = historyLoading || !!historyTask

  useEffect(() => {
    const maxDay = new Date(dueYear, dueMonth, 0).getDate()
    if (dueDay > maxDay) setDueDay(maxDay)
  }, [dueDay, dueMonth, dueYear])

  useEffect(() => {
    console.warn('[sort-debug] taskDebug', taskDebug)
  }, [])

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

  const applyDueFromDate = (date: Date) => {
    if (!date || Number.isNaN(date.getTime())) return
    setDueYear(date.getFullYear())
    setDueMonth(date.getMonth() + 1)
    setDueDay(date.getDate())
    setDueHour(date.getHours())
    setDueMinute(date.getMinutes())
  }

  const parseDueFromText = (text: string) => {
    if (!text) return null
    const hmMatch = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/)
    let hour = hmMatch ? Number(hmMatch[1]) : null
    let minute = hmMatch ? Number(hmMatch[2]) : null

    if (hour === null) {
      const hMatch = text.match(new RegExp(taskStrings.time.patterns.hour))
      if (hMatch) {
        hour = Number(hMatch[1])
        minute = hMatch[2] ? 30 : 0
      }
    }

    if (hour === null || minute === null) {
      const slots = [
        { re: new RegExp(taskStrings.time.patterns.breakfast), hour: 8, minute: 0 },
        { re: new RegExp(taskStrings.time.patterns.lunch), hour: 12, minute: 0 },
        { re: new RegExp(taskStrings.time.patterns.dinner), hour: 18, minute: 0 },
      ]
      const hit = slots.find((s) => s.re.test(text))
      if (hit) {
        hour = hit.hour
        minute = hit.minute
      }
    }

    if (hour === null || minute === null || Number.isNaN(hour) || Number.isNaN(minute)) {
      return null
    }

    const base = new Date()
    const isoMatch = text.match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/)
    if (isoMatch) {
      base.setFullYear(Number(isoMatch[1]))
      base.setMonth(Number(isoMatch[2]) - 1)
      base.setDate(Number(isoMatch[3]))
    } else {
      const mdMatch = text.match(new RegExp(taskStrings.time.patterns.monthDay))
      if (mdMatch) {
        base.setMonth(Number(mdMatch[1]) - 1)
        base.setDate(Number(mdMatch[2]))
      } else if (text.includes(taskStrings.time.patterns.afterTomorrow)) {
        base.setDate(base.getDate() + 2)
      } else if (text.includes(taskStrings.time.patterns.tomorrow)) {
        base.setDate(base.getDate() + 1)
      } else if (text.includes(taskStrings.time.patterns.today)) {
        base.setDate(base.getDate())
      }
    }

    const isPM = new RegExp(taskStrings.time.patterns.afternoon).test(text)
    const isNoon = new RegExp(taskStrings.time.patterns.noon).test(text)
    const isExplicitAM = new RegExp(taskStrings.time.patterns.morning).test(text)
    const isDeadline = new RegExp(taskStrings.time.patterns.deadline).test(text)
    if (isPM && hour < 12) hour += 12
    if (isNoon && hour < 11) hour += 12
    if (!isPM && !isNoon && !isExplicitAM && isDeadline && hour < 12) hour += 12
    if (hour >= 24) hour = 23
    if (minute >= 60) minute = 59

    base.setHours(hour, minute, 0, 0)
    return base
  }

  const parseDueFromIsoLocal = (value: string) => {
    if (!value) return null
    const match = value.match(/(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{2})/)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const hour = Number(match[4])
    const minute = Number(match[5])
    const date = new Date(year, month - 1, day, hour, minute, 0, 0)
    if (Number.isNaN(date.getTime())) return null
    return date
  }

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

  const normalizeStatus = (status?: string | null) => String(status || '').trim()

  const sortMissionTasks = (items: MissionTask[]) => {
    const sorted = [...items]
    sorted.sort((a, b) => {
      const aCompleted = normalizeStatus(a.status) === 'completed'
      const bCompleted = normalizeStatus(b.status) === 'completed'
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY
      if (aDue !== bDue) return aDue - bDue
      return a.createdAt.localeCompare(b.createdAt)
    })
    if (taskDebug) {
      console.log('mission sort snapshot', {
        order: sorted.map((t) => ({ id: t.id, status: t.status, dueAt: t.dueAt })),
      })
    }
    return sorted
  }

  const sortCollabTasks = (items: CollabTask[]) => {
    const sorted = [...items]
    sorted.sort((a, b) => {
      const aCompleted = normalizeStatus(a.status) === 'completed'
      const bCompleted = normalizeStatus(b.status) === 'completed'
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY
      if (aDue !== bDue) return aDue - bDue
      return a.createdAt.localeCompare(b.createdAt)
    })
    if (taskDebug) {
      console.log('collab sort snapshot', {
        order: sorted.map((t) => ({ id: t.id, status: t.status, dueAt: t.dueAt })),
      })
    }
    return sorted
  }

  const buildTaskLists = (mission: Task[], collab: Task[], archived: Task[]) => {
    const missionList = mission
      .map((t) => mapApiTaskToMission(t))
      .filter((t) => t.status !== 'refactored')
    const collabList = collab
      .map((t) => mapApiTaskToCollab(t))
      .filter((t) => t.status !== 'refactored' && !(t.assigneeId && t.creatorId === t.assigneeId))
    const archivedList = archived
      .map((t) => mapApiTaskToArchived(t))
      .filter((t) => t.status !== 'refactored')
    return {
      missionList: sortMissionTasks(missionList),
      collabList: sortCollabTasks(collabList),
      archivedList,
    }
  }

  const applyTaskLists = (mission: Task[], collab: Task[], archived: Task[]) => {
    const { missionList, collabList, archivedList } = buildTaskLists(mission, collab, archived)
    setMissionTasks(sortMissionTasks(missionList))
    setCollabTasks(sortCollabTasks(collabList))
    setArchivedTasks(archivedList)
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
      if (taskDebug) {
        console.log('refreshTasks ok', {
          missionCount: mission.length,
          collabCount: collab.length,
          archivedCount: archived.length,
        })
      }
      applyTaskLists(mission, collab, archived)
    } catch (err: any) {
      console.error('load tasks error', err)
      if (!shouldCancel?.()) {
        const hasLocal =
          missionTasks.length > 0 || collabTasks.length > 0 || archivedTasks.length > 0
        if (!hasLocal) {
          setMissionTasks([])
          setCollabTasks([])
          setArchivedTasks([])
        }
      }
    } finally {
      setLoadingRemote(false)
    }
  }

  const refreshTasksSilent = async (shouldCancel?: () => boolean) => {
    if (loadingRemote || pollingBusyRef.current) return
    pollingBusyRef.current = true
    try {
      const [mission, collab, archived] = await Promise.all([
        fetchMissionTasks(),
        fetchCollabTasks(),
        fetchArchivedTasks(),
      ])
      if (shouldCancel?.()) return
      const { missionList, collabList, archivedList } = buildTaskLists(mission, collab, archived)
    setMissionTasks((prev) => sortMissionTasks(mergeById(prev, missionList)))
    setCollabTasks((prev) => sortCollabTasks(mergeById(prev, collabList)))
    setArchivedTasks((prev) => mergeById(prev, archivedList))
      if (taskDebug) {
        console.log('refreshTasks diff', {
          missionCount: missionList.length,
          collabCount: collabList.length,
          archivedCount: archivedList.length,
        })
      }
    } catch (err: any) {
      console.error('load tasks error', err)
    } finally {
      pollingBusyRef.current = false
    }
  }

  const refreshTasksWithNotice = async () => {
    await refreshTasks()
    Taro.showToast({ title: taskStrings.toast.dataRefreshed, icon: 'none' })
  }

  const reportMemoryUsage = () => {
    const enabled = taskMemReport
    if (!enabled) return
    const getPerf = (Taro as any).getPerformance
    if (typeof getPerf !== 'function') return
    const perf = getPerf()
    const memory = perf?.memory
    if (!memory) return
    const used = memory.usedJSHeapSize ?? memory.usedHeapSize
    const total = memory.totalJSHeapSize ?? memory.totalHeapSize
    if (typeof used !== 'number' && typeof total !== 'number') return
    console.log('[memory]', { used, total })
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
    if (!showCreate) {
      setShowOneLineTip(false)
    }
  }, [showCreate])

  useEffect(() => {
    if (!isActive) return
    let cancelled = false
    const cancelCheck = () => cancelled
    void refreshTasks(cancelCheck)
    return () => {
      cancelled = true
    }
  }, [isActive])

  useEffect(() => {
    if (!taskDebug) return
    console.warn(
      '[sort-debug] mission order',
      missionTasks.map((t) => ({ id: t.id, status: t.status, dueAt: t.dueAt }))
    )
  }, [missionTasks, taskDebug])

  useEffect(() => {
    if (!taskDebug) return
    console.warn(
      '[sort-debug] collab order',
      collabTasks.map((t) => ({ id: t.id, status: t.status, dueAt: t.dueAt }))
    )
  }, [collabTasks, taskDebug])

  useEffect(() => {
    if (!isActive) return
    if (editingTaskId || showCreate || historyLoading || confirmReworkOpen || creating || generating) return
    let cancelled = false
    const cancelCheck = () => cancelled
    const timer = setInterval(() => {
      void refreshTasksSilent(cancelCheck)
    }, POLL_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isActive, editingTaskId, showCreate, historyLoading, confirmReworkOpen, creating, generating])

  useEffect(() => {
    const enabled = taskMemReport
    if (!isActive || !enabled) return
    reportMemoryUsage()
    const timer = setInterval(reportMemoryUsage, 5 * 60 * 1000)
    return () => {
      clearInterval(timer)
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
    setCollabTasks((prev) => sortCollabTasks(prev.map((t) => (t.id === taskId ? { ...t, ...mapped } : t))))
  }

  const handleCloseCollabTask = async (taskId: string) => {
    try {
      const updated = await closeTask(taskId)
      updateCollabTaskInState(taskId, updated)
      Taro.showToast({ title: taskStrings.toast.closed, icon: 'success' })
    } catch (err: any) {
      console.error('close task error', err)
      Taro.showToast({ title: err?.message || taskStrings.toast.closeFail, icon: 'none' })
    }
  }

  const handleRestartCollabTask = async (taskId: string) => {
    try {
      const updated = await restartTask(taskId)
      updateCollabTaskInState(taskId, updated)
      Taro.showToast({ title: taskStrings.toast.restarted, icon: 'success' })
    } catch (err: any) {
      console.error('restart task error', err)
      Taro.showToast({ title: err?.message || taskStrings.toast.restartFail, icon: 'none' })
    }
  }

  const handleRefreshCollabTask = async (taskId: string) => {
    try {
      const updated = await refreshTaskSchedule(taskId)
      updateCollabTaskInState(taskId, updated)
      Taro.showToast({ title: taskStrings.toast.refreshTaskOk, icon: 'success' })
      await refreshTasks()
    } catch (err: any) {
      console.error('refresh task error', err)
      Taro.showToast({ title: taskStrings.toast.refreshTaskFail, icon: 'none' })
      await refreshTasks()
    }
  }

  const handleDeleteCollabTask = async (taskId: string) => {
    const result = await Taro.showModal({
      title: metaText.delete,
      content: taskStrings.toast.deleteConfirmContent,
      confirmText: taskStrings.toast.deleteConfirmOk,
      cancelText: taskStrings.toast.cancel,
    })
    if (!result.confirm) return
    try {
      await deleteTask(taskId)
      setCollabTasks((prev) => prev.filter((t) => t.id !== taskId))
      Taro.showToast({ title: taskStrings.toast.deleted, icon: 'success' })
    } catch (err: any) {
      console.error('delete task error', err)
      await refreshTasksWithNotice()
    }
  }

  const handleAbandonTask = async (taskId: string) => {
    const result = await Taro.showModal({
      title: taskStrings.toast.abandonTitle,
      content: taskStrings.toast.abandonContent,
      confirmText: taskStrings.toast.abandonOk,
      cancelText: taskStrings.toast.cancel,
    })
    if (!result.confirm) return
    try {
      await abandonTask(taskId)
      Taro.showToast({ title: taskStrings.toast.abandoned, icon: 'success' })
      await refreshTasks()
    } catch (err: any) {
      console.error('abandon task error', err)
      await refreshTasksWithNotice()
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

  const handleSubmitEditing = async () => {
    if (!editingTaskId) return
    const draft = draftSubtasks[editingTaskId]
    if (!draft) return
    try {
      for (let i = 0; i < draft.length; i += 1) {
        await patchProgress(editingTaskId, { subtaskIndex: i, current: draft[i].current })
      }
      const progress = summarizeSubtasksProgress(draft)
      setMissionTasks((prev) =>
        sortMissionTasks(
          prev.map((t) => (t.id === editingTaskId ? { ...t, subtasks: draft, progress } : t))
        )
      )
      Taro.showToast({ title: taskStrings.toast.submitted, icon: 'success' })
    } catch (err: any) {
      console.error('update progress error', err)
      await refreshTasksWithNotice()
    } finally {
      setEditingTaskId(null)
      setDraftSubtasks((prev) => {
        const next = { ...prev }
        delete next[editingTaskId]
        return next
      })
    }
  }

  const handleCompleteMissionTask = async (task: MissionTask) => {
    try {
      const updated = await completeTask(task.id)
      const archivedMapped = mapApiTaskToArchived(updated)
      setMissionTasks((prev) => prev.filter((t) => t.id !== task.id))
      setCollabTasks((prev) => prev.filter((t) => t.id !== task.id))
      setArchivedTasks((prev) => [archivedMapped, ...prev.filter((t) => t.id !== task.id)])
      Taro.showToast({ title: taskStrings.toast.completed, icon: 'success' })
    } catch (err: any) {
      console.error('complete task error', err)
      await refreshTasksWithNotice()
    }
  }

  const handleConfirmReview = async (task: CollabTask) => {
    try {
      const updated = await completeTask(task.id)
      const mapped = mapApiTaskToCollab(updated)
      if (mapped.assigneeId && mapped.creatorId === mapped.assigneeId) {
        const archivedMapped = mapApiTaskToArchived(updated)
        setCollabTasks((prev) => prev.filter((t) => t.id !== task.id))
        setArchivedTasks((prev) => [archivedMapped, ...prev.filter((t) => t.id !== task.id)])
      } else {
        setCollabTasks((prev) => sortCollabTasks(prev.map((t) => (t.id === task.id ? mapped : t))))
      }
      Taro.showToast({ title: taskStrings.toast.completed, icon: 'success' })
    } catch (err: any) {
      console.error('complete task error', err)
      await refreshTasksWithNotice()
    }
  }

  const handleSubmitReview = async (task: MissionTask) => {
    const progress = task.progress || summarizeSubtasksProgress(task.subtasks || [])
    if (progress.current < progress.total) {
      const result = await Taro.showModal({
        title: taskStrings.toast.reviewConfirmTitle,
        content: taskStrings.toast.reviewConfirmContent,
        confirmText: taskStrings.toast.reviewConfirmOk,
        cancelText: taskStrings.toast.cancel,
      })
      if (!result.confirm) return
    }
    try {
      await requestTaskSubscribeAuth()
      const updated = await submitReview(task.id)
      const archivedMapped = mapApiTaskToArchived(updated)
      setMissionTasks((prev) => prev.filter((t) => t.id !== task.id))
      setArchivedTasks((prev) => [archivedMapped, ...prev.filter((t) => t.id !== task.id)])
      Taro.showToast({ title: taskStrings.toast.submitted, icon: 'success' })
    } catch (err: any) {
      console.error('submit review error', err)
      await refreshTasksWithNotice()
    }
  }

  const handleContinueReview = async (taskId: string) => {
    try {
      const updated = await continueReview(taskId)
      const mapped = mapApiTaskToCollab(updated)
      setCollabTasks((prev) => sortCollabTasks(prev.map((t) => (t.id === taskId ? mapped : t))))
      Taro.showToast({ title: taskStrings.toast.reviewContinue, icon: 'success' })
    } catch (err: any) {
      console.error('continue review error', err)
      await refreshTasksWithNotice()
    }
  }

  const handleDeleteArchivedTask = async (taskId: string) => {
    const result = await Taro.showModal({
      title: metaText.delete,
      content: taskStrings.toast.deleteConfirmContent,
      confirmText: taskStrings.toast.deleteConfirmOk,
      cancelText: taskStrings.toast.cancel,
    })
    if (!result.confirm) return
    try {
      await deleteTask(taskId)
      setArchivedTasks((prev) => prev.filter((t) => t.id !== taskId))
      Taro.showToast({ title: taskStrings.toast.deleted, icon: 'success' })
    } catch (err: any) {
      console.error('delete archived task error', err)
      await refreshTasksWithNotice()
    }
  }

  const rewardOptions = useMemo(
    () => [
      {
        label: taskStrings.rewards.wisdom.label,
        value: 'wisdom' as const,
        tone: 'blue',
        icon: taskStrings.rewards.wisdom.icon,
      },
      {
        label: taskStrings.rewards.strength.label,
        value: 'strength' as const,
        tone: 'red',
        icon: taskStrings.rewards.strength.icon,
      },
      {
        label: taskStrings.rewards.agility.label,
        value: 'agility' as const,
        tone: 'green',
        icon: taskStrings.rewards.agility.icon,
      },
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
    if (val === 'wisdom') return taskStrings.rewards.wisdom.label
    if (val === 'strength') return taskStrings.rewards.strength.label
    return taskStrings.rewards.agility.label
  }

  const formatAgo = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const diff = Date.now() - d.getTime()
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return taskStrings.time.justNow
    if (diff < hour) return `${Math.floor(diff / minute)}${taskStrings.time.minuteAgo}`
    if (diff < day) return `${Math.floor(diff / hour)}${taskStrings.time.hourAgo}`
    return `${Math.floor(diff / day)}${taskStrings.time.dayAgo}`
  }

  const mapApiTaskToMission = (task: Task): MissionTask => {
    const attr = mapRewardToAttr(task.attributeReward.type)
    const createdAt = task.createdAt || defaultCreatedAt
    const baseId = task._id || 'task'
    const subtasks = (
      task.subtasks && task.subtasks.length > 0
        ? task.subtasks.map((s, idx) => ({
            id: s._id || baseId + '-sub-' + (idx + 1),
            title: s.title || `${taskStrings.labels.subtaskFallback} ${idx + 1}`,
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
    const difficulty =
      task.attributeReward.value >= 20
        ? taskStrings.labels.difficultyMid
        : taskStrings.labels.difficultyEasy
    const isChallenge = task.seedKey?.startsWith('challenge_')
    return {
      id: task._id || Math.random().toString(36).slice(2),
      title: task.title,
      detail: task.detail || '',
      attr,
      points: task.attributeReward.value,
      createdAt,
      previousTaskId: task.previousTaskId ?? null,
      seedKey: task.seedKey ?? null,
      status: task.status,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId ?? null,
      creatorName: isChallenge ? taskStrings.labels.creatorSystem : task.creatorName || task.creatorId,
      assigneeName: task.assigneeName || task.assigneeId || '',
      icon: task.icon || '?',
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
            title: s.title || `${taskStrings.labels.subtaskFallback} ${idx + 1}`,
            current: s.current ?? 0,
            total: s.total || 1,
          }))
        : []

    const progress = task.computedProgress || summarizeSubtasksProgress(subtasks)
    const dueIso = task.dueAt || task.updatedAt || task.createdAt || new Date(Date.now() + DAY).toISOString()
    const dueMeta = computeDueMeta(dueIso)
    const deleteAt = task.deleteAt || null
    const deleteRemain = deleteAt ? humanizeRemain(deleteAt) : undefined

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
      creatorName: task.creatorName || task.creatorId,
      assigneeName: task.assigneeName || task.assigneeId || '',
      seedKey: task.seedKey ?? null,
      submittedAt: task.submittedAt ?? null,
      completedAt: task.completedAt ?? null,
      deleteAt,
      deleteRemain,
      icon: task.icon || '?',
      progress: { current: progress.current, total: progress.total || 1 },
      subtasks,
      ...dueMeta,
    }
  }

  const mapApiTaskToArchived = (task: Task): ArchivedTask => {
    const attr = mapRewardToAttr(task.attributeReward.type)
    const createdAt = task.createdAt || defaultCreatedAt
    const baseId = task._id || 'task'
    const subtasks =
      task.subtasks && task.subtasks.length > 0
        ? task.subtasks.map((s, idx) => ({
            id: s._id || baseId + '-sub-' + (idx + 1),
            title: s.title || `${taskStrings.labels.subtaskFallback} ${idx + 1}`,
            current: s.current ?? 0,
            total: s.total || 1,
          }))
        : []
    const isReviewPending = task.status === 'review_pending'
    const finishedAt = isReviewPending
      ? task.submittedAt || task.updatedAt || task.createdAt
      : task.completedAt || task.updatedAt || task.createdAt
    const deleteAt = isReviewPending ? null : task.deleteAt || null
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
      creatorName: task.creatorName || task.creatorId,
      assigneeName: task.assigneeName || task.assigneeId || '',
      seedKey: task.seedKey ?? null,
      icon: task.icon || '?',
      finishedAgo: formatAgo(finishedAt),
      submittedAt: task.submittedAt ?? null,
      deleteAt: deleteAt || undefined,
      deleteRemain: deleteAt ? humanizeRemain(deleteAt) : undefined,
      subtasks,
    }
  }

  const resetForm = (clearLine = true) => {
    if (clearLine) setOneLine('')
    setTitleInput('')
    setDescInput('')
    setAttrReward('')
    setAttrValue('1')
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
    if (attr === taskStrings.rewards.wisdom.label) return 'wisdom'
    if (attr === taskStrings.rewards.strength.label) return 'strength'
    return 'agility'
  }

  const fillFormFromTask = (task: CollabTask) => {
    setTitleInput(task.title || '')
    setDescInput(task.detail || '')
    setAttrReward(mapAttrToReward(task.attr))
    setAttrValue('1')
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
      await requestTaskSubscribeAuth()
      await acceptReworkTask(taskId)
      Taro.showToast({ title: taskStrings.toast.accepted, icon: 'success' })
      await refreshTasks()
    } catch (err: any) {
      console.error('accept rework error', err)
      await refreshTasksWithNotice()
    }
  }

  const handleRejectRework = async (taskId: string) => {
    try {
      await rejectReworkTask(taskId)
      Taro.showToast({ title: taskStrings.toast.rejected, icon: 'success' })
      await refreshTasks()
    } catch (err: any) {
      console.error('reject rework error', err)
      await refreshTasksWithNotice()
    }
  }

  const handleCancelRework = async (taskId: string) => {
    try {
      await cancelReworkTask(taskId)
      Taro.showToast({ title: taskStrings.toast.canceled, icon: 'success' })
      await refreshTasks()
    } catch (err: any) {
      console.error('cancel rework error', err)
      await refreshTasksWithNotice()
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
      Taro.showToast({ title: err?.message || taskStrings.toast.loadFail, icon: 'none' })
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
      if ((created as any).message === 'no changes') {
        Taro.showToast({ title: taskStrings.toast.noChanges, icon: 'none' })
      } else {
        const mapped = mapApiTaskToCollab(actualTask as Task)
        setCollabTasks((prev) =>
          sortCollabTasks([mapped, ...prev.filter((t) => t.id !== confirmPayload.taskId && t.status !== 'refactored')])
        )
        setActiveTab('collab')
        Taro.showToast({ title: taskStrings.toast.reworked, icon: 'success' })
      }
      setShowCreate(false)
      resetForm()
      setConfirmReworkOpen(false)
      setConfirmPayload(null)
    } catch (err: any) {
      console.error('confirm rework error', err)
      Taro.showToast({ title: err?.message || taskStrings.toast.reworkFail, icon: 'none' })
    } finally {
      setCreating(false)
    }
  }

  const handleCancelConfirmRework = () => {
    setConfirmReworkOpen(false)
    setConfirmPayload(null)
  }

  const handleSubmitCreate = async (selfAssign = false) => {
    if (creating) return
    const title = titleInput.trim()
    if (!title) {
      Taro.showToast({ title: taskStrings.toast.missingTitle, icon: 'none' })
      return
    }
    if (!attrReward) {
      Taro.showToast({ title: taskStrings.toast.missingReward, icon: 'none' })
      return
    }
    const rewardValNum = 1
    const validSubtasks = subtasks
      .map((s) => ({ ...s, title: s.title.trim(), total: Math.max(1, s.total || 1) }))
      .filter((s) => s.title)

    if (validSubtasks.length === 0) {
      Taro.showToast({ title: taskStrings.toast.missingSubtask, icon: 'none' })
      return
    }

      setCreating(true)
      try {
        if (reworkTaskId) {
          const created: any = await reworkTask(reworkTaskId, {
            title,
            detail: descInput.trim(),
            dueAt: selectedDueAt(),
            subtasks: validSubtasks.map((s) => ({ ...s, current: 0 })),
          attributeReward: { type: attrReward, value: rewardValNum },
        })
        if (created?.code === 'REWORK_CONFIRM_REQUIRED') {
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
        }
        const actualTask: any = (created as any).task ? (created as any).task : created
        if ((created as any).message === 'no changes') {
          Taro.showToast({ title: taskStrings.toast.noChanges, icon: 'none' })
        } else {
          const mapped = mapApiTaskToCollab(actualTask as Task)
          setCollabTasks((prev) =>
            sortCollabTasks([mapped, ...prev.filter((t) => t.id !== reworkTaskId && t.status !== 'refactored')])
          )
          setActiveTab('collab')
          Taro.showToast({ title: taskStrings.toast.reworked, icon: 'success' })
        }
        } else {
          const created = await createTask({
            title,
            detail: descInput.trim(),
            dueAt: selectedDueAt(),
            subtasks: validSubtasks.map((s) => ({ ...s, current: 0 })),
            attributeReward: { type: attrReward, value: rewardValNum },
          selfAssign,
        })
        const mapped = mapApiTaskToCollab(created)
        setCollabTasks((prev) => sortCollabTasks([mapped, ...prev]))
        if (selfAssign) {
          const missionMapped = mapApiTaskToMission(created)
          setMissionTasks((prev) => sortMissionTasks([missionMapped, ...prev]))
          setActiveTab('mission')
          Taro.showToast({ title: taskStrings.toast.createAccepted, icon: 'success' })
        } else {
          setActiveTab('collab')
          Taro.showToast({ title: taskStrings.toast.createOk, icon: 'success' })
        }
      }
      setShowCreate(false)
      resetForm()
    } catch (err: any) {
      console.error('create task error', err)
      Taro.showToast({ title: err?.message || taskStrings.toast.createFail, icon: 'none' })
    } finally {
      setCreating(false)
    }
  }

  const handleSubmitCreateSelf = async () => {
    await handleSubmitCreate(true)
  }

  const openOneLineTip = () => {
    const query = Taro.createSelectorQuery()
    query.select('#one-line-help-anchor').boundingClientRect()
    query.exec((res) => {
      const rect = res?.[0]
      const { windowWidth } = Taro.getSystemInfoSync()
      const width = Math.min(220, windowWidth - 32)
      const rightEdge = rect ? rect.right ?? rect.left + rect.width : null
      const left = rect
        ? Math.min(windowWidth - width - 12, Math.max(12, (rightEdge || rect.left) - width))
        : Math.max(12, (windowWidth - width) / 2)
      const top = rect ? rect.top - 8 : 160
      oneLineTipAnchorRef.current = rect ? { top: rect.top, bottom: rect.bottom, left: rect.left } : null
      setOneLineTipStyle({ top, left, width })
      setShowOneLineTip(true)
    })
  }

  useEffect(() => {
    if (!showOneLineTip) return
    const anchor = oneLineTipAnchorRef.current
    if (!anchor) return
    const query = Taro.createSelectorQuery()
    query.select('#one-line-tip').boundingClientRect()
    query.exec((res) => {
      const rect = res?.[0]
      if (!rect) return
      const desiredTop = anchor.top - rect.height - 8
      const top = Math.max(12, desiredTop)
      const { windowWidth } = Taro.getSystemInfoSync()
      let left = oneLineTipStyle.left
      if (rect.right > windowWidth - 12) {
        left = Math.max(12, windowWidth - rect.width - 12)
      }
      if (rect.left < 12) {
        left = 12
      }
      setOneLineTipStyle((prev) => ({ ...prev, top, left }))
    })
  }, [showOneLineTip, oneLineTipStyle.left])

  const handleGenerate = async () => {
    if (generating) return
    const prompt = oneLine.trim()
    if (!prompt) {
      Taro.showToast({ title: taskStrings.toast.needOneLine, icon: 'none' })
      return
    }
    setGenerating(true)
    try {
      const data = await generateTaskSuggestion(prompt)
      if (data.title) setTitleInput(data.title)
      if (data.description) setDescInput(data.description)
      if (Array.isArray(data.subtasks) && data.subtasks.length > 0) {
        const trimmed = data.subtasks
          .map((s) => ({
            title: s.title || '',
            total: Math.max(1, s.total || 1),
          }))
          .filter((s) => s.title)
        if (trimmed.length > 0) setSubtasks(trimmed)
      }
      const promptDue = parseDueFromText(prompt)
      if (promptDue) {
        applyDueFromDate(promptDue)
      } else if (data.dueAt) {
        const parsed = parseDueFromIsoLocal(data.dueAt) || new Date(data.dueAt)
        const cutoff = Date.now() - 24 * 60 * 60 * 1000
        if (!Number.isNaN(parsed.getTime()) && parsed.getTime() >= cutoff) {
          applyDueFromDate(parsed)
        }
      } else {
        const textParts = [
          data.title,
          data.description,
          ...(Array.isArray(data.subtasks) ? data.subtasks.map((s) => s.title) : []),
        ].filter(Boolean)
        const textBlob = textParts.join(' ')
        const parsed = parseDueFromText(textBlob)
        if (parsed) applyDueFromDate(parsed)
      }
      if (data.attributeReward?.type) {
        setAttrReward(data.attributeReward.type)
      }
      setAttrValue('1')
      Taro.showToast({ title: taskStrings.toast.draftOk, icon: 'success' })
    } catch (err: any) {
      console.error('generate task error', err)
      Taro.showToast({ title: err?.message || taskStrings.toast.draftFail, icon: 'none' })
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
                  {visibleMissionTasks
                    .filter((t) => t.status !== 'refactored' && t.status !== 'review_pending')
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
                      onReview={() => void handleSubmitReview(task)}
                      onCollect={() => void handleAbandonTask(task.id)}
                      onAccept={() => handleAcceptRework(task.id)}
                      onReject={() => handleRejectRework(task.id)}
                      onComplete={() => void handleCompleteMissionTask(task)}
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
                {visibleCollabTasks
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
                        onClose={() => void handleCloseCollabTask(task.id)}
                        onRestart={() => void handleRestartCollabTask(task.id)}
                        onHistory={handleOpenHistory}
                        onCancelRework={() => void handleCancelRework(task.id)}
                        onDelete={() => void handleDeleteCollabTask(task.id)}
                        onRefresh={() => void handleRefreshCollabTask(task.id)}
                        onConfirmReview={() => void handleConfirmReview(task)}
                        onKeepGoing={() => void handleContinueReview(task.id)}
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
                  <ArchivedCard
                    key={task.id}
                    task={task}
                    onDelete={() => void handleDeleteArchivedTask(task.id)}
                  />
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
        {taskStrings.modal.submitNew}
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
                  <Text className='modal-title'>
                    {reworkTaskId ? taskStrings.modal.titleRework : taskStrings.modal.titleNew}
                  </Text>
                  {(reworkTaskId ? taskStrings.modal.subRework : taskStrings.modal.subNew) ? (
                    <Text className='modal-sub'>
                      {reworkTaskId ? taskStrings.modal.subRework : taskStrings.modal.subNew}
                    </Text>
                  ) : null}
                </View>
              <Text
                className='modal-close'
                onClick={() => {
                  setShowCreate(false)
                  resetForm()
                }}
              >
                {taskStrings.modal.closeIcon}
              </Text>
            </View>

            <View className='modal-body'>
                {!reworkTaskId && (
                  <View className='modal-section bubble soft'>
                    <View className='section-head-row'>
                      <View className='modal-label-row'>
                        <Text className='modal-label'>{taskStrings.modal.oneLineLabel}</Text>
                        <View id='one-line-help-anchor' className='modal-help' onClick={openOneLineTip}>
                          <Text>?</Text>
                        </View>
                      </View>
                    </View>
                    <View className='one-line-col'>
                      <View className='one-line-row'>
                        <Input
                          className='modal-input'
                        value={oneLine}
                        onInput={(e) => setOneLine(e.detail.value)}
                        placeholder={taskStrings.modal.oneLinePlaceholder}
                      />
                      <View className='one-line-actions'>
                        <Button className='ai-btn' loading={generating} onClick={handleGenerate}>
                          {taskStrings.modal.aiGenerate}
                        </Button>
                      </View>
                      </View>
                    </View>
                  </View>
                )}
                {showOneLineTip && (
                  <View
                    className='one-line-tip-mask'
                    catchMove
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowOneLineTip(false)
                    }}
                  >
                    <View
                      className='one-line-tip'
                      id='one-line-tip'
                      style={{
                        top: `${oneLineTipStyle.top}px`,
                        left: `${oneLineTipStyle.left}px`,
                        width: `${oneLineTipStyle.width}px`,
                      }}
                    >
                      <Text className='guide-text'>{taskStrings.modal.oneLineTip}</Text>
                      <Text className='one-line-tip-strong'>{taskStrings.modal.oneLineTipStrong}</Text>
                    </View>
                  </View>
                )}

                <View className='modal-section bubble soft'>
                  <Text className='modal-label'>{taskStrings.modal.detailLabel}</Text>
                  <Input
                    className='modal-input'
                  value={titleInput}
                  onInput={(e) => setTitleInput(e.detail.value)}
                  placeholder={taskStrings.modal.titlePlaceholder}
                />
                <Textarea
                  className='modal-textarea'
                  value={descInput}
                  onInput={(e) => setDescInput(e.detail.value)}
                  placeholder={taskStrings.modal.detailPlaceholder}
                />
                <View className='sub-card'>
                  <View className='modal-row task-step-head'>
                    <View className='task-step-text'>
                      <Text className='modal-label'>{taskStrings.modal.goalsLabel}</Text>
                      <Text className='modal-hint'>{taskStrings.modal.goalsHint}</Text>
                    </View>
                    <Button className='modal-add compact' onClick={handleAddSubtask}>
                      {taskStrings.modal.addGoal}
                    </Button>
                  </View>
                  <View className='subtask-list'>
                    {subtasks.map((s, idx) => (
                      <View key={idx} className='subtask-row'>
                        <Input
                          className='subtask-input'
                          value={s.title}
                          onInput={(e) => handleSubtaskChange(idx, 'title', e.detail.value)}
                          placeholder={taskStrings.modal.goalPlaceholder}
                        />
                        <Input
                          className='subtask-num'
                          type='number'
                          value={String(s.total)}
                          onInput={(e) => handleSubtaskChange(idx, 'total', e.detail.value)}
                          placeholder={taskStrings.modal.goalTotalPlaceholder}
                        />
                        <Button
                          className='subtask-remove'
                          disabled={subtasks.length <= 1}
                          onClick={() => handleRemoveSubtask(idx)}
                        >
                          {taskStrings.modal.removeGoalIcon}
                        </Button>
                      </View>
                    ))}
                  </View>
                </View>
                <View className='due-row'>
                  <Text className='modal-label'>{taskStrings.modal.dueLabel}</Text>
                  <View className='due-pickers'>
                    <Picker
                      mode='selector'
                      range={yearOptions.map(String)}
                      value={Math.max(yearOptions.indexOf(dueYear), 0)}
                      onChange={(e) => setDueYear(yearOptions[Number(e.detail.value)])}
                    >
                      <View className='picker-pill'>
                        {dueYear}
                        {taskStrings.time.year}
                      </View>
                    </Picker>
                    <Picker
                      mode='selector'
                      range={monthOptions.map((m) => `${m}${taskStrings.time.month}`)}
                      value={Math.max(monthOptions.indexOf(dueMonth), 0)}
                      onChange={(e) => setDueMonth(monthOptions[Number(e.detail.value)])}
                    >
                      <View className='picker-pill'>
                        {pad2(dueMonth)}
                        {taskStrings.time.month}
                      </View>
                    </Picker>
                    <Picker
                      mode='selector'
                      range={dayOptions.map((d) => `${d}${taskStrings.time.day}`)}
                      value={Math.max(dayOptions.indexOf(dueDay), 0)}
                      onChange={(e) => setDueDay(dayOptions[Number(e.detail.value)])}
                    >
                      <View className='picker-pill'>
                        {pad2(dueDay)}
                        {taskStrings.time.day}
                      </View>
                    </Picker>
                    <Picker
                      mode='selector'
                      range={hourOptions.map((h) => `${pad2(h)}${taskStrings.time.hour}`)}
                      value={Math.max(hourOptions.indexOf(dueHour), 0)}
                      onChange={(e) => setDueHour(hourOptions[Number(e.detail.value)])}
                    >
                      <View className='picker-pill'>
                        {pad2(dueHour)}
                        {taskStrings.time.hour}
                      </View>
                    </Picker>
                    <Picker
                      mode='selector'
                      range={minuteOptions.map((m) => `${pad2(m)}${taskStrings.time.minute}`)}
                      value={Math.max(minuteOptions.indexOf(dueMinute), 0)}
                      onChange={(e) => setDueMinute(minuteOptions[Number(e.detail.value)])}
                    >
                      <View className='picker-pill'>
                        {pad2(dueMinute)}
                        {taskStrings.time.minute}
                      </View>
                    </Picker>
                  </View>
                  <Text className='modal-hint inline'>{taskStrings.modal.dueHintDefault}</Text>
                  <Text className='modal-hint inline'>
                    {taskStrings.modal.dueHintCurrentPrefix}
                    {dueDisplay}
                  </Text>
                </View>
              </View>

              <View className='modal-section bubble soft'>
                <Text className='modal-label'>{taskStrings.modal.rewardLabel}</Text>
                <Text className='modal-hint'>{taskStrings.modal.rewardHint}</Text>
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
                {taskStrings.modal.cancel}
              </Button>
              {reworkTaskId ? (
                <Button
                  className='modal-submit'
                  loading={creating}
                  onClick={() => void handleSubmitCreate()}
                >
                  {taskStrings.modal.submitRework}
                </Button>
              ) : (
                <>
                  <Button className='modal-self' loading={creating} onClick={handleSubmitCreateSelf}>
                    {taskStrings.modal.submitSelf}
                  </Button>
                  <Button
                    className='modal-submit'
                    loading={creating}
                    onClick={() => void handleSubmitCreate()}
                  >
                    {taskStrings.modal.submitNew}
                  </Button>
                </>
              )}
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
                <Text className='modal-title'>{taskStrings.modal.historyTitle}</Text>
                <Text className='modal-sub'>{taskStrings.modal.historySub}</Text>
              </View>
              <Text className='modal-close' onClick={handleCloseHistory}>
                {taskStrings.modal.closeIcon}
              </Text>
            </View>
            <View className='modal-body'>
              {historyLoading || !historyTask ? (
                <Text className='modal-hint'>{taskStrings.modal.loading}</Text>
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
                <Text className='modal-title'>{taskStrings.modal.confirmTitle}</Text>
              </View>
              <Text className='modal-close' onClick={handleCancelConfirmRework}>
                {taskStrings.modal.closeIcon}
              </Text>
            </View>
            <View className='modal-body'>
              <Text className='modal-hint'>
                {taskStrings.modal.confirmContent}
              </Text>
            </View>
            <View className='modal-actions'>
              <Button className='modal-cancel' onClick={handleCancelConfirmRework}>
                {taskStrings.toast.reworkConfirmCancel}
              </Button>
              <Button className='modal-submit' loading={creating} onClick={handleConfirmRework}>
                {taskStrings.toast.reworkConfirmOk}
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
