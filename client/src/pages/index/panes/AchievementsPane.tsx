import { View, Text } from '@tarojs/components'
import '../home.scss'
import { taskStrings } from '../shared/strings'

const achievements = taskStrings.achievements

export default function AchievementsPane() {
  return (
    <View className='ach-page'>
      <View className='section'>
        <Text className='section-title'>{achievements.title}</Text>
        <View className='feed-list'>
          {achievements.items.map((item) => (
            <View className='feed-card' key={item.id}>
              <View className='feed-left'>
                <Text className='emoji'>{achievements.icon}</Text>
              </View>
              <View className='feed-body'>
                <Text className='feed-title'>{item.title}</Text>
                <Text className='feed-desc'>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
