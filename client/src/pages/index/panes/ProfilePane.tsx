import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import '../home.scss'
import { devLoginWeapp, getDevUserId, getUserId } from '@/services/auth'

declare const DEV_AUTH_ENABLED: boolean

export default function ProfilePane({ onAuthChanged }: { onAuthChanged?: () => void }) {
  const [currentUserId, setCurrentUserId] = useState(() => getUserId() || '')
  const [devUserId, setDevUserId] = useState(() => getDevUserId() || '')
  const [switching, setSwitching] = useState(false)

  const displayName = currentUserId || "Player"
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
      Taro.showToast({ title: 'Switched', icon: 'success' })
    } catch (err: any) {
      console.error('dev switch failed', err)
      Taro.showToast({ title: err?.message || 'Failed', icon: 'none' })
    } finally {
      setSwitching(false)
    }
  }

  return (
    <View className='profile-page'>
      <View className='section'>
        <Text className='section-title'>我的</Text>
        <View className='hero'>
          <View className='avatar-wrap'>
            <View className='avatar'>🐱</View>
          </View>
          <View className='hero-main'>
            <View className='hero-head'>
              <Text className='hero-name'>{displayName}</Text>
              <Text className='hero-stars'>{'★★★★★'.slice(0, displayStars)}</Text>
            </View>
            <Text className='feed-desc'>勇敢的探索者，继续你的星旅吧！</Text>
          </View>
        </View>
      </View>

      {canUseDev && (
        <View className='section'>
          <Text className='section-title'>Dev</Text>
          <Text className='feed-desc'>Current userId: {currentUserId || '(empty)'}</Text>

          <View className='one-line-row'>
            <Input
              className='modal-input'
              value={devUserId}
              onInput={(e) => setDevUserId(e.detail.value)}
              placeholder='dev:alice'
            />
            <Button className='ai-btn' loading={switching} onClick={() => void handleDevSwitch(devUserId)}>
              Switch
            </Button>
          </View>

          <View className='one-line-row'>
            <Button className='ai-btn' disabled={switching} onClick={() => void handleDevSwitch('dev:alice')}>
              dev:alice
            </Button>
            <Button className='ai-btn' disabled={switching} onClick={() => void handleDevSwitch('dev:bob')}>
              dev:bob
            </Button>
            <Button className='ai-btn' disabled={switching} onClick={() => void handleDevSwitch('dev:carol')}>
              dev:carol
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}