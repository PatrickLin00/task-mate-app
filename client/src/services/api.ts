import Taro from '@tarojs/taro'
import { getToken } from '@/services/auth'

declare const API_BASE_URL: string // 由 Taro defineConstants 注入

const BASE_URL: string =
  typeof API_BASE_URL !== 'undefined' && API_BASE_URL ? API_BASE_URL : 'http://localhost:3000'

export type Subtask = { _id?: string; title: string; current: number; total: number }
export type Task = {
  _id?: string
  title: string
  description?: string
  mode: 'counter' | 'checklist'
  progress?: { current: number; total: number }
  subtasks?: Subtask[]
  status: 'ongoing' | 'completed' | 'abandoned'
  attributeReward: { type: 'strength' | 'wisdom' | 'agility'; value: number }
  computedProgress?: { current: number; total: number }
  createdAt?: string
  updatedAt?: string
}

const authHeader = () => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchTasks(status?: Task['status']) {
  const res = await Taro.request<Task[]>({
    url: `${BASE_URL}/api/tasks`,
    method: 'GET',
    data: status ? { status } : undefined,
    header: authHeader(),
  })
  return res.data
}

export async function createTask(payload: {
  title: string
  description?: string
  subtasks: { title: string; total: number; current?: number }[]
  attributeReward: { type: 'strength' | 'wisdom' | 'agility'; value: number }
}) {
  const res = await Taro.request<Task>({
    url: `${BASE_URL}/api/tasks`,
    method: 'POST',
    data: {
      ...payload,
      mode: 'checklist',
      subtasks: payload.subtasks.map((s) => ({ current: 0, ...s })),
    },
    header: { 'Content-Type': 'application/json', ...authHeader() },
  })
  return res.data
}

export async function patchProgress(id: string, progress: { current?: number; subtaskIndex?: number }) {
  const res = await Taro.request<Task>({
    url: `${BASE_URL}/api/tasks/${id}/progress`,
    method: 'PATCH',
    data: progress,
    header: { 'Content-Type': 'application/json', ...authHeader() },
  })
  return res.data
}

export async function completeTask(id: string) {
  const res = await Taro.request<Task>({
    url: `${BASE_URL}/api/tasks/${id}/complete`,
    method: 'PATCH',
    header: authHeader(),
  })
  return res.data
}

export async function abandonTask(id: string) {
  const res = await Taro.request<Task>({
    url: `${BASE_URL}/api/tasks/${id}/abandon`,
    method: 'PATCH',
    header: authHeader(),
  })
  return res.data
}

export async function getTask(id: string) {
  const res = await Taro.request<Task>({
    url: `${BASE_URL}/api/tasks/${id}`,
    method: 'GET',
    header: authHeader(),
  })
  return res.data
}

export async function generateTaskSuggestion(prompt: string) {
  const res = await Taro.request<{
    title: string
    description?: string
    subtasks: { title: string; total: number }[]
    attributeReward?: { type: 'wisdom' | 'strength' | 'agility'; value: number }
  }>({
    url: `${BASE_URL}/api/ai/generate-task`,
    method: 'POST',
    data: { prompt },
    header: { 'Content-Type': 'application/json', ...authHeader() },
  })
  return res.data
}
