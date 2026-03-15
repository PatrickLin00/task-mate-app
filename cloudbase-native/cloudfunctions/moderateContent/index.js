const https = require('https')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const LOCAL_BLOCKLIST = [
  '赌博',
  '博彩',
  '赌钱',
  '私彩',
  '约炮',
  '色情',
  '黄片',
  '裸聊',
  '毒品',
  '吸毒',
  '贩毒',
  '冰毒',
  '大麻',
  '恐怖',
  '爆炸',
  '枪支',
  '法轮功',
  '邪教',
  'fuck',
  'shit',
  'sb',
  'shabi',
  'sabi',
  'nmsl',
]

const META_ALLOWLIST = new Set(['敏感', '敏感词', '敏感内容', '违规词', '违规内容'])

function success(data) {
  return { ok: true, data }
}

function fail(message, code) {
  return {
    ok: false,
    error: {
      message,
      code: code || 'BAD_REQUEST',
    },
  }
}

function normalize(text) {
  return String(text || '').trim()
}

function collapseNoise(text) {
  return normalize(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function pickProvider() {
  if (!process.env.HUNYUAN_API_KEY) return null
  return {
    apiKey: process.env.HUNYUAN_API_KEY,
    baseURL: process.env.HUNYUAN_BASE_URL || 'https://api.hunyuan.cloud.tencent.com/v1',
    model: process.env.HUNYUAN_MODEL || 'hunyuan-2.0-instruct-20251111',
  }
}

function requestJson(url, payload, headers) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const body = JSON.stringify(payload)
    const request = https.request(
      {
        method: 'POST',
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        headers: Object.assign(
          {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          headers || {}
        ),
      },
      (response) => {
        let raw = ''
        response.on('data', (chunk) => {
          raw += chunk
        })
        response.on('end', () => {
          try {
            resolve(JSON.parse(raw))
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    request.on('error', reject)
    request.write(body)
    request.end()
  })
}

function parseDecision(content) {
  const raw = normalize(content)
  if (!raw) return false
  const upper = raw.toUpperCase()
  if (upper.includes('BLOCK')) return true
  if (upper.includes('ALLOW')) return false
  if (raw.includes('不违规') || raw.includes('未违规') || raw.includes('合规') || raw.includes('安全')) return false
  if (raw.includes('违规') || raw.includes('不通过') || raw.includes('禁止')) return true
  if (raw.includes('边缘') || raw.includes('低俗') || raw.includes('色情') || raw.includes('赌博')) return true
  if (raw.includes('毒品') || raw.includes('暴力') || raw.includes('恐怖') || raw.includes('政治')) return true
  return false
}

function localModerate(text) {
  const input = normalize(text)
  if (!input) {
    return {
      blocked: false,
      strategy: 'local',
      reason: '',
    }
  }
  const collapsed = collapseNoise(input)
  const hit = LOCAL_BLOCKLIST.find((word) => input.includes(word) || collapsed.includes(word.toLowerCase()))
  return {
    blocked: Boolean(hit),
    strategy: 'local',
    reason: hit || '',
  }
}

function buildMessages(text) {
  return [
    {
      role: 'system',
      content:
        '你是内容安全审核，只对黄赌毒、涉政、暴力恐怖、辱骂人身攻击判定为 BLOCK，其他一律 ALLOW。' +
        '遇到“敏感/敏感词/敏感内容/违规词”等自指词不要判定 BLOCK。只能输出 ALLOW 或 BLOCK。',
    },
    {
      role: 'user',
      content: `文本: ${text}`,
    },
  ]
}

async function aiModerate(text) {
  const provider = pickProvider()
  if (!provider) return null
  const input = normalize(text)
  if (!input || META_ALLOWLIST.has(input)) return null

  const response = await requestJson(
    `${provider.baseURL.replace(/\/$/, '')}/chat/completions`,
    {
      model: provider.model,
      messages: buildMessages(input),
      temperature: 0,
      max_tokens: 2,
      top_p: 1,
    },
    {
      Authorization: `Bearer ${provider.apiKey}`,
    }
  )

  const content =
    response && response.choices && response.choices[0] && response.choices[0].message
      ? response.choices[0].message.content
      : ''

  return {
    blocked: parseDecision(content),
    strategy: 'ai:hunyuan',
    reason: normalize(content),
  }
}

exports.main = async (event) => {
  const text = normalize(event && event.text ? event.text : '')
  if (!text) return fail('text is required', 'INVALID_TEXT')

  const localResult = localModerate(text)
  if (localResult.blocked) {
    return success(localResult)
  }

  try {
    const aiResult = await aiModerate(text)
    if (aiResult) return success(aiResult)
    return success(localResult)
  } catch (error) {
    return success({
      blocked: false,
      strategy: 'fallback',
      reason: error && error.message ? error.message : '',
    })
  }
}
