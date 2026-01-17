import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'
import { taskStrings } from '@/pages/index/shared/strings'

export default function AboutPage() {
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

  const handleClearCache = async () => {
    const res = await Taro.showModal({
      title: taskStrings.about.clearTitle,
      content: taskStrings.about.clearContent,
      confirmText: taskStrings.about.clearOk,
      cancelText: taskStrings.about.clearCancel,
    })
    if (!res.confirm) return
    try {
      Taro.clearStorageSync()
    } catch (err) {
      console.warn('clear cache failed', err)
    }
    Taro.showToast({ title: taskStrings.about.clearSuccess, icon: 'none' })
    Taro.reLaunch({ url: '/pages/index/index' })
  }

  return (
    <View className='about-page'>
      <View className='about-card'>
        <Text className='about-title'>{taskStrings.about.title}</Text>
        <Text className='about-sub'>{taskStrings.about.sub}</Text>
      </View>

      <View className='about-card'>
        <Text className='about-section'>{taskStrings.about.privacyTitle}</Text>
        <Button className='about-button ghost' onClick={() => void handleOpenPrivacy()}>
          {taskStrings.about.privacyAction}
        </Button>
      </View>

      <View className='about-card'>
        <Text className='about-section'>{taskStrings.about.legalTitle}</Text>
        <Button className='about-button' onClick={handleOpenLegal}>
          {taskStrings.about.legalAction}
        </Button>
      </View>

      <View className='about-card'>
        <Text className='about-section'>{taskStrings.about.clearTitle}</Text>
        <Text className='about-desc'>{taskStrings.about.clearHint}</Text>
        <Button className='about-button danger' onClick={() => void handleClearCache()}>
          {taskStrings.about.clearAction}
        </Button>
      </View>
    </View>
  )
}
