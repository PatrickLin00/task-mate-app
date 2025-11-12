import { View, Text, Swiper, SwiperItem } from '@tarojs/components'
import { useState } from 'react'
import './index.scss'

import HomePane from './panes/HomePane'
import TasksPane from './panes/TasksPane'
import AchievementsPane from './panes/AchievementsPane'
import ProfilePane from './panes/ProfilePane'

type Tab = 'home' | 'tasks' | 'achievements' | 'profile'
const tabOrder: Tab[] = ['home', 'tasks', 'achievements', 'profile']

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>('home')

  return (
    <View className='home'>
      <View className='bg' />

      {/* 顶部四个标签 */}
      <View className='tabs'>
        <View className={`tab ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <Text>🏠 首页</Text>
        </View>
        <View className={`tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>
          <Text>📋 任务</Text>
        </View>
        <View className={`tab ${activeTab === 'achievements' ? 'active' : ''}`} onClick={() => setActiveTab('achievements')}>
          <Text>🏆 成就</Text>
        </View>
        <View className={`tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <Text>👤 我的</Text>
        </View>
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
          <TasksPane />
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

