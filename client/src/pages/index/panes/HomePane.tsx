import { View, Text, ScrollView, Button, Image, Slider } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import {
  type Attr,
  type RoadTask,
  type Subtask,
  attrIcon,
  attrTone as attrToneMap,
  defaultCreatedAt,
  chipText,
  quietLines,
  challengeQuietLines,
  catIdleFrames,
  summarizeSubtasksProgress,
  humanizeRemain,
  formatDueLabel,
} from '../shared/mocks'
import {
  abandonTask,
  acceptChallengeTask,
  fetchChallengeTasks,
  fetchTodayTasks,
  patchProgress,
  type Task,
} from '@/services/api'

const attrList: Attr[] = ['智慧', '力量', '敏捷']
const attrToneHome: Record<Attr, 'blue' | 'red' | 'yellow'> = {
  '智慧': 'blue',
  '力量': 'red',
  '敏捷': 'yellow',
}
const attrMeta: Record<Attr, { icon: string }> = {
  '智慧': { icon: '🧠' },
  '力量': { icon: '💪' },
  '敏捷': { icon: '🐺' },
}
const heroName = 'Player'
const heroStars = 0
const heroStats: Record<Attr, number> = attrList.reduce(
  (acc, attr) => {
    acc[attr] = 0
    return acc
  },
  {} as Record<Attr, number>
)

const UI = {
  stars: '★★★★★',
  timelineIcon: '🎿',
  challengeIcon: '🤔',
  calendarIcon: '🕰',
}

const FRAME_DURATION = 240

const STRINGS = {
  heroBadge: 'Lv.5',
  heroPill: '星旅者',
  todayTitle: '星程简录',
  todayMeta: '今天',
  todayUnit: '项',
  feedTitle: '星旅挑战',
  difficultyLabel: '难度',
  feedUnit: '个任务',
  typeLabel: '类型',
  button: '接取任务',
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
}

export default function HomePane({ isActive = true, authVersion = 0 }: HomePaneProps) {
  const [todayTasks, setTodayTasks] = useState<RoadTask[]>([])
  const [dueTodayCount, setDueTodayCount] = useState(0)
  const [feedTasks, setFeedTasks] = useState<RoadTask[]>([])
  const visibleTasks = useMemo(() => feedTasks, [feedTasks])
  const quietLine = useMemo(() => quietLines[Math.floor(Math.random() * quietLines.length)], [])
  const challengeLine = useMemo(
    () => challengeQuietLines[Math.floor(Math.random() * challengeQuietLines.length)],
    []
  )
  const [frameIndex, setFrameIndex] = useState(0)
  const [modalTask, setModalTask] = useState<RoadTask | null>(null)
  const [dialogEditing, setDialogEditing] = useState(false)
  const [dialogDraft, setDialogDraft] = useState<Subtask[]>([])

  const mapRewardToAttr = (val: 'wisdom' | 'strength' | 'agility') => {
    if (val === 'wisdom') return '智慧'
    if (val === 'strength') return '力量'
    return '敏捷'
  }

  const mapApiTaskToRoad = (task: Task): RoadTask => {
    const attr = mapRewardToAttr(task.attributeReward.type)
    const baseId = task._id || 'task'
    const subtasks =
      task.subtasks && task.subtasks.length > 0
        ? task.subtasks.map((s, idx) => ({
            id: s._id || baseId + '-sub-' + (idx + 1),
            title: s.title || `子任务 ${idx + 1}`,
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
      creatorId: task.seedKey?.startsWith('challenge_') ? '星旅' : task.creatorId,
      assigneeId: task.assigneeId ?? null,
      dueAt,
      due: formatDueLabel(dueAt),
      remain: humanizeRemain(dueAt),
      progress: { current: progress.current, total: progress.total || 1 },
      subtasks,
      difficulty: task.attributeReward.value >= 20 ? '中等' : '简单',
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
    setModalTask(task)
    setDialogEditing(false)
    setDialogDraft([])
  }

  const handleCloseModal = () => {
    setModalTask(null)
    setDialogEditing(false)
    setDialogDraft([])
  }

  const handleStartDialogEdit = () => {
    if (!modalTask?.subtasks?.length) return
    setDialogEditing(true)
    setDialogDraft(modalTask.subtasks.map((s) => ({ ...s })))
  }

  const handleDialogDraftChange = (id: string, val: number) => {
    setDialogDraft((prev) => prev.map((s) => (s.id === id ? { ...s, current: val } : s)))
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
      Taro.showToast({ title: '已提交', icon: 'success' })
    } catch (err) {
      console.error('update progress error', err)
      await refreshHomeTasks(true)
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
      await acceptChallengeTask(taskId)
      Taro.showToast({ title: '已接取', icon: 'success' })
      await refreshHomeTasks()
    } catch (err) {
      console.error('accept challenge error', err)
      await refreshHomeTasks(true)
    }
  }

  const handleDialogAbandon = async () => {
    if (!modalTask) return
    const result = await Taro.showModal({
      title: '放弃任务',
      content: '确认放弃该任务吗?',
      confirmText: '确认放弃',
      cancelText: '取消',
    })
    if (!result.confirm) return
    try {
      await abandonTask(modalTask.id)
      Taro.showToast({ title: '已放弃', icon: 'success' })
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
      await refreshHomeTasks()
    } catch (err) {
      console.error('abandon task error', err)
      await refreshHomeTasks(true)
    }
  }

  const dialogSubtasks = dialogEditing && dialogDraft.length > 0 ? dialogDraft : modalTask?.subtasks
  const dialogProgress =
    dialogEditing && dialogSubtasks
      ? summarizeSubtasksProgress(dialogSubtasks)
      : modalTask?.progress
  const dialogRemain = modalTask?.dueAt ? humanizeRemain(modalTask.dueAt) : modalTask?.remain
  const dialogDueLabel = modalTask?.dueAt ? formatDueLabel(modalTask.dueAt) : modalTask?.due
  const dialogStartLabel = modalTask?.createdAt ? formatStartDate(modalTask.createdAt) : undefined

  const refreshHomeTasks = async (showNotice = false, shouldCancel?: () => boolean) => {
    try {
      const [todayRes, challenge] = await Promise.all([fetchTodayTasks(), fetchChallengeTasks()])
      if (shouldCancel?.()) return
      setDueTodayCount(todayRes.dueTodayCount || 0)
      setTodayTasks((todayRes.tasks || []).map((t) => mapApiTaskToRoad(t)))
      setFeedTasks((challenge || []).map((t) => mapApiTaskToRoad(t)))
      if (showNotice) {
        Taro.showToast({ title: '数据已刷新', icon: 'none' })
      }
    } catch (err) {
      console.error('load home tasks error', err)
      if (shouldCancel?.()) return
      setDueTodayCount(0)
      setTodayTasks([])
      setFeedTasks([])
      if (showNotice) {
        Taro.showToast({ title: '数据已刷新', icon: 'none' })
      }
    }
  }

  useEffect(() => {
    if (!isActive && modalTask) {
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
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
              <View className='badge'>{STRINGS.heroBadge}</View>
            </View>
            <View className='hero-info'>
              <Text className='hero-name'>{heroName}</Text>
              <Text className='hero-stars'>{UI.stars.slice(0, heroStars)}</Text>
            </View>
          </View>
          <View className='hero-pill'>
            <Text>{STRINGS.heroPill}</Text>
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
            <Text className='section-title'>{STRINGS.todayTitle}</Text>
          </View>
          <Text className='section-meta'>
            {STRINGS.todayMeta} - {dueTodayCount} {STRINGS.todayUnit}
          </Text>
        </View>
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
            <Text className='section-title'>{STRINGS.feedTitle}</Text>
          </View>
          <Text className='section-meta'>
            {feedTasks.length} {STRINGS.feedUnit}
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
                        {STRINGS.button}
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
                {dialogRemain && <Text>⏱ 剩余时间: {dialogRemain}</Text>}
                {dialogDueLabel && <Text>📅 截止: {dialogDueLabel}</Text>}
                {dialogStartLabel && <Text>🗓 起始: {dialogStartLabel}</Text>}
              </View>

              {dialogProgress && (
                <View className='progress'>
                  <View className='progress-head'>
                    <Text className='progress-label'>
                      进度 {dialogProgress.current}/{dialogProgress.total}
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

              {dialogSubtasks && dialogSubtasks.length > 0 && (
                <View className='dialog-steps'>
                  <View className='dialog-steps-head'>
                    <Text className='dialog-step-label'>子任务</Text>
                    <Text className='dialog-step-hint'>
                      {dialogEditing ? '拖动编辑,每步即时汇总' : '子进度自动汇总总进度'}
                    </Text>
                  </View>
                  {dialogSubtasks.map((s) => {
                    const percent = calcPercent(s.current, s.total)
                    return (
                      <View className='dialog-step' key={s.id}>
                        <View className='dialog-step-row'>
                          <Text className='dialog-step-title'>{s.title}</Text>
                          <Text className='dialog-step-count'>
                            {s.current}/{s.total}
                          </Text>
                        </View>
                        {dialogEditing ? (
                          <Slider
                            className='dialog-step-slider'
                            min={0}
                            max={s.total}
                            step={1}
                            value={s.current}
                            activeColor='#7c3aed'
                            backgroundColor='#e5e7eb'
                            onChange={(e) => handleDialogDraftChange(s.id, Number(e.detail.value))}
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
                {dialogEditing ? (
                  <View
                    className='task-action'
                    hoverClass='pressing'
                    hoverStartTime={0}
                    hoverStayTime={120}
                    hoverStopPropagation
                    onClick={handleDialogSubmit}
                  >
                    <Text className='action-icon'>✅</Text>
                    <Text>提交变更</Text>
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
                    <Text className='action-icon'>🔁</Text>
                    <Text>更新进度</Text>
                  </View>
                )}
                <View
                  className='task-action'
                  hoverClass='pressing'
                  hoverStartTime={0}
                  hoverStayTime={120}
                  hoverStopPropagation
                  onClick={() => handlePlaceholder('提交检视待接入')}
                >
                  <Text className='action-icon'>📝</Text>
                  <Text>提交检视</Text>
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
                    <Text className='action-icon'>✖</Text>
                    <Text>取消变更</Text>
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
                    <Text className='action-icon'>📥</Text>
                    <Text>放弃任务</Text>
                  </View>
                )}
              </View>
            </View>

            <Text className='dialog-hint'>点击空白处收起</Text>
          </View>
        </View>
      )}
    </View>
  )
}
