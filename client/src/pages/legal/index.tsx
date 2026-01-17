import { View, Text, ScrollView, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'
import { taskStrings } from '@/pages/index/shared/strings'

declare const APP_NAME: string
declare const APP_OPERATOR: string
declare const APP_SUPPORT_CONTACT: string
declare const APP_LEGAL_TERMS: string
declare const APP_LEGAL_PRIVACY: string

const trimValue = (value?: string) => String(value || '').trim()

export default function LegalPage() {
  const appName = trimValue(APP_NAME) || taskStrings.home.heroName
  const operator = trimValue(APP_OPERATOR)
  const contact = trimValue(APP_SUPPORT_CONTACT)
  const terms = trimValue(APP_LEGAL_TERMS)
  const privacy = trimValue(APP_LEGAL_PRIVACY)

  const handleOpenPrivacyGuide = async () => {
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

  const handleCopyContact = async () => {
    if (!contact) {
      Taro.showToast({ title: taskStrings.legal.missingContact, icon: 'none' })
      return
    }
    await Taro.setClipboardData({ data: contact })
  }

  return (
    <ScrollView className='legal-page' scrollY>
      <View className='legal-card'>
        <Text className='legal-title'>{taskStrings.legal.title}</Text>
        <Text className='legal-sub'>{appName}</Text>
      </View>

      <View className='legal-card'>
        <Text className='legal-section-title'>{taskStrings.legal.termsTitle}</Text>
        <Text className='legal-text'>{terms || taskStrings.legal.missingTerms}</Text>
      </View>

      <View className='legal-card'>
        <Text className='legal-section-title'>{taskStrings.legal.privacyTitle}</Text>
        <Text className='legal-text'>{privacy || taskStrings.legal.missingPrivacy}</Text>
        <Button className='legal-button ghost' onClick={() => void handleOpenPrivacyGuide()}>
          {taskStrings.legal.openPrivacyGuide}
        </Button>
      </View>

      <View className='legal-card'>
        <Text className='legal-section-title'>{taskStrings.legal.operatorTitle}</Text>
        <Text className='legal-text'>
          {operator || taskStrings.legal.missingOperator}
          {'\n'}
          {contact || taskStrings.legal.missingContact}
        </Text>
        <Button className='legal-button ghost' onClick={() => void handleCopyContact()}>
          {taskStrings.legal.copyContact}
        </Button>
      </View>
    </ScrollView>
  )
}
