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
  home: { label: '\u9996\u9875', icon: '\ud83c\udfe0' },
  tasks: { label: '\u4efb\u52a1', icon: '\ud83d\udcdd' },
  achievements: { label: '\u6210\u5c31', icon: '\ud83c\udfc6' },
  profile: { label: '\u6211\u7684', icon: '\ud83d\udc64' },
}

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>('home')

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
          <HomePane />
        </SwiperItem>
        <SwiperItem>
          <TasksPane onSwipeToHome={() => setActiveTab('home')} onSwipeToAchievements={() => setActiveTab('achievements')} />
        </SwiperItem>
        <SwiperItem>
          <AchievementsPane />
        </SwiperItem>
        <SwiperItem>
          <ProfilePane />
        </SwiperItem>
      </Swiper>
    </View>
  )
}
