import { View, Text, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import '../home.scss'
import { devLoginWeapp, getDevUserId, getUserId, logoutWeapp } from '@/services/auth'
import { requestTaskSubscribeAuth } from '@/services/subscribe'
import { updateProfile } from '@/services/api'
import { taskStrings } from '../shared/strings'

declare const DEV_AUTH_ENABLED: boolean

export default function ProfilePane({
  onAuthChanged,
  nickname,
}: {
  onAuthChanged?: () => void
  nickname?: string
}) {
  const [currentUserId, setCurrentUserId] = useState(() => getUserId() || '')
  const [devUserId, setDevUserId] = useState(() => getDevUserId() || '')
  const [switching, setSwitching] = useState(false)
  const [nicknameDraft, setNicknameDraft] = useState(() => nickname || '')
  const [savingNickname, setSavingNickname] = useState(false)

  const displayName = nickname || currentUserId || taskStrings.home.heroName
  const displayStars = 0

  const canUseDev = DEV_AUTH_ENABLED

  useEffect(() => {
    setNicknameDraft(nickname || '')
  }, [nickname])

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

  const handleOpenPrivacy = async () => {
    const openPrivacy = (Taro as any)?.openPrivacyContract
    if (typeof openPrivacy !== 'function') {
      Taro.showToast({ title: taskStrings.profile.privacyHint, icon: 'none' })
      return
    }
    try {
      await openPrivacy()
    } catch (err) {
      console.warn('open privacy failed', err)
      Taro.showToast({ title: taskStrings.profile.privacyHint, icon: 'none' })
    }
  }

  const handleOpenLegal = () => {
    Taro.navigateTo({ url: '/pages/legal/index' })
  }

  const handleLogout = async () => {
    const res = await Taro.showModal({
      title: taskStrings.profile.logoutTitle,
      content: taskStrings.profile.logoutContent,
      confirmText: taskStrings.profile.logoutOk,
      cancelText: taskStrings.profile.logoutCancel,
    })
    if (!res.confirm) return
    logoutWeapp()
    setCurrentUserId('')
    onAuthChanged?.()
    Taro.showToast({ title: taskStrings.profile.logoutSuccess, icon: 'none' })
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
        <View className='one-line-row'>
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
        <View className='one-line-row'>
          <Button className='ai-btn' onClick={() => void handleSubscribeSettings()}>
            {taskStrings.profile.subscribeLabel}
          </Button>
        </View>
        <View className='one-line-row'>
          <Button className='ai-btn' onClick={() => void handleOpenPrivacy()}>
            {taskStrings.profile.privacyLabel}
          </Button>
        </View>
        <View className='one-line-row'>
          <Button className='ai-btn' onClick={handleOpenLegal}>
            {taskStrings.profile.legalLabel}
          </Button>
        </View>
        <View className='one-line-row'>
          <Button className='ai-btn' onClick={() => void handleLogout()}>
            {taskStrings.profile.logoutLabel}
          </Button>
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
