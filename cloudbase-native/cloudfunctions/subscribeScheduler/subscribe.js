const https = require('https')

const accessTokenCache = { value: '', expireAt: 0 }
const templateCache = new Map()

const SCENES = {
  todo: 'todo',
  taskUpdate: 'taskUpdate',
  review: 'review',
  work: 'work',
}

const TEMPLATE_ENV_MAP = {
  [SCENES.todo]: 'SUBSCRIBE_TPL_TODO',
  [SCENES.taskUpdate]: 'SUBSCRIBE_TPL_TASK_UPDATE',
  [SCENES.review]: 'SUBSCRIBE_TPL_REVIEW',
  [SCENES.work]: 'SUBSCRIBE_TPL_WORK',
}

function buildWechatRequestOptions() {
  const insecure = String(process.env.WEAPP_TLS_INSECURE || '').toLowerCase() === 'true'
  return insecure ? { agent: new https.Agent({ rejectUnauthorized: false }) } : {}
}

function requestJson(rawUrl, options) {
  return new Promise((resolve, reject) => {
    const method = (options && options.method ? options.method : 'GET').toUpperCase()
    const params = options && options.params ? options.params : null
    const body = options && options.body ? options.body : null
    const url = new URL(rawUrl)
    if (params) {
      Object.keys(params).forEach((key) => {
        const value = params[key]
        if (value == null || value === '') return
        url.searchParams.set(key, String(value))
      })
    }
    const payload = body == null ? '' : JSON.stringify(body)
    const request = https.request(
      url,
      Object.assign(
        {
          method,
          headers: payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {},
        },
        buildWechatRequestOptions()
      ),
      (response) => {
        let text = ''
        response.on('data', (chunk) => {
          text += chunk
        })
        response.on('end', () => {
          try {
            resolve(text ? JSON.parse(text) : {})
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

function getTemplateConfig() {
  return Object.keys(TEMPLATE_ENV_MAP).reduce((result, scene) => {
    result[scene] = String(process.env[TEMPLATE_ENV_MAP[scene]] || '').trim()
    return result
  }, {})
}

function normalizePreferences(raw, templates) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const templateMap = templates || getTemplateConfig()
  return Object.keys(TEMPLATE_ENV_MAP).reduce((result, scene) => {
    const current = source[scene] && typeof source[scene] === 'object' ? source[scene] : {}
    result[scene] = {
      templateId: templateMap[scene] || '',
      status: current.templateId === (templateMap[scene] || '') ? String(current.status || '') : '',
      updatedAt: current.updatedAt || '',
      authorizedAt: current.authorizedAt || '',
      lastSentAt: current.lastSentAt || '',
    }
    return result
  }, {})
}

function markSceneConsumed(current, scene, currentTime) {
  const next = Object.assign({}, current)
  const previous = current && current[scene] ? current[scene] : {}
  const nowIso = (currentTime instanceof Date ? currentTime : new Date()).toISOString()
  next[scene] = Object.assign({}, previous, {
    status: 'pending_reauth',
    updatedAt: nowIso,
    lastSentAt: nowIso,
  })
  return next
}

function addAliases(data, labels, value) {
  const text = String(value == null ? '' : value).trim()
  if (!text) return
  labels.forEach((label) => {
    data[label] = text
  })
}

function buildSubscribeData(fields) {
  const source = fields || {}
  const data = {}
  addAliases(data, ['任务名称', '事项主题', '卡片名称'], source.taskName)
  addAliases(data, ['执行人'], source.assignee)
  addAliases(data, ['发布人', '发起人'], source.creator)
  addAliases(data, ['发布时间', '开始时间', '起始时间'], source.startTime)
  addAliases(data, ['截止时间', '到期时间'], source.dueTime)
  addAliases(data, ['剩余时间'], source.remainTime)
  addAliases(data, ['提醒时间'], source.remindTime)
  addAliases(data, ['状态', '任务状态'], source.status)
  addAliases(data, ['温馨提示', '备注消息', '提示', '备注'], source.tip)
  addAliases(data, ['修改详情'], source.changeDetail)
  addAliases(data, ['修改时间'], source.changeTime)
  addAliases(data, ['审核类型'], source.reviewType)
  addAliases(data, ['审核结果'], source.reviewResult)
  addAliases(data, ['拒绝理由'], source.rejectReason)
  addAliases(data, ['通知时间'], source.notifyTime)
  addAliases(data, ['审核人'], source.reviewer)
  return data
}

function normalizeLabel(value) {
  return String(value || '')
    .trim()
    .replace(/[：:，,。；;、!！?？]+$/g, '')
    .trim()
}

function stripEmoji(value) {
  return String(value || '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatWxTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function normalizePhraseValue(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const map = [
    { match: ['待确认'], value: '待确认' },
    { match: ['待检视'], value: '待检视' },
    { match: ['即将截止', '临近'], value: '即将截止' },
    { match: ['放弃'], value: '已放弃' },
    { match: ['关闭'], value: '已关闭' },
    { match: ['过期', '超时'], value: '已过期' },
    { match: ['完成', '已完成'], value: '已完成' },
    { match: ['接取', '已接取', '处理中'], value: '已接取' },
    { match: ['待接取', '未接取'], value: '待接取' },
  ]
  for (let index = 0; index < map.length; index += 1) {
    const item = map[index]
    if (item.match.some((word) => text.includes(word))) return item.value
  }
  return '已接取'
}

function normalizeValueByKey(key, value) {
  const raw = stripEmoji(String(value == null ? '' : value)).replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  const lower = String(key || '').toLowerCase()
  if (lower.startsWith('phrase')) return normalizePhraseValue(raw)
  if (lower.startsWith('time') || lower.startsWith('date')) return formatWxTime(raw) || raw
  if (lower.startsWith('number')) {
    const digits = raw.replace(/[^\d.]/g, '')
    return digits || raw
  }
  return raw.length > 20 ? raw.slice(0, 20) : raw
}

function parseTemplateContent(content) {
  if (!content) return {}
  const map = {}
  const regex = /([^\n\r]*?)\{\{(\w+)\.DATA\}\}/g
  let match = null
  while ((match = regex.exec(content)) !== null) {
    const label = normalizeLabel(match[1])
    const key = match[2]
    if (label && key && !map[label]) map[label] = key
  }
  return map
}

async function getAccessToken() {
  const now = Date.now()
  if (accessTokenCache.value && accessTokenCache.expireAt > now) return accessTokenCache.value
  const appid = String(process.env.WEAPP_APPID || '').trim()
  const secret = String(process.env.WEAPP_SECRET || '').trim()
  if (!appid || !secret) return ''
  const response = await requestJson('https://api.weixin.qq.com/cgi-bin/token', {
    params: {
      grant_type: 'client_credential',
      appid,
      secret,
    },
  }).catch(() => null)
  const token = response && response.access_token ? response.access_token : ''
  const expiresIn = Number(response && response.expires_in ? response.expires_in : 0)
  if (!token || !expiresIn) return ''
  accessTokenCache.value = token
  accessTokenCache.expireAt = now + Math.max(0, expiresIn - 120) * 1000
  return token
}

async function getTemplateKeywordMap(templateId) {
  if (!templateId) return null
  if (templateCache.has(templateId)) return templateCache.get(templateId)
  const token = await getAccessToken()
  if (!token) return null
  const response = await requestJson('https://api.weixin.qq.com/wxaapi/newtmpl/gettemplate', {
    method: 'POST',
    params: { access_token: token },
    body: {},
  }).catch(() => null)
  const list = (response && (response.data || response.list)) || []
  const template = list.find((item) => item.priTmplId === templateId || item.template_id === templateId)
  const keywordMap = parseTemplateContent(template && template.content ? template.content : '')
  templateCache.set(templateId, keywordMap)
  return keywordMap
}

function defaultValueForKey(key, now) {
  const lower = String(key || '').toLowerCase()
  if (lower.startsWith('time') || lower.startsWith('date')) return now
  if (lower.startsWith('number')) return '1'
  return '任务提醒'
}

function buildMessageData(keywordMap, dataByLabel) {
  if (!keywordMap) return {}
  const data = {}
  const now = new Date()
  Object.keys(keywordMap).forEach((label) => {
    const key = keywordMap[label]
    const raw = dataByLabel ? dataByLabel[label] : ''
    const value = raw == null || String(raw).trim() === '' ? defaultValueForKey(key, now) : raw
    const normalized = normalizeValueByKey(key, value)
    if (!normalized) return
    data[key] = { value: normalized }
  })
  return data
}

async function sendSubscribeMessage(options) {
  const toUserId = String(options && options.toUserId ? options.toUserId : '').trim()
  const templateId = String(options && options.templateId ? options.templateId : '').trim()
  const page = String(options && options.page ? options.page : 'pages/home/index').trim()
  const dataByLabel = options && options.dataByLabel ? options.dataByLabel : {}
  if (!toUserId || !templateId) return { ok: false, reason: 'missing params' }
  const token = await getAccessToken()
  if (!token) return { ok: false, reason: 'missing access token' }
  const keywordMap = await getTemplateKeywordMap(templateId)
  const data = buildMessageData(keywordMap, dataByLabel)
  if (!Object.keys(data).length) return { ok: false, reason: 'empty data' }
  const response = await requestJson('https://api.weixin.qq.com/cgi-bin/message/subscribe/send', {
    method: 'POST',
    params: { access_token: token },
    body: {
      touser: toUserId,
      template_id: templateId,
      page,
      data,
    },
  }).catch((error) => ({ errcode: -1, errmsg: error && error.message ? error.message : 'request failed' }))
  const errcode = Number(response && response.errcode ? response.errcode : 0)
  if (errcode && errcode !== 0) {
    return {
      ok: false,
      reason: response && response.errmsg ? response.errmsg : 'send failed',
      errcode,
    }
  }
  return { ok: true }
}

module.exports = {
  SCENES,
  getTemplateConfig,
  normalizePreferences,
  markSceneConsumed,
  buildSubscribeData,
  sendSubscribeMessage,
}
