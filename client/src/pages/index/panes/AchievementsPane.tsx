import { View, Text } from '@tarojs/components'
import '../home.scss'
import { taskStrings } from '../shared/strings'

const achievements = taskStrings.achievements

export default function AchievementsPane() {
  return (
    <View className='ach-page'>
      <View className='section'>
        <Text className='section-title'>{achievements.title}</Text>
        <View className='ach-coming card'>
          <View className='ach-coming-icon'>
            <Text>{achievements.icon}</Text>
          </View>
          <View className='ach-coming-body'>
            <Text className='ach-coming-title'>{achievements.comingTitle}</Text>
            <Text className='feed-desc'>{achievements.comingDesc}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
