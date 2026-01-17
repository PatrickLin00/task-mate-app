import { View, Text, ScrollView, Button, Image, Slider } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type Attr,
  type RoadTask,
  type Subtask,
  attrIcon,
  attrTone as attrToneMap,
  defaultCreatedAt,
  chipText,
  catIdleFrames,
  summarizeSubtasksProgress,
  humanizeRemain,
  formatDueLabel,
} from '../shared/mocks'
import {
  abandonTask,
  acceptTask,
  acceptReworkTask,
  acceptChallengeTask,
  completeTask,
  submitReview,
  fetchChallengeTasks,
  fetchTodayTasks,
  getTask,
  patchProgress,
  rejectReworkTask,
  type Task,
} from '@/services/api'
import { ensureWeappLogin } from '@/services/auth'
import { requestTaskSubscribeAuth } from '@/services/subscribe'
import { taskStrings } from '../shared/strings'

const attrList: Attr[] = [
  taskStrings.rewards.wisdom.label,
  taskStrings.rewards.strength.label,
  taskStrings.rewards.agility.label,
]
const attrToneHome: Record<Attr, 'blue' | 'red' | 'yellow'> = {
  [taskStrings.rewards.wisdom.label]: 'blue',
  [taskStrings.rewards.strength.label]: 'red',
  [taskStrings.rewards.agility.label]: 'yellow',
}
const attrMeta: Record<Attr, { icon: string }> = {
  [taskStrings.rewards.wisdom.label]: { icon: taskStrings.home.statsIcons.wisdom },
  [taskStrings.rewards.strength.label]: { icon: taskStrings.home.statsIcons.strength },
  [taskStrings.rewards.agility.label]: { icon: taskStrings.home.statsIcons.agility },
}
const heroStars = 0
const heroStats: Record<Attr, number> = attrList.reduce(
  (acc, attr) => {
    acc[attr] = 0
    return acc
  },
  {} as Record<Attr, number>
)

const UI = {
  stars: taskStrings.home.stars,
  timelineIcon: taskStrings.home.timelineIcon,
  challengeIcon: taskStrings.home.challengeIcon,
  calendarIcon: taskStrings.home.calendarIcon,
}

const homeStrings = taskStrings.home

const FRAME_DURATION = 240
const POLL_INTERVAL = 30 * 1000

const mergeById = <T extends { id: string }>(prev: T[], next: T[]) => {
  const nextMap = new Map(next.map((item) => [item.id, item]))
  const prevIds = new Set(prev.map((item) => item.id))
  const kept = prev.map((item) => nextMap.get(item.id)).filter(Boolean) as T[]
  const appended = next.filter((item) => !prevIds.has(item.id))
  return [...kept, ...appended]
}

const calcPercent = (current: number, total: number) =>
  Math.min(100, Math.round((current / Math.max(1, total || 1)) * 100))

const pad2 = (num: number) => (num < 10 ? `0${num}` : `${num}`)

const formatStartDate = (iso?: string) => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`
}

type HomePaneProps = {
  isActive?: boolean
  authVersion?: number
  openTaskId?: string
  heroName?: string
  nameGateActive?: boolean
}

export default function HomePane({
  isActive = true,
  authVersion = 0,
  openTaskId,
  heroName,
  nameGateActive = false,
}: HomePaneProps) {
  const [todayTasks, setTodayTasks] = useState<RoadTask[]>([])
  const pollingBusyRef = useRef(false)
  const [feedTasks, setFeedTasks] = useState<RoadTask[]>([])
  const visibleTasks = useMemo(() => feedTasks, [feedTasks])
  const quietLine = useMemo(
    () => homeStrings.quietLines[Math.floor(Math.random() * homeStrings.quietLines.length)],
    []
  )
  const challengeLine = useMemo(
    () => homeStrings.challengeQuietLines[Math.floor(Math.random() * homeStrings.challengeQuietLines.length)],
    []
  )
  const [frameIndex, setFrameIndex] = useState(0)
  const [modalTask, setModalTask] = useState<RoadTask | null>(null)
  const [showTodayTip, setShowTodayTip] = useState(false)
  const [todayTipStyle, setTodayTipStyle] = useState({ top: 0, left: 0, width: 0 })
  const [dialogEditing, setDialogEditing] = useState(false)
  const [dialogDraft, setDialogDraft] = useState<Subtask[]>([])
  const [shareOnly, setShareOnly] = useState(false)
  const [dialogDragValues, setDialogDragValues] = useState<Record<string, number>>({})
  const handledShareIdRef = useRef<string | null>(null)
  const taskDebug = TASK_DEBUG

  const resolveDisplayName = (name?: string | null, id?: string | null) => {
    const rawId = String(id || '')
    if (!rawId) return ''
    const trimmed = String(name || '').trim()
    const candidate = trimmed || rawId
    if (candidate === rawId) return taskStrings.labels.unnamed
    return candidate
  }

  const mapRewardToAttr = (val: 'wisdom' | 'strength' | 'agility') => {
    if (val === 'wisdom') return taskStrings.rewards.wisdom.label
    if (val === 'strength') return taskStrings.rewards.strength.label
    return taskStrings.rewards.agility.label
  }

  const mapApiTaskToRoad = (task: Task): RoadTask => {
    const attr = mapRewardToAttr(task.attributeReward.type)
    const baseId = task._id || 'task'
    const isChallenge = Boolean(task.seedKey?.startsWith('challenge_'))
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
    const dueAt = task.dueAt

    return {
      id: task._id || Math.random().toString(36).slice(2),
      title: task.title,
      detail: task.detail || '',
      attr,
      type: attr,
      icon: task.icon || attrIcon[attr],
      points: task.attributeReward.value,
      createdAt: task.createdAt || defaultCreatedAt,
      status: task.status,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId ?? null,
      creatorName: isChallenge
        ? taskStrings.labels.creatorSystem
        : resolveDisplayName(task.creatorName || task.creatorId, task.creatorId),
      assigneeName: task.assigneeId
        ? resolveDisplayName(task.assigneeName || task.assigneeId, task.assigneeId)
        : '',
      seedKey: task.seedKey ?? null,
      dueAt,
      due: formatDueLabel(dueAt),
      remain: humanizeRemain(dueAt),
      progress: { current: progress.current, total: progress.total || 1 },
      subtasks,
      difficulty: task.attributeReward.value >= 20 ? taskStrings.labels.difficultyMid : taskStrings.labels.difficultyEasy,
      isChallenge,
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((idx) => (idx + 1) % catIdleFrames.length)
    }, FRAME_DURATION)
    return () => clearInterval(timer)
  }, [])

  useLoad(() => {})

  const handlePlaceholder = (title: string) => {
    Taro.showToast({ title, icon: 'none' })
  }

  const handleMiniCardPress = (task: RoadTask) => {
    if (nameGateActive) return
    setModalTask(task)
    setDialogEditing(false)
    setDialogDraft([])
  }

  const handleCloseModal = () => {
    setModalTask(null)
    setDialogEditing(false)
    setDialogDraft([])
    setDialogDragValues({})
    setShareOnly(false)
  }

  const handleStartDialogEdit = () => {
    if (shareOnly) return
    if (!modalTask?.subtasks?.length) return
    setDialogEditing(true)
    setDialogDraft(modalTask.subtasks.map((s) => ({ ...s })))
    setDialogDragValues({})
  }

  const handleDialogDraftChange = (id: string, val: number) => {
    setDialogDraft((prev) => prev.map((s) => (s.id === id ? { ...s, current: val } : s)))
  }

  const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
  const snapSubtaskValue = (value: number, total: number) => clampValue(Math.round(value), 0, total)

  const handleDialogDrag = (id: string, value: number) => {
    setDialogDragValues((prev) => ({ ...prev, [id]: value }))
  }

  const handleDialogDragCommit = (id: string, value: number, total: number) => {
    const snapped = snapSubtaskValue(value, total)
    setDialogDragValues((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    handleDialogDraftChange(id, snapped)
  }

  const handleDialogSubmit = async () => {
    if (!modalTask || dialogDraft.length === 0) return
    try {
      for (let i = 0; i < dialogDraft.length; i += 1) {
        await patchProgress(modalTask.id, { subtaskIndex: i, current: dialogDraft[i].current })
      }
      const progress = summarizeSubtasksProgress(dialogDraft)
      const nextTask = { ...modalTask, subtasks: dialogDraft, progress }
      setModalTask(nextTask)
      setTodayTasks((prev) => prev.map((t) => (t.id === nextTask.id ? nextTask : t)))
      Taro.showToast({ title: taskStrings.toast.submitted, icon: 'success' })
    } catch (err) {
      console.error('update progress error', err)
      await refreshAfterNotice()
    } finally {
      setDialogEditing(false)
      setDialogDraft([])
    }
  }

  const handleDialogCancel = () => {
    setDialogEditing(false)
    setDialogDraft([])
  }

  const handleAcceptChallenge = async (taskId: string) => {
    try {
      await requestTaskSubscribeAuth()
      await acceptChallengeTask(taskId)
      Taro.showToast({ title: taskStrings.toast.createAccepted, icon: 'success' })
      await refreshHomeTasks()
    } catch (err) {
      console.error('accept challenge error', err)
      await refreshAfterNotice()
    }
  }

  const handleDialogAbandon = async () => {
    if (!modalTask) return
    const result = await Taro.showModal({
      title: taskStrings.toast.abandonTitle,
      content: taskStrings.toast.abandonContent,
      confirmText: taskStrings.toast.abandonOk,
      cancelText: taskStrings.toast.cancel,
    })
    if (!result.confirm) return
    try {
      await abandonTask(modalTask.id)
      Taro.showToast({ title: taskStrings.toast.abandoned, icon: 'success' })
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
      await refreshHomeTasks()
    } catch (err) {
      console.error('abandon task error', err)
      await refreshAfterNotice()
    }
  }

  const handleDialogComplete = async () => {
    if (!modalTask) return
    try {
      await completeTask(modalTask.id)
      Taro.showToast({ title: taskStrings.toast.completed, icon: 'success' })
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
      await refreshHomeTasks()
    } catch (err) {
      console.error('complete task error', err)
      await refreshAfterNotice()
    }
  }

  const handleDialogAccept = async () => {
    if (!modalTask) return
    try {
      await requestTaskSubscribeAuth()
      await acceptTask(modalTask.id)
      Taro.showToast({ title: taskStrings.toast.accepted, icon: 'success' })
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
      setShareOnly(false)
      await refreshHomeTasks()
    } catch (err) {
      console.error('accept task error', err)
      const errData = (err as any)?.data
      const errMessage = (err as any)?.message
      const isExpired = errMessage === 'task expired' || errData?.error === 'task expired'
      if (isExpired) {
        Taro.showToast({ title: taskStrings.toast.taskExpired, icon: 'none' })
        await refreshHomeTasks()
        return
      }
      const refreshed = await refreshModalTask(modalTask.id)
      if (refreshed) return
      await refreshAfterNotice()
    }
  }

  const handleDialogSubmitReview = async () => {
    if (!modalTask) return
    const progress = dialogProgress || { current: 0, total: 1 }
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
      await submitReview(modalTask.id)
      Taro.showToast({ title: taskStrings.toast.submitted, icon: 'success' })
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
      await refreshHomeTasks()
    } catch (err) {
      console.error('submit review error', err)
      await refreshAfterNotice()
    }
  }

  const handleDialogReworkAccept = async () => {
    if (!modalTask) return
    try {
      await requestTaskSubscribeAuth()
      await acceptReworkTask(modalTask.id)
      Taro.showToast({ title: taskStrings.toast.accepted, icon: 'success' })
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
      setShareOnly(false)
      await refreshHomeTasks()
    } catch (err) {
      console.error('accept rework error', err)
      await refreshAfterNotice()
    }
  }

  const handleDialogReworkReject = async () => {
    if (!modalTask) return
    try {
      await rejectReworkTask(modalTask.id)
      Taro.showToast({ title: taskStrings.toast.rejected, icon: 'success' })
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
      setShareOnly(false)
      await refreshHomeTasks()
    } catch (err) {
      console.error('reject rework error', err)
      await refreshAfterNotice()
    }
  }

  const dialogSubtasks = dialogEditing && dialogDraft.length > 0 ? dialogDraft : modalTask?.subtasks
  const dialogSubtasksDisplay =
    dialogEditing && dialogSubtasks
      ? dialogSubtasks.map((s) => {
          const dragValue = dialogDragValues[s.id]
          if (typeof dragValue !== 'number') return s
          return { ...s, current: snapSubtaskValue(dragValue, s.total) }
        })
      : dialogSubtasks
  const dialogProgress =
    dialogEditing && dialogSubtasksDisplay
      ? summarizeSubtasksProgress(dialogSubtasksDisplay)
      : modalTask?.progress
  const dialogRemain = modalTask?.dueAt ? humanizeRemain(modalTask.dueAt) : modalTask?.remain
  const dialogDueLabel = modalTask?.dueAt ? formatDueLabel(modalTask.dueAt) : modalTask?.due
  const dialogStartLabel = modalTask?.createdAt ? formatStartDate(modalTask.createdAt) : undefined
  const dialogCreatorLabel = modalTask?.creatorId
    ? resolveDisplayName(modalTask?.creatorName || modalTask?.creatorId, modalTask?.creatorId)
    : ''
  const dialogPendingConfirm = modalTask?.status === 'pending_confirmation'
  const dialogUseComplete = Boolean(
    modalTask?.isChallenge ||
      (modalTask?.creatorId && modalTask?.assigneeId && modalTask.creatorId === modalTask.assigneeId)
  )
  const dialogReviewLabel = dialogUseComplete ? taskStrings.actions.completeTask : taskStrings.actions.submitReview
  const dialogReviewIcon = dialogUseComplete
    ? taskStrings.icons.actions.completeTask
    : taskStrings.icons.actions.submitReview
  const dialogReviewHandler = dialogUseComplete
    ? handleDialogComplete
    : handleDialogSubmitReview
  const dialogShareTaken = Boolean(
    shareOnly &&
      modalTask &&
      (modalTask.status !== 'pending' || (modalTask.assigneeId && modalTask.assigneeId !== ''))
  )

  const refreshHomeTasks = async (showNotice = false, shouldCancel?: () => boolean) => {
    try {
      const [todayRes, challenge] = await Promise.all([fetchTodayTasks(), fetchChallengeTasks()])
      if (shouldCancel?.()) return
      setTodayTasks((todayRes.tasks || []).map((t) => mapApiTaskToRoad(t)))
      setFeedTasks((challenge || []).map((t) => mapApiTaskToRoad(t)))
      if (showNotice) {
        Taro.showToast({ title: taskStrings.toast.dataRefreshed, icon: 'none' })
      }
    } catch (err) {
      console.error('load home tasks error', err)
      if (shouldCancel?.()) return
      setTodayTasks([])
      setFeedTasks([])
      if (showNotice) {
        Taro.showToast({ title: taskStrings.toast.dataRefreshed, icon: 'none' })
      }
    }
  }

  const refreshModalTask = async (taskId: string) => {
    try {
      const updated = await getTask(taskId)
      const mapped = mapApiTaskToRoad(updated)
      setModalTask(mapped)
      setTodayTasks((prev) => mergeById(prev, [mapped]))
      setFeedTasks((prev) => mergeById(prev, [mapped]))
      return mapped
    } catch (err) {
      const status = (err as any)?.status || (err as any)?.response?.status
      if (status === 404) {
        setModalTask(null)
        setShareOnly(false)
      }
      if (taskDebug) {
        console.log('refreshModalTask failed', { taskId, status })
      }
      return null
    }
  }

  const refreshAfterNotice = async () => {
    if (modalTask) {
      await refreshModalTask(modalTask.id)
      Taro.showToast({ title: taskStrings.toast.dataRefreshed, icon: 'none' })
      return
    }
    await refreshHomeTasks(true)
  }

  const refreshHomeTasksSilent = async (shouldCancel?: () => boolean) => {
    if (pollingBusyRef.current) return
    pollingBusyRef.current = true
    try {
      const [todayRes, challenge] = await Promise.all([fetchTodayTasks(), fetchChallengeTasks()])
      if (shouldCancel?.()) return
      const nextToday = (todayRes.tasks || []).map((t) => mapApiTaskToRoad(t))
      const nextFeed = (challenge || []).map((t) => mapApiTaskToRoad(t))
      setTodayTasks((prev) => mergeById(prev, nextToday))
      setFeedTasks((prev) => mergeById(prev, nextFeed))
      if (taskDebug) {
        console.log('refreshHomeTasks diff', {
          todayCount: nextToday.length,
          feedCount: nextFeed.length,
        })
      }
    } catch (err) {
      console.error('load home tasks error', err)
    } finally {
      pollingBusyRef.current = false
    }
  }

  useEffect(() => {
    if (nameGateActive && modalTask) {
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
      setDialogDragValues({})
      setShareOnly(false)
    }
  }, [nameGateActive, modalTask])

  useEffect(() => {
    if (!isActive && modalTask) {
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
      setShareOnly(false)
    }
  }, [isActive, modalTask])

  useEffect(() => {
    if (!isActive) return
    let cancelled = false
    void refreshHomeTasks(false, () => cancelled)
    return () => {
      cancelled = true
    }
  }, [authVersion, isActive])

  useEffect(() => {
    if (!isActive) return
    if (dialogEditing) return
    let cancelled = false
    const cancelCheck = () => cancelled
    const timer = setInterval(() => {
      void refreshHomeTasksSilent(cancelCheck)
    }, POLL_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isActive, dialogEditing, shareOnly, modalTask])

  const openTodayTip = () => {
    const query = Taro.createSelectorQuery()
    query.select('#today-help-anchor').boundingClientRect()
    query.exec((res) => {
      const rect = res?.[0]
      const { windowWidth } = Taro.getSystemInfoSync()
      const width = Math.min(320, windowWidth - 32)
      const left = rect
        ? Math.min(windowWidth - width - 16, Math.max(16, rect.left - 8))
        : Math.max(16, (windowWidth - width) / 2)
      const top = rect ? rect.bottom + 8 : 140
      setTodayTipStyle({ top, left, width })
      setShowTodayTip(true)
    })
  }

  useEffect(() => {
    if (!isActive || !modalTask || dialogEditing) return
    let cancelled = false
    const taskId = modalTask.id
    const timer = setInterval(() => {
      if (cancelled) return
      void refreshModalTask(taskId)
    }, POLL_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isActive, modalTask?.id, dialogEditing])

  useEffect(() => {
    if (taskDebug) {
      console.log('share effect state', { openTaskId, handledShareId: handledShareIdRef.current })
    }
    if (nameGateActive) {
      if (taskDebug) console.log('share load skipped', { reason: 'name gate active' })
      return
    }
    if (!openTaskId) {
      if (taskDebug) console.log('share load skipped', { reason: 'missing openTaskId' })
      return
    }
    if (openTaskId === handledShareIdRef.current) {
      if (taskDebug) console.log('share load skipped', { reason: 'already handled', openTaskId })
      return
    }
    let active = true
    if (taskDebug) {
      console.log('share openTaskId received', { openTaskId })
    }
    handledShareIdRef.current = openTaskId
    const loadSharedTask = async () => {
      try {
        if (taskDebug) console.log('share load start', { openTaskId })
        await ensureWeappLogin()
        if (!active) return
        if (taskDebug) console.log('share login ok', { openTaskId })
        const task = await getTask(openTaskId)
        if (!active) return
        const mapped = mapApiTaskToRoad(task)
        setModalTask(mapped)
        setDialogEditing(false)
        setDialogDraft([])
        setShareOnly(true)
        if (taskDebug) {
          console.log('share task loaded', { taskId: mapped.id, status: mapped.status })
        }
      } catch (err) {
        console.error('load share task error', err)
        if (!active) return
        setShareOnly(false)
        Taro.showToast({ title: taskStrings.toast.loadFail, icon: 'none' })
      }
    }
    if (taskDebug) console.log('share load invoke', { openTaskId })
    void loadSharedTask()
    return () => {
      active = false
    }
  }, [openTaskId, nameGateActive])

  return (
    <View className='home-pane'>
      <View id='hero' className='hero card'>
        <View className='hero-panel'>
          <View className='hero-avatar'>
            <View className='avatar-wrap'>
              <View className='avatar'>
                <Image
                  className='avatar-frame'
                  src={catIdleFrames[frameIndex]}
                  mode='aspectFill'
                  alt='hero-cat'
                />
              </View>
              <View className='badge'>{homeStrings.heroBadge}</View>
            </View>
            <View className='hero-info'>
              <Text className='hero-name'>{heroName || taskStrings.home.heroName}</Text>
              <Text className='hero-stars'>{UI.stars.slice(0, heroStars)}</Text>
            </View>
          </View>
          <View className='hero-pill'>
            <Text>{homeStrings.heroPill}</Text>
          </View>
        </View>
        <View className='hero-stats'>
          {attrList.map((attr) => (
            <View key={attr} className='stat'>
              <View className='stat-label'>
                <View className={`stat-icon ${attrToneHome[attr]}`}>
                  <Text aria-hidden>{attrMeta[attr].icon}</Text>
                </View>
                <Text className='label'>{attr}</Text>
              </View>
              <View className='track'>
                <View className={`fill ${attrToneHome[attr]}`} style={{ width: `${heroStats[attr]}%` }} />
              </View>
              <Text className='val'>{heroStats[attr]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View id='today' className='section card'>
        <View className='section-bar'>
          <View className='section-head'>
            <Text className='section-icon'>{UI.timelineIcon}</Text>
            <View className='today-title'>
              <Text className='section-title'>{homeStrings.todayTitle}</Text>
              <View
                id='today-help-anchor'
                className='today-help'
                onClick={openTodayTip}
              >
                <Text>?</Text>
              </View>
            </View>
          </View>
          <Text className='section-meta'>
            {homeStrings.todayMeta} - {todayTasks.length} {homeStrings.todayUnit}
          </Text>
        </View>
        {showTodayTip && (
          <View
            className='today-tip-mask'
            catchMove
            onClick={() => {
              setShowTodayTip(false)
            }}
          >
            <View
              className='today-tip'
              style={{
                top: `${todayTipStyle.top}px`,
                left: `${todayTipStyle.left}px`,
                width: `${todayTipStyle.width}px`,
              }}
            >
              <Text>{homeStrings.todayTip}</Text>
            </View>
          </View>
        )}
        {todayTasks.length > 0 ? (
          <ScrollView className='mini-cards' scrollX enableFlex scrollWithAnimation>
            {todayTasks.map((t) => (
              <View
                key={t.id}
                className={`mini-card tone-${attrToneHome[t.type]}`}
                onClick={() => handleMiniCardPress(t)}
              >
                <View className='mini-header'>
                  <View className='mini-title-row'>
                    <View className='mini-icon'>
                      <Text className='emoji'>{t.icon}</Text>
                    </View>
                    <Text className='mini-title'>{t.title}</Text>
                  </View>
                  <View className={`mini-chip tone-${attrToneHome[t.type]}`}>{chipText(t)}</View>
                </View>
                <Text className='mini-desc'>{t.detail}</Text>
                <View className='mini-foot'>
                  <Text className='due'>
                    {UI.calendarIcon} {t.due}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View className='mini-empty'>
            <Text>{quietLine}</Text>
          </View>
        )}
      </View>

      <View className='section card feed-section'>
        <View id='feed-head' className='feed-head'>
          <View className='section-head'>
            <Text className='section-icon'>{UI.challengeIcon}</Text>
            <Text className='section-title'>{homeStrings.feedTitle}</Text>
          </View>
          <Text className='section-meta'>
            {feedTasks.length} {homeStrings.feedUnit}
          </Text>
        </View>
        <View className='feed-scroll-shell'>
          {visibleTasks.length > 0 ? (
            <ScrollView scrollY scrollWithAnimation className='feed-scroll'>
              <View className='feed-list'>
                {visibleTasks.map((t) => (
                  <View className={`feed-card tone-${attrToneHome[t.type]}`} key={t.id}>
                    <View className='feed-left'>
                      <Text className='emoji'>{t.icon}</Text>
                    </View>
                    <View className='feed-body'>
                      <Text className='feed-title'>{t.title}</Text>
                      <Text className='feed-desc'>{t.detail}</Text>
                      <View className='feed-meta'>
                        <Text className='feed-due'>{t.due}</Text>
                      </View>
                    </View>
                    <View className='feed-side'>
                      <View className={`feed-chip tone-${attrToneHome[t.type]}`}>{chipText(t)}</View>
                      <Button
                        className='cta'
                        hoverClass='pressing'
                        hoverStartTime={0}
                        hoverStayTime={120}
                        hoverStopPropagation
                        onClick={() => void handleAcceptChallenge(t.id)}
                      >
                        {homeStrings.button}
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <View className='feed-empty'>
              <Text>{challengeLine}</Text>
            </View>
          )}
        </View>
      </View>

      {modalTask && (
        <View className='mini-dialog-overlay' onClick={handleCloseModal}>
          <View
            className='mini-dialog-wrap'
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <View className={`mini-dialog card task-card tone-${attrToneMap[modalTask.attr]}`}>
              <View className='dialog-head'>
                <View className='mini-icon'>
                  <Text className='emoji'>{modalTask.icon}</Text>
                </View>
                <View className='dialog-title-wrap'>
                  <Text className='dialog-title'>{modalTask.title}</Text>
                  <View className={`mini-chip tone-${attrToneHome[modalTask.type]}`}>
                    {chipText(modalTask)}
                  </View>
                </View>
              </View>

              <View className='dialog-attr'>
                <View className={`attr-tag tone-${attrToneMap[modalTask.attr]}`}>
                  <Text className='tag-icon'>{attrIcon[modalTask.attr]}</Text>
                  <Text className='tag-text'>
                    {modalTask.attr}+{modalTask.points}
                  </Text>
                </View>
              </View>

              <Text className='dialog-desc'>{modalTask.detail}</Text>

              <View className='dialog-meta'>
                {dialogRemain && <Text>{homeStrings.dialogRemainPrefix} {dialogRemain}</Text>}
                {dialogCreatorLabel && (
                  <Text>
                    {taskStrings.icons.meta.creator} {taskStrings.metaText.creator} {dialogCreatorLabel}
                  </Text>
                )}
                {dialogDueLabel && <Text>{homeStrings.dialogDuePrefix} {dialogDueLabel}</Text>}
                {dialogStartLabel && <Text>{homeStrings.dialogStartPrefix} {dialogStartLabel}</Text>}
              </View>

              {dialogProgress && (
                <View className='progress'>
                  <View className='progress-head'>
                    <Text className='progress-label'>
                      {taskStrings.labels.progress} {dialogProgress.current}/{dialogProgress.total}
                    </Text>
                    <Text className='progress-percent'>
                      {calcPercent(dialogProgress.current, dialogProgress.total)}%
                    </Text>
                  </View>
                  <View className='progress-track'>
                    <View
                      className='progress-fill'
                      style={{ width: `${calcPercent(dialogProgress.current, dialogProgress.total)}%` }}
                    />
                  </View>
                </View>
              )}

              {dialogSubtasksDisplay && dialogSubtasksDisplay.length > 0 && (
                <View className='dialog-steps'>
                  <View className='dialog-steps-head'>
                    <Text className='dialog-step-label'>{homeStrings.dialogStepLabel}</Text>
                    <Text className='dialog-step-hint'>
                      {dialogEditing ? homeStrings.dialogStepHintEdit : homeStrings.dialogStepHintView}
                    </Text>
                  </View>
                  {dialogSubtasksDisplay.map((s) => {
                    const dragValue = dialogDragValues[s.id]
                    const rawValue = typeof dragValue === 'number' ? dragValue : s.current
                    const displayCurrent =
                      typeof dragValue === 'number' ? snapSubtaskValue(dragValue, s.total) : s.current
                    const percent = calcPercent(displayCurrent, s.total)
                    return (
                      <View className='dialog-step' key={s.id}>
                        <View className='dialog-step-row'>
                          <Text className='dialog-step-title'>{s.title}</Text>
                          <Text className='dialog-step-count'>
                            {displayCurrent}/{s.total}
                          </Text>
                        </View>
                        {dialogEditing ? (
                          <Slider
                            className='dialog-step-slider'
                            min={0}
                            max={s.total}
                            step={0.01}
                            value={rawValue}
                            activeColor='#7c3aed'
                            backgroundColor='#e5e7eb'
                            onChanging={(e) => handleDialogDrag(s.id, Number(e.detail.value))}
                            onChange={(e) =>
                              handleDialogDragCommit(s.id, Number(e.detail.value), s.total)
                            }
                          />
                        ) : (
                          <View className='dialog-step-track'>
                            <View className='dialog-step-fill' style={{ width: `${percent}%` }} />
                          </View>
                        )}
                      </View>
                    )
                  })}
                </View>
              )}

              <View className='action-row'>
                {dialogPendingConfirm ? (
                  <>
                    <View
                      className='task-action'
                      hoverClass='pressing'
                      hoverStartTime={0}
                      hoverStayTime={120}
                      hoverStopPropagation
                      onClick={handleDialogReworkAccept}
                    >
                      <Text className='action-icon'>{taskStrings.icons.actions.acceptRework}</Text>
                      <Text>{taskStrings.actions.acceptRework}</Text>
                    </View>
                    <View
                      className='task-action ghost'
                      hoverClass='pressing'
                      hoverStartTime={0}
                      hoverStayTime={120}
                      hoverStopPropagation
                      onClick={handleDialogReworkReject}
                    >
                      <Text className='action-icon'>{taskStrings.icons.actions.rejectRework}</Text>
                      <Text>{taskStrings.actions.rejectRework}</Text>
                    </View>
                  </>
                ) : shareOnly ? (
                  <View
                    className='task-action'
                    hoverClass='pressing'
                    hoverStartTime={0}
                    hoverStayTime={120}
                    hoverStopPropagation
                    onClick={dialogShareTaken ? handleCloseModal : handleDialogAccept}
                  >
                    <Text className='action-icon'>{taskStrings.icons.actions.acceptTask}</Text>
                    <Text>
                      {dialogShareTaken ? taskStrings.actions.shareTakenClose : taskStrings.actions.acceptTask}
                    </Text>
                  </View>
                ) : (
                  <>
                    {dialogEditing ? (
                      <View
                        className='task-action'
                        hoverClass='pressing'
                        hoverStartTime={0}
                        hoverStayTime={120}
                        hoverStopPropagation
                        onClick={handleDialogSubmit}
                      >
                        <Text className='action-icon'>{taskStrings.icons.actions.submitChange}</Text>
                        <Text>{taskStrings.actions.submitChange}</Text>
                      </View>
                    ) : (
                      <View
                        className='task-action'
                        hoverClass='pressing'
                        hoverStartTime={0}
                        hoverStayTime={120}
                        hoverStopPropagation
                        onClick={handleStartDialogEdit}
                      >
                        <Text className='action-icon'>{taskStrings.icons.actions.updateProgress}</Text>
                        <Text>{taskStrings.actions.updateProgress}</Text>
                      </View>
                    )}
                    <View
                      className='task-action'
                      hoverClass='pressing'
                      hoverStartTime={0}
                      hoverStayTime={120}
                      hoverStopPropagation
                      onClick={dialogReviewHandler}
                    >
                      <Text className='action-icon'>{dialogReviewIcon}</Text>
                      <Text>{dialogReviewLabel}</Text>
                    </View>
                    {dialogEditing ? (
                      <View
                        className='task-action ghost'
                        hoverClass='pressing'
                        hoverStartTime={0}
                        hoverStayTime={120}
                        hoverStopPropagation
                        onClick={handleDialogCancel}
                      >
                        <Text className='action-icon'>{taskStrings.icons.actions.cancelChange}</Text>
                        <Text>{taskStrings.actions.cancelChange}</Text>
                      </View>
                    ) : (
                      <View
                        className='task-action ghost'
                        hoverClass='pressing'
                        hoverStartTime={0}
                        hoverStayTime={120}
                        hoverStopPropagation
                        onClick={handleDialogAbandon}
                      >
                        <Text className='action-icon'>{taskStrings.icons.actions.abandonTask}</Text>
                        <Text>{taskStrings.actions.abandonTask}</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>

            <Text className='dialog-hint'>{homeStrings.dialogHint}</Text>
          </View>
        </View>
      )}
    </View>
  )
}
