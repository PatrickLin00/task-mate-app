import { useLoad, useShareAppMessage } from "@tarojs/taro"
import { View, Text, Button } from "@tarojs/components"
import { useState } from "react"
import { getTask, type Task } from "@/services/api"
import "./detail.scss"

export default function TaskDetail() {
  const [task, setTask] = useState<Task | null>(null)

  useLoad((options) => {
    const id = (options as any)?.taskId as string
    if (id) {
      getTask(id)
        .then(setTask)
        .catch((e) => {
          console.error("加载任务失败", e)
        })
    }
  })

  useShareAppMessage(() => {
    const title = task?.title || "任务详情"
    const path = task?._id ? `/pages/task/detail?taskId=${task._id}` : "/pages/index/index"
    return { title, path }
  })

  if (!task) {
    return (
      <View className="task-detail">
        <Text>加载中...</Text>
      </View>
    )
  }

  return (
    <View className="task-detail">
      <Text className="title">{task.title}</Text>
      {!!task.description && <Text className="desc">{task.description}</Text>}
      <Text className="meta">状态：{task.status || "pending"}</Text>
      {/* 微信端可见的原生分享按钮 */}
      <View style={{ marginTop: "16px" }}>
        <Button openType="share" type="primary">
          分享给好友
        </Button>
      </View>
    </View>
  )
}
