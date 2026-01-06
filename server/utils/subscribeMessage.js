const axios = require('axios')

const accessTokenCache = { value: null, expireAt: 0 }
const templateCache = new Map()

const normalizeLabel = (value) => String(value || '').trim().replace(/[\p{P}\p{S}]+$/u, '').trim()

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

  const response = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: { grant_type: 'client_credential', appid, secret },
  })
  const token = response.data?.access_token
  const expiresIn = Number(response.data?.expires_in || 0)
  if (!token || !expiresIn) return null

  accessTokenCache.value = token
  accessTokenCache.expireAt = now + Math.max(0, expiresIn - 120) * 1000
  return token
}

const getTemplateKeywordMap = async (templateId) => {
  if (!templateId) return null
  if (templateCache.has(templateId)) return templateCache.get(templateId)

  const token = await getAccessToken()
  if (!token) return null

  const response = await axios.post(
    'https://api.weixin.qq.com/wxaapi/newtmpl/gettemplate',
    {},
    { params: { access_token: token } }
  )
  const list = response.data?.data || response.data?.list || []
  const template = list.find((item) => item.priTmplId === templateId || item.template_id === templateId)
  const map = parseTemplateContent(template?.content || '')
  templateCache.set(templateId, map)
  return map
}

const buildMessageData = (keywordMap, dataByLabel) => {
  if (!keywordMap || !dataByLabel) return {}
  const data = {}
  Object.entries(dataByLabel).forEach(([label, value]) => {
    const key = keywordMap[label]
    if (!key) return
    const text = String(value ?? '').trim()
    if (!text) return
    data[key] = { value: text }
  })
  return data
}

const sendSubscribeMessage = async ({ toUserId, templateId, page, dataByLabel }) => {
  if (!templateId || !toUserId) return { ok: false, reason: 'missing params' }
  const openid = String(toUserId).startsWith('wx:') ? String(toUserId).slice(3) : String(toUserId)
  if (!openid) return { ok: false, reason: 'missing openid' }

  const token = await getAccessToken()
  if (!token) return { ok: false, reason: 'missing access token' }

  const keywordMap = await getTemplateKeywordMap(templateId)
  const data = buildMessageData(keywordMap, dataByLabel)
  if (!Object.keys(data).length) return { ok: false, reason: 'empty data' }

  const payload = {
    touser: openid,
    template_id: templateId,
    page: page || 'pages/index/index',
    data,
  }

  const response = await axios.post(
    'https://api.weixin.qq.com/cgi-bin/message/subscribe/send',
    payload,
    { params: { access_token: token } }
  )

  const errcode = response.data?.errcode
  if (errcode && errcode !== 0) {
    return { ok: false, reason: response.data?.errmsg || 'send failed', errcode }
  }

  return { ok: true }
}

module.exports = {
  sendSubscribeMessage,
}
