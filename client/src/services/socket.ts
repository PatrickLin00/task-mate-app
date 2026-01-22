import Taro from '@tarojs/taro'
import { ensureWeappLogin, getToken } from '@/services/auth'
import { fetchTaskDashboard } from '@/services/api'

type SocketState = {
  socket?: Taro.SocketTask
  reconnectTimer?: ReturnType<typeof setTimeout>
  refreshTimer?: ReturnType<typeof setTimeout>
  connecting: boolean
  refreshInFlight: boolean
}

const state: SocketState = {
  connecting: false,
  refreshInFlight: false,
}

const reconnectDelay = 3000

const resolveWsUrl = () => {
  const explicit = process.env.TARO_APP_WS_URL
  const base = process.env.TARO_APP_API_BASE_URL || process.env.TASKMATE_API_BASE_URL
  const isLocalBase = (value: string) =>
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/.test(value)
  if (explicit && (!base || !isLocalBase(base))) return explicit
  if (!base) return explicit || ''
  const wsBase = base.replace(/^https?:\/\//, (proto) => (proto === 'https://' ? 'wss://' : 'ws://'))
  return wsBase.replace(/\/$/, '') + '/ws'
}

const scheduleRefresh = () => {
  if (state.refreshTimer) return
  state.refreshTimer = setTimeout(async () => {
    state.refreshTimer = undefined
    if (state.refreshInFlight) return
    state.refreshInFlight = true
    try {
      await fetchTaskDashboard({ force: true })
    } finally {
      state.refreshInFlight = false
    }
  }, 120)
}

const bindSocket = (socket: Taro.SocketTask) => {
  const sendAuth = () => {
    if (process.env.TARO_APP_TASK_DEBUG === 'true') {
      console.log('[ws] connected', { url: state.socket ? 'connected' : 'unknown' })
    }
    const token = getToken()
    if (token) {
      socket.send({ data: JSON.stringify({ type: 'auth', token }) })
    }
  }

  const handleMessage = (msg: { data?: string }) => {
    const raw = typeof msg.data === 'string' ? msg.data : ''
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.type === 'task.changed' || parsed?.type === 'task.removed') {
        scheduleRefresh()
      }
    } catch {
      // ignore
    }
  }

  const handleClose = () => {
    state.socket = undefined
    if (!state.reconnectTimer) {
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = undefined
        void connectTaskSocket()
      }, reconnectDelay)
    }
  }

  const handleError = () => {
    state.socket = undefined
  }

  if (typeof socket.onOpen === 'function') {
    socket.onOpen(sendAuth)
  } else {
    Taro.onSocketOpen(sendAuth)
  }

  if (typeof socket.onMessage === 'function') {
    socket.onMessage(handleMessage)
  } else {
    Taro.onSocketMessage(handleMessage)
  }

  if (typeof socket.onClose === 'function') {
    socket.onClose(handleClose)
  } else {
    Taro.onSocketClose(handleClose)
  }

  if (typeof socket.onError === 'function') {
    socket.onError(handleError)
  } else {
    Taro.onSocketError(handleError)
  }
}

export async function connectTaskSocket() {
  if (state.connecting || state.socket) return
  const url = resolveWsUrl()
  if (!url) return
  state.connecting = true
  try {
    await ensureWeappLogin()
    const socket = (await Promise.resolve(Taro.connectSocket({ url }))) as Taro.SocketTask
    if (!socket) return
    state.socket = socket
    bindSocket(socket)
  } finally {
    state.connecting = false
  }
}

export function closeTaskSocket() {
  if (state.socket) {
    state.socket.close({ code: 1000, reason: 'client close' })
    state.socket = undefined
  }
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = undefined
  }
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer)
    state.refreshTimer = undefined
  }
}
