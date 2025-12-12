import { View, Text, Swiper, SwiperItem, ScrollView, Button, Input, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useMemo, useRef, useState } from 'react'
import '../tasks.scss'
import {
  missionTasks as missionSeed,
  collabTasks as collabSeed,
  archivedTasks as archivedSeed,
  attrTone,
  attrIcon,
  type Attr,
  type CollabStatus,
  type MissionTask,
  type CollabTask,
  type ArchivedTask,
} from '../shared/mocks'
import { createTask, type Task } from '@/services/api'

type TabKey = 'mission' | 'collab' | 'archive'

type TasksPaneProps = {
  onSwipeToHome?: () => void
  onSwipeToAchievements?: () => void
}

const tabs: { key: TabKey; label: string; hint: string }[] = [
  { key: 'mission', label: '使命在身', hint: '进行中' },
  { key: 'collab', label: '奇遇轨迹', hint: '自己发布' },
  { key: 'archive', label: '已结星愿', hint: '已完成' },
]

const statusTone: Record<CollabStatus | '已归档', 'blue' | 'gray' | 'green'> = {
  进行中: 'blue',
  待接应: 'gray',
  已完成: 'green',
  已归档: 'green',
}

const statusIcon: Record<CollabStatus | '已归档', string> = {
  进行中: '⏳',
  待接应: '🔔',
  已完成: '✅',
  已归档: '📦',
}

type SubtaskInput = { title: string; total: number }

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

function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = Math.min(100, Math.round((current / total) * 100))
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

function StatusBadge({ status }: { status: CollabStatus | '已归档' }) {
  const tone = statusTone[status]
  return (
    <View className={`status-badge tone-${tone}`}>
      <Text className='status-icon'>{statusIcon[status]}</Text>
      <Text className='status-text'>{status}</Text>
    </View>
  )
}

function ActionButton({ icon, label, ghost }: { icon: string; label: string; ghost?: boolean }) {
  return (
    <View className={`task-action ${ghost ? 'ghost' : ''}`}>
      <Text className='action-icon'>{icon}</Text>
      <Text>{label}</Text>
    </View>
  )
}

function MissionCard({ task }: { task: MissionTask }) {
  const tone = attrTone[task.attr]
  return (
    <View className={`task-card tone-${tone}`}>
      <View className='card-head'>
        <View className='title-wrap'>
          <Text className='task-icon'>{task.icon}</Text>
          <Text className='task-title'>{task.title}</Text>
        </View>
        <AttributeTag attr={task.attr} points={task.points} />
      </View>
      <Text className='task-desc'>{task.detail}</Text>
      <ProgressBar current={task.progress.current} total={task.progress.total} />
      <View className='card-meta'>
        <Text className='meta-item'>⏱ 剩余时间：{task.remain}</Text>
      </View>
      <View className='action-row'>
        <ActionButton icon='🔁' label='更新进度' />
        <ActionButton icon='📤' label='提交检视' />
        <ActionButton icon='📥' label='收纳任务' ghost />
      </View>
    </View>
  )
}

function CollabCard({ task }: { task: CollabTask }) {
  const tone = attrTone[task.attr]
  return (
    <View className={`task-card tone-${tone}`}>
      <View className='card-head'>
        <View className='title-stack'>
          <StatusBadge status={task.status} />
          <View className='title-wrap'>
            <Text className='task-icon'>{task.icon}</Text>
            <Text className='task-title'>{task.title}</Text>
          </View>
        </View>
        <AttributeTag attr={task.attr} points={task.points} />
      </View>
      <Text className='task-desc'>{task.detail}</Text>
      <View className='card-meta'>
        <Text className='meta-item'>🙌 执行人：{task.assignee}</Text>
      </View>
      <View className='action-row'>
        <ActionButton icon='✏️' label='编辑任务' />
        <ActionButton icon='🔗' label='分享链接' />
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
        <StatusBadge status='已归档' />
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

export default function TasksPane({ onSwipeToHome, onSwipeToAchievements }: TasksPaneProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('mission')
  const [missionTasks, setMissionTasks] = useState<MissionTask[]>(missionSeed)
  const [collabTasks] = useState<CollabTask[]>(collabSeed)
  const [archivedTasks] = useState<ArchivedTask[]>(archivedSeed)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [oneLine, setOneLine] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [descInput, setDescInput] = useState('')
  const [attrReward, setAttrReward] = useState<'wisdom' | 'strength' | 'agility' | ''>('')
  const [attrValue, setAttrValue] = useState('')
  const [subtasks, setSubtasks] = useState<SubtaskInput[]>([
    { title: '', total: 1 },
    { title: '', total: 1 },
  ])
  const current = tabs.findIndex((t) => t.key === activeTab)
  const touchStartX = useRef<number | null>(null)
  const touchStartTab = useRef<TabKey>('mission')

  const handleTouchStart = (e: any) => {
    if (e?.touches?.[0]) {
      touchStartX.current = e.touches[0].clientX
      touchStartTab.current = activeTab
    }
  }

  const handleTouchEnd = (e: any) => {
    if (touchStartX.current === null || !e?.changedTouches?.[0]) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    const threshold = 50

    // 使命在身：右滑回到首页（仅当起始就在使命页，避免中间滑页误触）
    if (touchStartTab.current === 'mission' && deltaX > threshold) {
      onSwipeToHome?.()
      return
    }

    // 已结星愿：左滑去成就页（起始在档案页时生效，方向与 tab/Swiper 一致）
    if (touchStartTab.current === 'archive' && deltaX < -threshold) {
      onSwipeToAchievements?.()
    }
  }

  const rewardOptions = useMemo(
    () => [
      { label: '智慧', value: 'wisdom' as const, tone: 'blue', icon: '🧠' },
      { label: '力量', value: 'strength' as const, tone: 'red', icon: '💪' },
      { label: '敏捷', value: 'agility' as const, tone: 'green', icon: '⚡' },
    ],
    []
  )

  const resetForm = () => {
    setTitleInput('')
    setDescInput('')
    setAttrReward('')
    setAttrValue('')
    setSubtasks([
      { title: '', total: 1 },
      { title: '', total: 1 },
    ])
  }

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

  const mapApiTaskToMission = (task: Task): MissionTask => {
    const attr = mapRewardToAttr(task.attributeReward.type)
    const progress =
      task.computedProgress || task.progress || { current: task.subtasks?.length ? 0 : 0, total: task.subtasks?.reduce((s, t) => s + (t.total || 0), 0) || 1 }
    return {
      id: task._id || Math.random().toString(36).slice(2),
      title: task.title,
      detail: task.description || '',
      attr,
      points: task.attributeReward.value,
      icon: '✨',
      progress: { current: progress.current, total: progress.total || 1 },
      remain: '刚刚',
    }
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
      const created = await createTask({
        title,
        description: descInput.trim(),
        subtasks: validSubtasks.map((s) => ({ ...s, current: 0 })),
        attributeReward: { type: attrReward, value: rewardValNum },
      })
      const mapped = mapApiTaskToMission(created)
      setMissionTasks((prev) => [mapped, ...prev])
      Taro.showToast({ title: '奇遇已发起', icon: 'success' })
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
              onClick={() => setActiveTab(tab.key)}
            >
              <Text className='tab-label'>{tab.label}</Text>
              <Text className='tab-hint'>{tab.hint}</Text>
            </View>
          ))}
        </View>

        <Swiper
          className='task-swiper'
          current={current}
          onChange={(e) => setActiveTab(tabs[e.detail.current].key)}
          duration={220}
        >
          <SwiperItem>
            <ScrollView scrollY scrollWithAnimation enableFlex className='task-scroll'>
              <View className='task-list'>
                {missionTasks.map((task) => (
                  <MissionCard key={task.id} task={task} />
                ))}
              </View>
            </ScrollView>
          </SwiperItem>

          <SwiperItem>
            <ScrollView scrollY scrollWithAnimation enableFlex className='task-scroll'>
              <View className='task-list'>
                {collabTasks.map((task) => (
                  <CollabCard key={task.id} task={task} />
                ))}
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

      <Button className='fab' onClick={() => setShowCreate(true)}>
        发起奇遇
      </Button>

      {showCreate && (
        <View className='task-modal-overlay' onClick={() => setShowCreate(false)}>
          <View
            className='task-modal card'
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <View className='modal-head'>
              <View>
                <Text className='modal-title'>发起一场新的奇遇</Text>
                <Text className='modal-sub'>写下你想完成的事，其余交给星辰来编织</Text>
              </View>
              <Text className='modal-close' onClick={() => setShowCreate(false)}>
                ✕
              </Text>
            </View>

            <View className='modal-body'>
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
              <Button className='modal-cancel' onClick={() => setShowCreate(false)}>
                取消
              </Button>
              <Button className='modal-submit' loading={creating} onClick={handleSubmitCreate}>
                发起奇遇
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
