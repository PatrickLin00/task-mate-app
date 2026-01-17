import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import '../home.scss'
import { devLoginWeapp, getDevUserId, getUserId } from '@/services/auth'
import { requestTaskSubscribeAuth } from '@/services/subscribe'
import { updateProfile } from '@/services/api'
import { taskStrings } from '../shared/strings'

declare const DEV_AUTH_ENABLED: boolean

export default function ProfilePane({
  onAuthChanged,
  nickname,
  stats,
}: {
  onAuthChanged?: () => void
  nickname?: string
  stats?: { wisdom?: number; strength?: number; agility?: number }
}) {
  const [currentUserId, setCurrentUserId] = useState(() => getUserId() || '')
  const [devUserId, setDevUserId] = useState(() => getDevUserId() || '')
  const [switching, setSwitching] = useState(false)
  const [nicknameDraft, setNicknameDraft] = useState(() => nickname || '')
  const [savingNickname, setSavingNickname] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const displayName = nickname || currentUserId || taskStrings.home.heroName
  const displayStars = 0

  const canUseDev = DEV_AUTH_ENABLED

  useEffect(() => {
    setNicknameDraft(nickname || '')
  }, [nickname])

  useEffect(() => {
    const shown = Taro.getStorageSync('guideShown')
    if (!shown) {
      setShowGuide(true)
      Taro.setStorageSync('guideShown', '1')
    }
  }, [])

  const handleDevSwitch = async (nextUserId: string) => {
    const trimmed = String(nextUserId || '').trim()
    if (!trimmed) return
    if (switching) return
    setSwitching(true)
    try {
      await devLoginWeapp(trimmed)
      setCurrentUserId(getUserId() || trimmed)
      setDevUserId(trimmed)
      onAuthChanged?.()
      Taro.showToast({ title: taskStrings.profile.devSwitchOk, icon: 'success' })
    } catch (err: any) {
      console.error('dev switch failed', err)
      Taro.showToast({ title: err?.message || taskStrings.profile.devSwitchFail, icon: 'none' })
    } finally {
      setSwitching(false)
    }
  }

  const handleSubscribeSettings = async () => {
    await requestTaskSubscribeAuth({
      force: true,
      onSkipped: () => {
        Taro.showToast({ title: taskStrings.profile.subscribeHint, icon: 'none' })
      },
    })
  }

  const handleOpenAbout = () => {
    Taro.navigateTo({ url: '/pages/about/index' })
  }

  const handleOpenGuide = () => {
    setShowGuide(true)
  }

  const handleCloseGuide = () => {
    setShowGuide(false)
  }

  const handleSaveNickname = async () => {
    const trimmed = String(nicknameDraft || '').trim()
    if (!trimmed) {
      Taro.showToast({ title: taskStrings.naming.emptyHint, icon: 'none' })
      return
    }
    if (savingNickname) return
    setSavingNickname(true)
    try {
      await updateProfile({ nickname: trimmed })
      Taro.removeStorageSync('nameGateDismissed')
      onAuthChanged?.()
      Taro.showToast({ title: taskStrings.naming.saved, icon: 'success' })
    } catch (err: any) {
      console.error('update nickname error', err)
      Taro.showToast({ title: err?.message || taskStrings.toast.loadFail, icon: 'none' })
    } finally {
      setSavingNickname(false)
    }
  }

  const statItems = [
    {
      key: 'wisdom',
      label: taskStrings.rewards.wisdom.label,
      icon: taskStrings.rewards.wisdom.icon,
      value: Number(stats?.wisdom || 0),
    },
    {
      key: 'strength',
      label: taskStrings.rewards.strength.label,
      icon: taskStrings.rewards.strength.icon,
      value: Number(stats?.strength || 0),
    },
    {
      key: 'agility',
      label: taskStrings.rewards.agility.label,
      icon: taskStrings.rewards.agility.icon,
      value: Number(stats?.agility || 0),
    },
  ]

  return (
    <View className='profile-page'>
      <View className='profile-hero card'>
        <View className='profile-hero-row'>
          <View className='avatar-wrap profile-avatar'>
            <View className='avatar'>{taskStrings.profile.avatarIcon}</View>
          </View>
          <View className='profile-hero-main'>
            <View className='hero-head'>
              <Text className='profile-name'>{displayName}</Text>
              <Text className='hero-stars'>{taskStrings.home.stars.slice(0, displayStars)}</Text>
            </View>
            <Text className='profile-desc'>{taskStrings.profile.heroDesc}</Text>
          </View>
        </View>
        <View className='profile-stats'>
          {statItems.map((item) => (
            <View key={item.key} className='profile-stat'>
              <View className='stat-chip'>
                <Text className='stat-icon'>{item.icon}</Text>
                <Text className='stat-label'>{item.label}</Text>
              </View>
              <Text className='stat-value'>{item.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='profile-card card'>
        <Text className='section-title'>{taskStrings.profile.nicknameTitle}</Text>
        <View className='profile-nickname-row'>
          <Input
            className='modal-input'
            value={nicknameDraft}
            onInput={(e) => setNicknameDraft(e.detail.value)}
            placeholder={taskStrings.naming.placeholder}
            maxlength={6}
          />
          <Button className='ai-btn' loading={savingNickname} onClick={() => void handleSaveNickname()}>
            {taskStrings.naming.submit}
          </Button>
        </View>
      </View>

      <View className='profile-card card'>
        <Text className='section-title'>{taskStrings.profile.actionsTitle}</Text>
        <View className='profile-actions'>
          <Button className='profile-action' onClick={() => void handleSubscribeSettings()}>
            <Text className='action-icon'>🔔</Text>
            <Text className='action-text'>{taskStrings.profile.subscribeLabel}</Text>
          </Button>
          <Button className='profile-action' onClick={handleOpenAbout}>
            <Text className='action-icon'>🧭</Text>
            <Text className='action-text'>{taskStrings.profile.aboutLabel}</Text>
          </Button>
          <Button className='profile-action' onClick={handleOpenGuide}>
            <Text className='action-icon'>🪄</Text>
            <Text className='action-text'>{taskStrings.profile.guideLabel}</Text>
          </Button>
        </View>
      </View>

      {canUseDev && (
        <View className='profile-card card'>
          <Text className='section-title'>{taskStrings.profile.devTitle}</Text>
          <Text className='feed-desc'>
            {taskStrings.profile.devCurrentPrefix}
            {currentUserId || taskStrings.profile.devCurrentEmpty}
          </Text>

          <View className='one-line-row'>
            <Input
              className='modal-input'
              value={devUserId}
              onInput={(e) => setDevUserId(e.detail.value)}
              placeholder={taskStrings.profile.devPlaceholder}
            />
            <Button className='ai-btn' loading={switching} onClick={() => void handleDevSwitch(devUserId)}>
              {taskStrings.profile.devSwitchLabel}
            </Button>
          </View>

          <View className='one-line-row'>
            {taskStrings.profile.devUsers.map((userId) => (
              <Button
                key={userId}
                className='ai-btn'
                disabled={switching}
                onClick={() => void handleDevSwitch(userId)}
              >
                {userId}
              </Button>
            ))}
          </View>
        </View>
      )}

      {showGuide && (
        <View className='guide-mask' catchMove onClick={handleCloseGuide}>
          <View className='guide-card' onClick={(e) => e.stopPropagation()}>
            <View className='guide-header'>
              <Text className='guide-title'>{taskStrings.profile.guideTitle}</Text>
              <Text className='guide-close' onClick={handleCloseGuide}>
                ×
              </Text>
            </View>
            <View className='guide-section'>
              <Text className='guide-section-title'>{taskStrings.profile.guideSelfTitle}</Text>
              <Text className='guide-text'>{taskStrings.profile.guideSelfSteps}</Text>
            </View>
            <View className='guide-section'>
              <Text className='guide-section-title'>{taskStrings.profile.guideShareTitle}</Text>
              <Text className='guide-text'>{taskStrings.profile.guideShareSteps}</Text>
            </View>
            <Button className='guide-btn' onClick={handleCloseGuide}>
              {taskStrings.profile.guideOk}
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}
