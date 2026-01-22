const jwt = require('jsonwebtoken')
const { WebSocketServer } = require('ws')

let wss = null
const socketsByUser = new Map()
const socketUsers = new WeakMap()

const parseJson = (value) => {
  try {
    return JSON.parse(value)
  } catch (err) {
    return null
  }
}

const normalizeUserId = (value) => {
  if (!value) return null
  const id = String(value).trim()
  return id ? id : null
}

const attachUser = (socket, userId) => {
  const id = normalizeUserId(userId)
  if (!id) return
  socketUsers.set(socket, id)
  const existing = socketsByUser.get(id) || new Set()
  existing.add(socket)
  socketsByUser.set(id, existing)
}

const detachUser = (socket) => {
  const id = socketUsers.get(socket)
  if (!id) return
  const existing = socketsByUser.get(id)
  if (!existing) return
  existing.delete(socket)
  if (existing.size === 0) {
    socketsByUser.delete(id)
  }
}

const sendJson = (socket, payload) => {
  if (!socket || socket.readyState !== socket.OPEN) return
  socket.send(JSON.stringify(payload))
}

const verifyToken = (token) => {
  if (!token) return null
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')
    return decoded?.sub ? String(decoded.sub) : null
  } catch (err) {
    return null
  }
}

const handleAuth = (socket, token) => {
  const userId = verifyToken(token)
  if (!userId) {
    sendJson(socket, { type: 'auth', ok: false })
    return
  }
  attachUser(socket, userId)
  sendJson(socket, { type: 'auth', ok: true, userId })
}

const handleMessage = (socket, message) => {
  const parsed = parseJson(message)
  if (!parsed || typeof parsed !== 'object') return
  if (parsed.type === 'auth') {
    const token = typeof parsed.token === 'string' ? parsed.token : ''
    handleAuth(socket, token)
  } else if (parsed.type === 'ping') {
    sendJson(socket, { type: 'pong', ts: Date.now() })
  }
}

const initWebSocket = (server) => {
  if (wss) return wss
  wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (socket, req) => {
    const url = req?.url || ''
    const tokenMatch = url.match(/[?&]token=([^&]+)/)
    if (tokenMatch) {
      const token = decodeURIComponent(tokenMatch[1])
      handleAuth(socket, token)
    }

    socket.on('message', (data) => {
      handleMessage(socket, data?.toString?.() || '')
    })
    socket.on('close', () => {
      detachUser(socket)
    })
    socket.on('error', () => {
      detachUser(socket)
    })
  })
  return wss
}

const broadcastToUsers = (userIds, payload) => {
  const ids = Array.isArray(userIds) ? userIds : []
  const uniq = Array.from(new Set(ids.map(normalizeUserId).filter(Boolean)))
  if (uniq.length === 0) return
  uniq.forEach((id) => {
    const sockets = socketsByUser.get(id)
    if (!sockets) return
    sockets.forEach((socket) => sendJson(socket, payload))
  })
}

const emitTaskChanged = (task) => {
  if (!task) return
  const userIds = [task.creatorId, task.assigneeId]
  broadcastToUsers(userIds, {
    type: 'task.changed',
    taskId: task._id || task.id,
  })
}

const emitTaskRemoved = (taskId, userIds) => {
  if (!taskId) return
  broadcastToUsers(userIds, {
    type: 'task.removed',
    taskId,
  })
}

module.exports = {
  initWebSocket,
  emitTaskChanged,
  emitTaskRemoved,
}
