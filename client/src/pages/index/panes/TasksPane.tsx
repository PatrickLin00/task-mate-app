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
  { key: 'mission', label: '浣垮懡鍦ㄨ韩', hint: '杩涜涓? },
  { key: 'collab', label: '濂囬亣杞ㄨ抗', hint: '鍗忎綔' },
  { key: 'archive', label: '宸茬粨鏄熸効', hint: '褰掓。' },
]

const statusTone: Record<CollabStatus | '宸插綊妗?, 'blue' | 'gray' | 'green'> = {
  杩涜涓? 'blue',
  寰呮帴鍙? 'gray',
  宸插畬鎴? 'green',
  宸插綊妗? 'green',
}

const statusIcon: Record<CollabStatus | '宸插綊妗?, string> = {
  杩涜涓? '鈥?,
  寰呮帴鍙? '鈴?,
  宸插畬鎴? '鉁?,
  宸插綊妗? '馃摝',
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
          杩涘害 {current}/{total}
        </Text>
        <Text className='progress-percent'>{percent}%</Text>
      </View>
      <View className='progress-track'>
        <View className='progress-fill' style={{ width: `${percent}%` }} />
      </View>
    </View>
  )
}

function StatusBadge({ status }: { status: CollabStatus | '宸插綊妗? }) {
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
        <Text className='meta-item'>馃晳 鍓╀綑鏃堕棿锛歿task.remain}</Text>
      </View>
      <View className='action-row'>
        <ActionButton icon='鈫? label='鏇存柊杩涘害' />
        <ActionButton icon='鉁? label='鎻愪氦楠屾敹' />
        <ActionButton icon='鉁? label='鏀惧純浠诲姟' ghost />
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
        <Text className='meta-item'>馃 鎺ュ彇浜猴細{task.assignee}</Text>
      </View>
      <View className='action-row'>
        <ActionButton icon='鉁忥笍' label='缂栬緫浠诲姟' />
        <ActionButton icon='馃敆' label='鍒嗕韩閾炬帴' />
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
        <StatusBadge status='宸插綊妗? />
      </View>
      <Text className='task-desc'>{task.detail}</Text>
      <View className='card-meta'>
        <Text className='meta-item'>鉁?瀹屾垚浜庯細{task.finishedAgo}</Text>
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

  const handleTouchStart = (e: any) => {
    if (e?.touches?.[0]) {
      touchStartX.current = e.touches[0].clientX
    }
  }

  const handleTouchEnd = (e: any) => {
    if (touchStartX.current === null || !e?.changedTouches?.[0]) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    const threshold = 50

    // Mission tab: right swipe to go back to Home
    if (activeTab === 'mission' && deltaX > threshold) {
      onSwipeToHome?.()
      return
    }

    // Archive tab: right swipe to jump to Achievements
    if (activeTab === 'archive' && deltaX > threshold) {
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

      <Button className='fab'>鍙戣捣濂囬亣</Button>
    </View>
  )
}
