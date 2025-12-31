import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import '../home.scss'
import { devLoginWeapp, getDevUserId, getUserId } from '@/services/auth'
import { taskStrings } from '../shared/strings'

declare const DEV_AUTH_ENABLED: boolean

export default function ProfilePane({ onAuthChanged }: { onAuthChanged?: () => void }) {
  const [currentUserId, setCurrentUserId] = useState(() => getUserId() || '')
  const [devUserId, setDevUserId] = useState(() => getDevUserId() || '')
  const [switching, setSwitching] = useState(false)

  const displayName = currentUserId || taskStrings.home.heroName
  const displayStars = 0

  const canUseDev = DEV_AUTH_ENABLED

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

  return (
    <View className='profile-page'>
      <View className='section'>
        <Text className='section-title'>{taskStrings.profile.title}</Text>
        <View className='hero'>
          <View className='avatar-wrap'>
            <View className='avatar'>{taskStrings.profile.avatarIcon}</View>
          </View>
          <View className='hero-main'>
            <View className='hero-head'>
              <Text className='hero-name'>{displayName}</Text>
              <Text className='hero-stars'>{taskStrings.home.stars.slice(0, displayStars)}</Text>
            </View>
            <Text className='feed-desc'>{taskStrings.profile.heroDesc}</Text>
          </View>
        </View>
      </View>

      {canUseDev && (
        <View className='section'>
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
    </View>
  )
}
