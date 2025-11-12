// 绠€鏄?API 瀹㈡埛绔?// TODO: 閴存潈锛堟惡甯?token / cookie锛変笌閿欒鐮佽鑼冿紙寰呭悗绔‘瀹氾級

import Taro from '@tarojs/taro'
import { getToken } from '@/services/auth'

declare const API_BASE_URL: string // 鐢?Taro defineConstants 娉ㄥ叆

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
    header: authHeader(),
  })
  return res.data
}

export async function createTask(payload: Pick<Task, 'title' | 'description'>) {
  // TODO: 涓庡悗绔‘瀹氬畬鏁村垱寤烘暟鎹粨鏋勶紙checklist銆乼ype銆乨ueDate 绛夛級
  const res = await Taro.request<Task>({
    url: `${BASE_URL}/api/tasks/create`,
    method: 'POST',
    data: payload,
    header: { 'Content-Type': 'application/json', ...authHeader() },
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

function authHeader() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

