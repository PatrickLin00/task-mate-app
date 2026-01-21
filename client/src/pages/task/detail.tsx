import { useLoad, useShareAppMessage } from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'
import { useState } from 'react'
import { getCachedTaskById, getTask, type Task } from '@/services/api'
import { taskStrings } from '@/pages/index/shared/strings'
import './detail.scss'

export default function TaskDetail() {
  const [task, setTask] = useState<Task | null>(null)

  useLoad((options) => {
    const id = (options as any)?.taskId as string
    if (id) {
      const cached = getCachedTaskById(id)
      if (cached) {
        setTask(cached)
        return
      }
      console.warn('[task-detail] cache miss, fetching', { taskId: id })
      getTask(id)
        .then(setTask)
        .catch((e) => {
          console.error(taskStrings.taskDetail.loadFail, e)
        })
    }
  })

  useShareAppMessage(() => {
    const title = task?.title || taskStrings.taskDetail.defaultTitle
    const path = task?._id ? `/pages/task/detail?taskId=${task._id}` : '/pages/index/index'
    return { title, path }
  })

  if (!task) {
    return (
      <View className='task-detail'>
        <Text>{taskStrings.taskDetail.loading}</Text>
      </View>
    )
  }

  const statusLabel = taskStrings.statusLabels[task.status || 'pending']

  return (
    <View className='task-detail'>
      <Text className='title'>{task.title}</Text>
      {!!task.detail && <Text className='desc'>{task.detail}</Text>}
      <Text className='meta'>
        {taskStrings.taskDetail.statusPrefix}
        {statusLabel}
      </Text>
      <View style={{ marginTop: '16px' }}>
        <Button openType='share' type='primary'>
          {taskStrings.taskDetail.share}
        </Button>
      </View>
    </View>
  )
}
