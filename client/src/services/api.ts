// 简易 API 客户端
// TODO: 鉴权（携带 token / cookie）与错误码规范（待后端确定）

import Taro from '@tarojs/taro'

declare const API_BASE_URL: string // 由 Taro defineConstants 注入

const BASE_URL: string = typeof API_BASE_URL !== 'undefined' && API_BASE_URL
  ? API_BASE_URL
  : 'http://localhost:3000'

export type Task = {
  _id?: string
  title: string
  description?: string
  checklist?: string[]
  type?: 'self' | 'collab' | 'public'
  createdBy?: string
  acceptedBy?: string
  status?: 'pending' | 'in_progress' | 'done'
  createdAt?: string
  dueDate?: string
}

export async function getTasks() {
  const res = await Taro.request<Task[]>({
    url: `${BASE_URL}/api/tasks`,
    method: 'GET',
  })
  return res.data
}

export async function createTask(payload: Pick<Task, 'title' | 'description'>) {
  // TODO: 与后端确定完整创建数据结构（checklist、type、dueDate 等）
  const res = await Taro.request<Task>({
    url: `${BASE_URL}/api/tasks/create`,
    method: 'POST',
    data: payload,
    header: { 'Content-Type': 'application/json' },
  })
  return res.data
}

