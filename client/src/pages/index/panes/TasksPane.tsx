import { View, Text, Swiper, SwiperItem, ScrollView, Button } from '@tarojs/components'
import { useRef, useState } from 'react'
import '../tasks.scss'
import {
  missionTasks,
  collabTasks,
  archivedTasks,
  attrTone,
  attrIcon,
  type MissionTask,
  type CollabTask,
  type ArchivedTask,
  type Attr,
  type CollabStatus,
} from '../shared/mocks'

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

      <Button className='fab'>发起奇遇</Button>
    </View>
  )
}
