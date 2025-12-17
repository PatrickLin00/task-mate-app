import { View, Text, ScrollView, Button, Image, Slider } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import {
  type Attr,
  type RoadTask,
  type Subtask,
  attrIcon,
  attrTone as attrToneMap,
  role,
  todayTasks,
  dueTodayCount,
  feedTasks,
  chipText,
  quietLines,
  challengeQuietLines,
  catIdleFrames,
  summarizeSubtasksProgress,
  humanizeRemain,
  formatDueLabel,
} from '../shared/mocks'

const attrList: Attr[] = ['\u667a\u6167', '\u529b\u91cf', '\u654f\u6377']
const attrToneHome: Record<Attr, 'blue' | 'red' | 'yellow'> = {
  '\u667a\u6167': 'blue',
  '\u529b\u91cf': 'red',
  '\u654f\u6377': 'yellow',
}
const attrMeta: Record<Attr, { icon: string }> = {
  '\u667a\u6167': { icon: '\ud83e\udde0' },
  '\u529b\u91cf': { icon: '\ud83d\udcaa' },
  '\u654f\u6377': { icon: '\ud83d\udc3a' },
}

const UI = {
  stars: '\u2605\u2605\u2605\u2605\u2605',
  timelineIcon: '\ud83c\udfbf',
  challengeIcon: '\ud83e\udd10',
  calendarIcon: '\ud83d\udd70',
}

const FRAME_DURATION = 240

const STRINGS = {
  heroBadge: 'Lv.5',
  heroPill: '\u661f\u65c5\u8005',
  todayTitle: '\u661f\u7a0b\u7b80\u5f55',
  todayMeta: '\u4eca\u5929',
  todayUnit: '\u9879',
  feedTitle: '\u661f\u65c5\u6311\u6218',
  difficultyLabel: '\u96be\u5ea6',
  feedUnit: '\u4e2a\u4efb\u52a1',
  typeLabel: '\u7c7b\u578b',
  button: '\u63a5\u53d6\u4efb\u52a1',
}

const calcPercent = (current: number, total: number) =>
  Math.min(100, Math.round((current / Math.max(1, total || 1)) * 100))

const pad2 = (num: number) => (num < 10 ? `0${num}` : `${num}`)

const formatStartDate = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`
}

type HomePaneProps = {
  isActive?: boolean
}

export default function HomePane({ isActive = true }: HomePaneProps) {
  const visibleTasks = useMemo(() => feedTasks, [])
  const quietLine = useMemo(() => quietLines[Math.floor(Math.random() * quietLines.length)], [])
  const challengeLine = useMemo(
    () => challengeQuietLines[Math.floor(Math.random() * challengeQuietLines.length)],
    []
  )
  const [frameIndex, setFrameIndex] = useState(0)
  const [modalTask, setModalTask] = useState<RoadTask | null>(null)
  const [dialogEditing, setDialogEditing] = useState(false)
  const [dialogDraft, setDialogDraft] = useState<Subtask[]>([])

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

  const handleMiniCardPress = (t: RoadTask) => {
    setModalTask(t)
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

  const handleDialogSubmit = () => {
    if (!modalTask || dialogDraft.length === 0) return
    const progress = summarizeSubtasksProgress(dialogDraft)
    setModalTask({ ...modalTask, subtasks: dialogDraft, progress })
    setDialogEditing(false)
  }

  const handleDialogCancel = () => {
    setDialogEditing(false)
    setDialogDraft([])
  }

  const dialogSubtasks = dialogEditing && dialogDraft.length > 0 ? dialogDraft : modalTask?.subtasks
  const dialogProgress =
    dialogEditing && dialogSubtasks
      ? summarizeSubtasksProgress(dialogSubtasks)
      : modalTask?.progress
  const dialogRemain = modalTask?.dueAt ? humanizeRemain(modalTask.dueAt) : modalTask?.remain
  const dialogDueLabel = modalTask?.dueAt ? formatDueLabel(modalTask.dueAt) : modalTask?.due
  const dialogStartLabel = modalTask?.createdAt ? formatStartDate(modalTask.createdAt) : undefined

  // 关闭弹窗：切换到任务页/其他页时自动收起
  useEffect(() => {
    if (!isActive && modalTask) {
      setModalTask(null)
      setDialogEditing(false)
      setDialogDraft([])
    }
  }, [isActive, modalTask])

  return (
    <View className='home-pane'>
      {/* Hero summary */}
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
              <Text className='hero-name'>{role.name}</Text>
              <Text className='hero-stars'>{UI.stars.slice(0, role.stars)}</Text>
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
                <View className={`fill ${attrToneHome[attr]}`} style={{ width: `${role[attr]}%` }} />
              </View>
              <Text className='val'>{role[attr]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Today highlights */}
      <View id='today' className='section card'>
        <View className='section-bar'>
          <View className='section-head'>
            <Text className='section-icon'>{UI.timelineIcon}</Text>
            <Text className='section-title'>{STRINGS.todayTitle}</Text>
          </View>
          <Text className='section-meta'>
            {STRINGS.todayMeta} · {dueTodayCount} {STRINGS.todayUnit}
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

      {/* Challenge feed */}
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
                {visibleTasks.map((t) => {
                  return (
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
                          onClick={() => handlePlaceholder('接取任务待接入')}
                        >
                          {STRINGS.button}
                        </Button>
                      </View>
                    </View>
                  )
                })}
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
                {dialogRemain && <Text>⏱ 剩余时间：{dialogRemain}</Text>}
                {dialogDueLabel && <Text>📅 截止：{dialogDueLabel}</Text>}
                {dialogStartLabel && <Text>🗓 起始：{dialogStartLabel}</Text>}
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
                      style={{
                        width: `${calcPercent(dialogProgress.current, dialogProgress.total)}%`,
                      }}
                    />
                  </View>
                </View>
              )}

              {dialogSubtasks && dialogSubtasks.length > 0 && (
                <View
                  className='dialog-steps'
                >
                  <View className='dialog-steps-head'>
                    <Text className='dialog-step-label'>子任务</Text>
                    <Text className='dialog-step-hint'>
                      {dialogEditing ? '拖动编辑，每步即时汇总' : '子进度自动汇总总进度'}
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
                    <Text className='action-icon'>✖️</Text>
                    <Text>取消变更</Text>
                  </View>
                ) : (
                  <View
                    className='task-action ghost'
                    hoverClass='pressing'
                    hoverStartTime={0}
                    hoverStayTime={120}
                    hoverStopPropagation
                    onClick={() => handlePlaceholder('已收纳，稍后接入')}
                  >
                    <Text className='action-icon'>📥</Text>
                    <Text>收纳任务</Text>
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
