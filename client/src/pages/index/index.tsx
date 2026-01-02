import { View, Text, Swiper, SwiperItem } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { useState } from 'react'
import './index.scss'

import HomePane from './panes/HomePane'
import TasksPane from './panes/TasksPane'
import AchievementsPane from './panes/AchievementsPane'
import ProfilePane from './panes/ProfilePane'
import { taskStrings } from './shared/strings'

type Tab = 'home' | 'tasks' | 'achievements' | 'profile'
const tabOrder: Tab[] = ['home', 'tasks', 'achievements', 'profile']
const tabMeta: Record<Tab, { label: string; icon: string }> = taskStrings.nav

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [authVersion, setAuthVersion] = useState(0)
  const [openTaskId, setOpenTaskId] = useState<string | undefined>(undefined)
  const taskDebug = TASK_DEBUG
  const readOpenTaskId = () => {
    const routerParams = (Taro.getCurrentInstance()?.router?.params || {}) as Record<string, any>
    const launchQuery = Taro.getLaunchOptionsSync?.().query || {}
    const enterQuery = Taro.getEnterOptionsSync?.()?.query || {}
    const raw = routerParams.openTaskId || enterQuery.openTaskId || launchQuery.openTaskId
    if (taskDebug) {
      console.log('share param snapshot', {
        routerParams,
        enterQuery,
        launchQuery,
        resolved: raw,
      })
    }
    return raw ? String(raw) : undefined
  }

  useDidShow(() => {
    const next = readOpenTaskId()
    if (taskDebug) {
      console.log('share param resolved', { next })
    }
    setOpenTaskId(next)
    if (next) setActiveTab('home')
  })

  useShareAppMessage((res) => {
    if ((res as any)?.from === 'button') {
      const dataset = (res as any)?.target?.dataset || {}
      const taskId = dataset.taskid
      const taskTitle = dataset.tasktitle
      if (taskDebug) {
        console.log('share from button', { dataset, taskId, taskTitle })
      }
      if (taskId) {
        return {
          title: taskTitle || taskStrings.share.assignTitle,
          path: `/pages/index/index?openTaskId=${encodeURIComponent(taskId)}`,
        }
      }
    }
    return {
      title: taskStrings.share.defaultTitle,
      path: '/pages/index/index',
    }
  })

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
          <HomePane isActive={activeTab === 'home'} authVersion={authVersion} openTaskId={openTaskId} />
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
