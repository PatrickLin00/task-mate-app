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
  if (process.env.HUNYUAN_API_KEY) {
    return {
      apiKey: process.env.HUNYUAN_API_KEY,
      baseURL: process.env.HUNYUAN_BASE_URL || 'https://api.hunyuan.cloud.tencent.com/v1',
      model: process.env.AI_MODERATION_MODEL || process.env.HUNYUAN_MODEL || 'hunyuan-lite',
      provider: 'hunyuan',
    }
  }
  return null
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
  const raw = normalize(content).toUpperCase()
  if (!raw) return false
  if (raw.includes('BLOCK')) return true
  if (raw.includes('ALLOW')) return false
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
      content: [
        'You are a safety moderation assistant for a productivity mini program.',
        'Only block clearly disallowed content such as pornography, prostitution, gambling, drugs, violent extremism, terrorism, or explicit hateful abuse.',
        'If the text is ordinary task management, harmless slang-free profile text, or neutral discussion, return ALLOW.',
        'Return exactly one token: ALLOW or BLOCK.',
      ].join(' '),
    },
    {
      role: 'user',
      content: text,
    },
  ]
}

async function aiModerate(text) {
  const provider = pickProvider()
  if (!provider || String(process.env.AI_MODERATION_ENABLED || '').toLowerCase() !== 'true') {
    return null
  }

  const response = await requestJson(
    `${provider.baseURL.replace(/\/$/, '')}/chat/completions`,
    {
      model: provider.model,
      messages: buildMessages(text),
      temperature: 0,
      max_tokens: 2,
    },
    {
      Authorization: `Bearer ${provider.apiKey}`,
    }
  )

  const content =
    response &&
    response.choices &&
    response.choices[0] &&
    response.choices[0].message &&
    response.choices[0].message.content
      ? response.choices[0].message.content
      : ''

  return {
    blocked: parseDecision(content),
    strategy: `ai:${provider.provider}`,
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
