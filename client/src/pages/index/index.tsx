import { View, Text, Swiper, SwiperItem } from '@tarojs/components'
import { useState } from 'react'
import './index.scss'

import HomePane from './panes/HomePane'
import TasksPane from './panes/TasksPane'
import AchievementsPane from './panes/AchievementsPane'
import ProfilePane from './panes/ProfilePane'

type Tab = 'home' | 'tasks' | 'achievements' | 'profile'
const tabOrder: Tab[] = ['home', 'tasks', 'achievements', 'profile']
const tabMeta: Record<Tab, { label: string; icon: string }> = {
  home: { label: '首页', icon: '🏠' },
  tasks: { label: '任务', icon: '📝' },
  achievements: { label: '成就', icon: '🏆' },
  profile: { label: '我的', icon: '👤' },
}

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [authVersion, setAuthVersion] = useState(0)

  return (
    <View className='home'>
      <View className='bg' />

      <View className='tabs'>
        {tabOrder.map((tab) => (
          <View key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            <Text className='tab-icon'>{tabMeta[tab].icon}</Text>
            <Text className='tab-text'>{tabMeta[tab].label}</Text>
          </View>
        ))}
      </View>

      <Swiper
        className='panes'
        current={tabOrder.indexOf(activeTab)}
        onChange={(e) => setActiveTab(tabOrder[e.detail.current])}
        circular={false}
        duration={220}
      >
        <SwiperItem>
          <HomePane isActive={activeTab === 'home'} authVersion={authVersion} />
        </SwiperItem>
        <SwiperItem>
          <TasksPane
            isActive={activeTab === 'tasks'}
            authVersion={authVersion}
            onSwipeToHome={() => setActiveTab('home')}
            onSwipeToAchievements={() => setActiveTab('achievements')}
          />
        </SwiperItem>
        <SwiperItem>
          <AchievementsPane />
        </SwiperItem>
        <SwiperItem>
          <ProfilePane onAuthChanged={() => setAuthVersion(Date.now())} />
        </SwiperItem>
      </Swiper>
    </View>
  )
}
