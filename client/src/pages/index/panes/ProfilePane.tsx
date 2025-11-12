import { View, Text } from '@tarojs/components'
import '../home.scss'
import { role } from '../shared/mocks'

export default function ProfilePane() {
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
              <Text className='hero-name'>{role.name}</Text>
              <Text className='hero-stars'>{'★★★★★'.slice(0, role.stars)}</Text>
            </View>
            <Text className='feed-desc'>勇敢的探索者，继续你的星旅吧！</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
