import { View, Text, Swiper, SwiperItem, Input, Button } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { useState } from 'react'
import './index.scss'

import HomePane from './panes/HomePane'
import TasksPane from './panes/TasksPane'
import AchievementsPane from './panes/AchievementsPane'
import ProfilePane from './panes/ProfilePane'
import { taskStrings } from './shared/strings'
import { randomNickname } from './shared/nickname'
import { fetchProfile, updateProfile, fetchTaskDashboard } from '@/services/api'
import { connectTaskSocket } from '@/services/socket'
import { getUserId } from '@/services/auth'

type Tab = 'home' | 'tasks' | 'achievements' | 'profile'
const tabOrder: Tab[] = ['home', 'tasks', 'achievements', 'profile']
const tabMeta: Record<Tab, { label: string; icon: string }> = taskStrings.nav

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [authVersion, setAuthVersion] = useState(0)
  const [openTaskId, setOpenTaskId] = useState<string | undefined>(undefined)
  const [profile, setProfile] = useState<{
    userId: string
    nickname: string
    wisdom: number
    strength: number
    agility: number
  }>(() => ({
    userId: getUserId() || '',
    nickname: (() => {
      try {
        return Taro.getStorageSync('nickname') || ''
      } catch {
        return ''
      }
    })(),
    wisdom: 0,
    strength: 0,
    agility: 0,
  }))
  const [nameGateActive, setNameGateActive] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
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

  const applyProfile = (next: {
    userId?: string
    nickname?: string | null
    wisdom?: number
    strength?: number
    agility?: number
  }) => {
    const resolvedUserId = next.userId || getUserId() || ''
    const rawNickname = typeof next.nickname === 'string' ? next.nickname.trim() : ''
    const resolvedNickname = rawNickname || resolvedUserId
    setProfile({
      userId: resolvedUserId,
      nickname: resolvedNickname,
      wisdom: Number(next.wisdom || 0),
      strength: Number(next.strength || 0),
      agility: Number(next.agility || 0),
    })
    if (resolvedNickname) {
      Taro.setStorageSync('nickname', resolvedNickname)
    }
    const dismissed = Boolean(Taro.getStorageSync('nameGateDismissed'))
    const shouldGate = Boolean(resolvedUserId) && resolvedNickname === resolvedUserId && !dismissed
    setNameGateActive(shouldGate)
    setNameDraft(shouldGate ? '' : resolvedNickname)
  }

  const refreshProfile = async () => {
    if (profileLoading) return
    setProfileLoading(true)
    try {
      const data = await fetchProfile()
      applyProfile(data)
    } catch (err) {
      console.error('load profile error', err)
    } finally {
      setProfileLoading(false)
    }
  }

  const handleRandomName = () => {
    setNameDraft(randomNickname())
  }

  const handleSkipName = () => {
    Taro.setStorageSync('nameGateDismissed', true)
    setNameGateActive(false)
  }

  const handleSubmitName = async () => {
    const trimmed = String(nameDraft || '').trim()
    if (!trimmed) {
      Taro.showToast({ title: taskStrings.naming.emptyHint, icon: 'none' })
      return
    }
    if (savingName) return
    setSavingName(true)
    try {
      const updated = await updateProfile({ nickname: trimmed })
      applyProfile(updated)
      Taro.showToast({ title: taskStrings.naming.saved, icon: 'success' })
    } catch (err: any) {
      console.error('update nickname error', err)
      Taro.showToast({ title: err?.message || taskStrings.toast.loadFail, icon: 'none' })
    } finally {
      setSavingName(false)
    }
  }

  useDidShow(() => {
    const next = readOpenTaskId()
    if (taskDebug) {
      console.log('share param resolved', { next })
    }
    setOpenTaskId(next)
    if (next) setActiveTab('home')
    void refreshProfile()
    void fetchTaskDashboard()
    void connectTaskSocket()
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

  const displayName =
    profile.nickname && profile.nickname !== profile.userId ? profile.nickname : taskStrings.labels.unnamed

  return (
    <View className='home'>
      <View className='bg' />

      {nameGateActive && (
        <View className='name-gate-overlay' catchMove>
          <View className='name-gate-card card' onClick={(e) => e.stopPropagation()}>
            <View className='name-gate-head'>
              <Text className='name-gate-title'>{taskStrings.naming.title}</Text>
              <Text className='name-gate-sub'>{taskStrings.naming.sub}</Text>
            </View>
            <View className='name-gate-input-row'>
              <Input
                className='modal-input'
                value={nameDraft}
                onInput={(e) => setNameDraft(e.detail.value)}
                placeholder={taskStrings.naming.placeholder}
                maxlength={6}
              />
              <Button className='ai-btn' onClick={handleRandomName}>
                {taskStrings.naming.random}
              </Button>
            </View>
            <Text className='name-gate-hint'>{taskStrings.naming.skipHint}</Text>
            <Button
              className='task-action name-gate-submit'
              loading={savingName}
              onClick={() => void handleSubmitName()}
            >
              {taskStrings.naming.submit}
            </Button>
            <Button className='task-action ghost' onClick={handleSkipName}>
              {taskStrings.naming.skip}
            </Button>
          </View>
        </View>
      )}

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
        skipHiddenItemLayout={false}
      >
        <SwiperItem>
          <HomePane
            isActive={activeTab === 'home'}
            authVersion={authVersion}
            openTaskId={openTaskId}
            heroName={displayName}
            heroStats={{
              wisdom: profile.wisdom,
              strength: profile.strength,
              agility: profile.agility,
            }}
            nameGateActive={nameGateActive}
            onProfileRefresh={() => void refreshProfile()}
          />
        </SwiperItem>
        <SwiperItem>
          <TasksPane
            isActive={activeTab === 'tasks'}
            authVersion={authVersion}
            onSwipeToHome={() => setActiveTab('home')}
            onSwipeToAchievements={() => setActiveTab('achievements')}
            onProfileRefresh={() => void refreshProfile()}
          />
        </SwiperItem>
        <SwiperItem>
          <AchievementsPane />
        </SwiperItem>
        <SwiperItem>
          <ProfilePane
            nickname={displayName}
            onAuthChanged={() => {
              setAuthVersion(Date.now())
              void refreshProfile()
            }}
          />
        </SwiperItem>
      </Swiper>
    </View>
  )
}
