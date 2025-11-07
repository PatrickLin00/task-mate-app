import { View, Text, Input, Textarea, Button } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { getTasks, createTask, type Task } from '@/services/api'
import './index.scss'

export default function Index () {
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  useLoad(() => {
    console.log('Page loaded.')
  })

  useEffect(() => {
    // TODO: 支持分页/筛选；加载态与错误态 UI（待设计）
    getTasks().then(setTasks).catch((e) => {
      console.error('加载任务失败', e)
    })
  }, [])

  const onSubmit = async () => {
    if (!title.trim()) return
    try {
      const newTask = await createTask({ title: title.trim(), description })
      setTasks((prev) => [newTask, ...prev])
      setTitle('')
      setDescription('')
    } catch (e) {
      console.error('创建任务失败', e)
    }
  }

  return (
    <View className='index'>
      <View className='form'>
        <Input
          placeholder='任务标题（必填）'
          value={title}
          onInput={(e) => setTitle(e.detail.value)}
        />
        <Textarea
          placeholder='任务描述（可选）'
          value={description}
          onInput={(e) => setDescription(e.detail.value)}
        />
        <Button onClick={onSubmit} disabled={!title.trim()}>创建任务</Button>
      </View>

      <View className='list'>
        {tasks.length === 0 ? (
          <Text>暂无任务</Text>
        ) : (
          tasks.map((t) => (
            <View key={t._id} className='item'>
              <Text className='title'>{t.title}</Text>
              {!!t.description && <Text className='desc'>{t.description}</Text>}
              <Text className='meta'>{t.status || 'pending'}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  )
}
