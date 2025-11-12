import { View, Text } from '@tarojs/components'
import '../home.scss'

const achs = [
  { id: 'a1', title: '晨曦勇士', desc: '连续 7 天早起打卡' },
  { id: 'a2', title: '疾风行者', desc: '单日步数达 20,000' },
]

export default function AchievementsPane() {
  return (
    <View className='ach-page'>
      <View className='section'>
        <Text className='section-title'>成就</Text>
        <View className='feed-list'>
          {achs.map((a) => (
            <View className='feed-card' key={a.id}>
              <View className='feed-left'>
                <Text className='emoji'>🏅</Text>
              </View>
              <View className='feed-body'>
                <Text className='feed-title'>{a.title}</Text>
                <Text className='feed-desc'>{a.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
