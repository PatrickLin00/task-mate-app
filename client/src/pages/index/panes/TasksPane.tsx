import { View, Text, Button } from '@tarojs/components'
import '../home.scss'
import { feedTasks, chipText } from '../shared/mocks'

export default function TasksPane() {
  return (
    <View className='tasks-page'>
      <View className='section'>
        <Text className='section-title'>任务页面</Text>
        <View className='feed-list'>
          {feedTasks.map((t) => (
            <View className='feed-card' key={t.id}>
              <View className='feed-left'>
                <Text className='emoji'>{t.icon}</Text>
              </View>
              <View className='feed-body'>
                <Text className='feed-title'>{t.title}</Text>
                <Text className='feed-desc'>{t.detail}</Text>
                <View className='feed-bottom'>
                  <Text className='feed-meta'>奖励 {chipText(t)}</Text>
                  <Button className='cta'>接取任务</Button>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
