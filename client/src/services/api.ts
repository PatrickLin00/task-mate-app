import Taro from '@tarojs/taro'
import { ensureWeappLogin, getToken } from '@/services/auth'

declare const API_BASE_URL: string
declare const TASK_DEBUG: boolean

const BASE_URL: string =
  typeof API_BASE_URL !== 'undefined' && API_BASE_URL
    ? API_BASE_URL
    : process.env.NODE_ENV === 'production'
      ? ''
      : 'http://localhost:3000'

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'review_pending'
  | 'pending_confirmation'
  | 'completed'
  | 'closed'
  | 'refactored'
export type RewardType = 'strength' | 'wisdom' | 'agility'

export type Subtask = { _id?: string; title: string; current: number; total: number }
export type Task = {
  _id?: string
  title: string
  icon?: string
  detail?: string
  dueAt: string
  startAt?: string
  closedAt?: string | null
  completedAt?: string | null
  deleteAt?: string | null
  originalDueAt?: string | null
  originalStartAt?: string | null
  originalStatus?: TaskStatus | null
  subtasks?: Subtask[]
  status: TaskStatus
  creatorId: string
  assigneeId?: string | null
  previousTaskId?: string | null
  ownerId?: string | null
  sourceTaskId?: string | null
  attributeReward: { type: RewardType; value: number }
  computedProgress?: { current: number; total: number }
  createdAt?: string
  updatedAt?: string
  seedKey?: string | null
}

const authHeader = () => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const authHeaderAsync = async () => {
  if (TASK_DEBUG) {
    console.log("auth header start")
  }
  await ensureWeappLogin()
  const header = authHeader()
  if (TASK_DEBUG) {
    console.log("auth header ready", {
      hasAuth: Boolean(header.Authorization),
    })
  }
  return header
}

const isOkStatus = (statusCode?: number) =>
  typeof statusCode === 'number' && statusCode >= 200 && statusCode < 300

const requestJson = async <T>(options: Taro.request.Option): Promise<T> => {
  try {
    if (TASK_DEBUG) {
      console.log('api request start', {
        url: options.url,
        method: options.method,
      })
    }
    const res = await Taro.request<T>(options)
    const statusCode = (res as any).statusCode
    if (!isOkStatus(statusCode)) {
      const data: any = (res as any).data
      const message =
        typeof data?.error === 'string'
          ? data.error
          : typeof data?.message === 'string'
            ? data.message
            : 'request failed'
      if (TASK_DEBUG) {
        console.log('api request error', {
          url: options.url,
          method: options.method,
          statusCode,
          data,
        })
      }
      const err: any = new Error(message)
      err.statusCode = statusCode
      err.data = data
      throw err
    }
    return res.data as any
  } catch (err) {
    if (TASK_DEBUG) {
      console.log('api request exception', {
        url: options.url,
        method: options.method,
        error: (err as any)?.message || String(err),
      })
    }
    throw err
  }
}

export async function fetchTasks(status?: Task['status']) {
  return requestJson<Task[]>({
    url: `${BASE_URL}/api/tasks`,
    method: 'GET',
    data: status ? { status } : undefined,
    header: await authHeaderAsync(),
  })
}

export type TodayTasksResponse = { dueTodayCount: number; tasks: Task[] }

export async function fetchMissionTasks() {
  return requestJson<Task[]>({
    url: `${BASE_URL}/api/tasks/mission`,
    method: 'GET',
    header: await authHeaderAsync(),
  })
}

export async function fetchCollabTasks() {
  return requestJson<Task[]>({
    url: `${BASE_URL}/api/tasks/collab`,
    method: 'GET',
    header: await authHeaderAsync(),
  })
}

export async function fetchArchivedTasks() {
  return requestJson<Task[]>({
    url: `${BASE_URL}/api/tasks/archive`,
    method: 'GET',
    header: await authHeaderAsync(),
  })
}

export async function fetchChallengeTasks() {
  return requestJson<Task[]>({
    url: `${BASE_URL}/api/tasks/challenge`,
    method: 'GET',
    header: await authHeaderAsync(),
  })
}

export async function acceptChallengeTask(id: string) {
  return requestJson<Task>({
    url: `${BASE_URL}/api/tasks/challenge/${id}/accept`,
    method: 'POST',
    header: await authHeaderAsync(),
  })
}

export async function acceptTask(id: string) {
  return requestJson<Task>({
    url: `${BASE_URL}/api/tasks/${id}/accept`,
    method: 'POST',
    header: await authHeaderAsync(),
  })
}

export async function fetchTodayTasks() {
  return requestJson<TodayTasksResponse>({
    url: `${BASE_URL}/api/tasks/today`,
    method: 'GET',
    header: await authHeaderAsync(),
  })
}

export async function createTask(payload: {
  title: string
  detail?: string
  dueAt: string
  subtasks: { title: string; total: number; current?: number }[]
  attributeReward: { type: RewardType; value: number }
  selfAssign?: boolean
}) {
  return requestJson<Task>({
    url: `${BASE_URL}/api/tasks`,
    method: 'POST',
    data: {
      ...payload,
      subtasks: payload.subtasks.map((s) => ({ current: 0, ...s })),
    },
    header: { 'Content-Type': 'application/json', ...(await authHeaderAsync()) },
  })
}

export async function patchProgress(id: string, progress: { current?: number; subtaskIndex?: number }) {
  return requestJson<Task>({
    url: `${BASE_URL}/api/tasks/${id}/progress`,
    method: 'PATCH',
    data: progress,
    header: { 'Content-Type': 'application/json', ...(await authHeaderAsync()) },
  })
}

export async function completeTask(id: string) {
  return requestJson<Task>({
    url: `${BASE_URL}/api/tasks/${id}/complete`,
    method: 'PATCH',
    header: await authHeaderAsync(),
  })
}

export async function abandonTask(id: string) {
  return requestJson<Task>({
    url: `${BASE_URL}/api/tasks/${id}/abandon`,
    method: 'PATCH',
    header: await authHeaderAsync(),
  })
}

export async function closeTask(id: string) {
  return requestJson<Task>({
    url: `${BASE_URL}/api/tasks/${id}/close`,
    method: 'PATCH',
    header: await authHeaderAsync(),
  })
}

export async function restartTask(id: string) {
  return requestJson<Task>({
    url: `${BASE_URL}/api/tasks/${id}/restart`,
    method: 'PATCH',
    header: await authHeaderAsync(),
  })
}

export async function deleteTask(id: string) {
  return requestJson<{ ok: boolean }>({
    url: `${BASE_URL}/api/tasks/${id}`,
    method: 'DELETE',
    header: await authHeaderAsync(),
  })
}

export async function getTask(id: string) {
  if (TASK_DEBUG) {
    console.log("getTask start", { id })
  }
  return requestJson<Task>({
    url: `${BASE_URL}/api/tasks/${id}`,
    method: 'GET',
    header: await authHeaderAsync(),
  })
}

export type ReworkConfirmResponse = {
  code: 'REWORK_CONFIRM_REQUIRED'
  previousTaskId?: string | null
}

export async function reworkTask(
  id: string,
  payload: {
    title: string
    detail?: string
    dueAt: string
    subtasks: { title: string; total: number; current?: number }[]
    attributeReward: { type: RewardType; value: number }
    icon?: string
    confirmDeletePrevious?: boolean
  }
) {
  return requestJson<Task | ReworkConfirmResponse>({
    url: `${BASE_URL}/api/tasks/${id}/rework`,
    method: 'POST',
    data: {
      ...payload,
      subtasks: payload.subtasks.map((s) => ({ current: 0, ...s })),
    },
    header: { 'Content-Type': 'application/json', ...(await authHeaderAsync()) },
  })
}

export async function acceptReworkTask(id: string) {
  return requestJson<Task>({
    url: `${BASE_URL}/api/tasks/${id}/rework/accept`,
    method: 'POST',
    header: await authHeaderAsync(),
  })
}

export async function rejectReworkTask(id: string) {
  return requestJson<{ ok: boolean }>({
    url: `${BASE_URL}/api/tasks/${id}/rework/reject`,
    method: 'POST',
    header: await authHeaderAsync(),
  })
}

export async function cancelReworkTask(id: string) {
  return requestJson<{ ok: boolean }>({
    url: `${BASE_URL}/api/tasks/${id}/rework/cancel`,
    method: 'POST',
    header: await authHeaderAsync(),
  })
}

export async function generateTaskSuggestion(prompt: string) {
  const now = Date.now()
  const tzOffset = new Date().getTimezoneOffset()
  return requestJson<{
    title: string
    description?: string
    subtasks: { title: string; total: number }[]
    attributeReward?: { type: RewardType; value: number }
    dueAt?: string
  }>({
    url: `${BASE_URL}/api/ai/generate-task`,
    method: 'POST',
    data: { prompt, clientNow: now, clientTzOffset: tzOffset },
    header: { 'Content-Type': 'application/json', ...(await authHeaderAsync()) },
  })
}
