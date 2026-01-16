const axios = require('axios')
const https = require('https')

const accessTokenCache = { value: null, expireAt: 0 }
const templateCache = new Map()
const isDebug = () => String(process.env.SUBSCRIBE_DEBUG || '').toLowerCase() === 'true'

const normalizeLabel = (value) => String(value || '').trim().replace(/[\p{P}\p{S}]+$/u, '').trim()

const stripEmoji = (value) =>
  String(value || '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')

const pad2 = (value) => String(value).padStart(2, '0')
const formatWxTime = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`
}

const normalizePhraseValue = (raw) => {
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
  for (const item of map) {
    if (item.match.some((word) => text.includes(word))) return item.value
  }
  return '已接取'
}

const normalizeValueByKey = (key, value) => {
  const raw = stripEmoji(String(value ?? '')).replace(/\s+/g, ' ').trim()
  if (!raw) return ''

  const lower = String(key || '').toLowerCase()
  if (lower.startsWith('phrase')) {
    const phrase = normalizePhraseValue(raw)
    return phrase ? phrase : ''
  }
  if (lower.startsWith('time') || lower.startsWith('date')) {
    const formatted = formatWxTime(raw)
    return formatted || raw
  }
  if (lower.startsWith('number')) {
    const digits = raw.replace(/[^\d.]/g, '')
    return digits || raw
  }
  if (
    lower.startsWith('thing') ||
    lower.startsWith('phrase') ||
    lower.startsWith('character_string') ||
    lower.startsWith('name')
  ) {
    return raw.length > 20 ? raw.slice(0, 20) : raw
  }
  return raw.length > 20 ? raw.slice(0, 20) : raw
}

const buildWechatRequestOptions = () => {
  const insecure = String(process.env.WEAPP_TLS_INSECURE || '').toLowerCase() === 'true'
  const base = { proxy: false }
  if (!insecure) return base
  return { ...base, httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
}

const parseTemplateContent = (content) => {
  if (!content) return {}
  const map = {}
  const regex = /([^\n\r]*?)\{\{(\w+)\.DATA\}\}/g
  let match = null
  while ((match = regex.exec(content)) !== null) {
    const label = normalizeLabel(match[1])
    const key = match[2]
    if (label && key && !map[label]) {
      map[label] = key
    }
  }
  return map
}

const getAccessToken = async () => {
  const now = Date.now()
  if (accessTokenCache.value && accessTokenCache.expireAt > now) {
    return accessTokenCache.value
  }

  const appid = process.env.WEAPP_APPID
  const secret = process.env.WEAPP_SECRET
  if (!appid || !secret) return null

  let response = null
  try {
    response = await axios.get(
      'https://api.weixin.qq.com/cgi-bin/token',
      { params: { grant_type: 'client_credential', appid, secret }, ...buildWechatRequestOptions() }
    )
  } catch (err) {
    if (isDebug()) {
      console.log('subscribe token request failed', err?.message || err)
    }
    return null
  }
  const token = response?.data?.access_token
  const expiresIn = Number(response?.data?.expires_in || 0)
  if (!token || !expiresIn) {
    if (isDebug()) {
      console.log('subscribe token missing', response?.data)
    }
    return null
  }

  accessTokenCache.value = token
  accessTokenCache.expireAt = now + Math.max(0, expiresIn - 120) * 1000
  return token
}

const getTemplateKeywordMap = async (templateId) => {
  if (!templateId) return null
  if (templateCache.has(templateId)) return templateCache.get(templateId)

  const token = await getAccessToken()
  if (!token) return null

  let response = null
  try {
    response = await axios.post(
      'https://api.weixin.qq.com/wxaapi/newtmpl/gettemplate',
      {},
      { params: { access_token: token }, ...buildWechatRequestOptions() }
    )
  } catch (err) {
    if (isDebug()) {
      console.log('subscribe template fetch failed', err?.message || err)
    }
    return null
  }
  const list = response.data?.data || response.data?.list || []
  const template = list.find((item) => item.priTmplId === templateId || item.template_id === templateId)
  const map = parseTemplateContent(template?.content || '')
  templateCache.set(templateId, map)
  return map
}

const defaultValueForKey = (key, now) => {
  const lower = String(key || '').toLowerCase()
  if (lower.startsWith('time') || lower.startsWith('date')) return now
  if (lower.startsWith('number')) return '1'
  return '无'
}

const buildMessageData = (keywordMap, dataByLabel) => {
  if (!keywordMap) return {}
  const data = {}
  const now = new Date()
  Object.entries(keywordMap).forEach(([label, key]) => {
    const raw = dataByLabel ? dataByLabel[label] : undefined
    const value = raw == null || String(raw).trim() === '' ? defaultValueForKey(key, now) : raw
    const text = normalizeValueByKey(key, value)
    if (!text) return
    data[key] = { value: text }
  })
  return data
}

const sendSubscribeMessage = async ({ toUserId, templateId, page, dataByLabel, context }) => {
  if (!templateId || !toUserId) return { ok: false, reason: 'missing params' }
  const openid = String(toUserId).startsWith('wx:') ? String(toUserId).slice(3) : String(toUserId)
  if (!openid) return { ok: false, reason: 'missing openid' }

  const token = await getAccessToken()
  if (!token) {
    if (isDebug()) {
      console.log('subscribe token missing for send', { templateId, openid, context })
    }
    return { ok: false, reason: 'missing access token' }
  }

  const keywordMap = await getTemplateKeywordMap(templateId)
  const data = buildMessageData(keywordMap, dataByLabel)
  if (!Object.keys(data).length) return { ok: false, reason: 'empty data' }

  const payload = {
    touser: openid,
    template_id: templateId,
    page: page || 'pages/index/index',
    data,
  }

  if (isDebug()) {
    console.log('subscribe send start', {
      templateId,
      openid,
      page: payload.page,
      labels: Object.keys(dataByLabel || {}),
      data,
      context,
    })
  }
  let response = null
  try {
    response = await axios.post(
      'https://api.weixin.qq.com/cgi-bin/message/subscribe/send',
      payload,
      { params: { access_token: token }, ...buildWechatRequestOptions() }
    )
  } catch (err) {
    if (isDebug()) {
      console.log('subscribe send failed', { message: err?.message || err, context })
    }
    return { ok: false, reason: 'request failed' }
  }

  const errcode = response.data?.errcode
  if (errcode && errcode !== 0) {
    if (isDebug()) {
      console.log('subscribe send error', { errcode, errmsg: response.data?.errmsg, context })
    }
    return { ok: false, reason: response.data?.errmsg || 'send failed', errcode }
  }

  if (isDebug()) {
    console.log('subscribe send ok', { templateId, openid, context })
  }
  return { ok: true }
}

module.exports = {
  sendSubscribeMessage,
}
