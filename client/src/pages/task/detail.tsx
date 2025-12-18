import { useLoad, useShareAppMessage } from "@tarojs/taro"
import { View, Text, Button } from "@tarojs/components"
import { useState } from "react"
import { getTask, type Task } from "@/services/api"
import "./detail.scss"

const TASK_STATUS_LABEL: Record<NonNullable<Task["status"]>, string> = {
  pending: "待接取",
  in_progress: "待完成",
  review_pending: "待检视",
  completed: "已完成",
  closed: "已关闭",
}

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
        <Text>{"加载中..."}</Text>
      </View>
    )
  }

  const statusLabel = TASK_STATUS_LABEL[task.status || "pending"]

  return (
    <View className="task-detail">
      <Text className="title">{task.title}</Text>
      {!!task.detail && <Text className="desc">{task.detail}</Text>}
      <Text className="meta">
        {"状态: "}
        {statusLabel}
      </Text>
      <View style={{ marginTop: "16px" }}>
        <Button openType="share" type="primary">
          {"分享给好友"}
        </Button>
      </View>
    </View>
  )
}
