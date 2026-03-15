const https = require('https')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

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

function parseJsonSafe(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    const start = String(text).indexOf('{')
    const end = String(text).lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(String(text).slice(start, end + 1))
    }
    return null
  }
}

function buildSystemPrompt(nowText) {
  return [
    '你是一个轻松游戏风格的任务生成器.',
    '根据用户的一句话,生成清晰易懂的任务方案.',
    `当前时间(Asia/Shanghai): ${nowText}`,
    '只返回JSON对象,不要额外文字.结构:',
    '{',
    '  "title": "...",',
    '  "description": "...",',
    '  "subtasks": [{"title": "...", "total": 1}],',
    '  "attributeReward": {"type": "wisdom" | "strength" | "agility", "value": number},',
    '  "dueAt": "ISO-8601 datetime string (optional)"',
    '}',
    '要求:',
    '- 标题和描述用口语化,轻松语气,不要文言文或生僻词.',
    '- 游戏化氛围适度,表达直白易懂.',
    '- 描述不绕口,尽量一到两句话,点明做什么与目标.',
    '- subtasks 只给关键目标,不要拆得太细.',
    '- 若用户明确列出多个关键事项(如“买A和B和C”“先...再...然后...” ),可对应增加.',
    '- 若用户在说购物/食材清单,subtasks 直接列出物品,用“购买X”形式,不要写处理或分类.',
    '- 每条步骤以动词开头,尽量在12字以内.',
    '- total 为正整数,默认 1.',
    '- attributeReward.type 根据语义选择: 学习思考类=wisdom, 运动力量类=strength, 执行效率或灵活类=agility.',
    '- attributeReward.value 固定为 1.',
    '- 如果用户输入包含日期或时间,请输出 dueAt,使用 ISO 8601 (例如 2025-12-28T18:00:00+08:00).',
    '- “今天/明天/后天”要按当前时间生成,不要写成过去日期.',
    '- 如果没有明确时间,不要输出 dueAt.',
    '- 标题与描述不要出现“今天/明天/后天/昨晚”等相对时间词,用更通用的表达.',
  ].join('\n')
}

function stripRelativeTime(text) {
  if (!text) return text
  const terms = ['今天', '明天', '后天', '今晚', '今早', '今晨', '明早', '明晨', '明晚', '后晚', '昨天', '昨晚', '昨日', '次日', '翌日']
  let result = String(text)
  terms.forEach((term) => {
    result = result.replace(new RegExp(term, 'g'), '')
  })
  result = result.replace(/\s{2,}/g, ' ').trim()
  result = result.replace(/([，,。！!？?；;])\s*([，,。！!？?；;]+)/g, '$1')
  return result
}

function extractShoppingItems(text) {
  if (!text) return []
  const markers = ['食材', '材料', '清单', '购物', '要买', '购买', '备齐']
  let tail = ''
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index]
    const position = text.indexOf(marker)
    if (position >= 0) {
      tail = text.slice(position + marker.length)
      break
    }
  }
  if (!tail) return []
  tail = tail.replace(/^[\s,，、:：]+/, '')
  if (!tail) return []
  const parts = tail.split(/[,，、\s]+/)
  const cleaned = parts
    .map((item) => item.replace(/[。！？.!?]+$/, '').trim())
    .filter(Boolean)
  const unique = []
  const seen = new Set()
  cleaned.forEach((item) => {
    if (seen.has(item)) return
    seen.add(item)
    unique.push(item)
  })
  return unique
}

function fallbackDraft(prompt) {
  return {
    title: '整理任务草案',
    description: `根据输入“${prompt}”生成的本地保底草案。`,
    subtasks: [
      { title: '明确目标', total: 1 },
      { title: '拆出关键步骤', total: 1 },
      { title: '安排执行时间', total: 1 },
    ],
    attributeReward: {
      type: 'wisdom',
      value: 1,
    },
  }
}

function normalizeDraft(data, prompt) {
  const normalized = Object.assign({}, data)
  const shoppingItems = extractShoppingItems(prompt)
  if (shoppingItems.length >= 2) {
    normalized.subtasks = shoppingItems.map((item) => ({ title: `购买${item}`, total: 1 }))
    const listText = shoppingItems.join('、')
    const descBase = normalized.description ? String(normalized.description) : ''
    const listLine = `购买清单：${listText}`
    if (!descBase.includes(listText)) {
      normalized.description = descBase ? `${descBase} ${listLine}` : listLine
    }
  }

  normalized.title = stripRelativeTime(normalized.title)
  normalized.description = stripRelativeTime(normalized.description)
  normalized.subtasks = Array.isArray(normalized.subtasks)
    ? normalized.subtasks
        .map((item) => ({
          title: String(item && item.title ? item.title : '').trim(),
          total: Math.max(1, Math.floor(Number(item && item.total ? item.total : 1))),
        }))
        .filter((item) => item.title)
    : []
  normalized.attributeReward = {
    type:
      normalized.attributeReward && ['wisdom', 'strength', 'agility'].includes(normalized.attributeReward.type)
        ? normalized.attributeReward.type
        : 'wisdom',
    value: 1,
  }
  return normalized
}

exports.main = async (event) => {
  const prompt = String(event && event.prompt ? event.prompt : '').trim()
  if (!prompt) return fail('prompt is required', 'INVALID_PROMPT')

  const provider = pickProvider()
  if (!provider) return success(fallbackDraft(prompt))

  try {
    const nowText = new Date().toLocaleString('sv-SE', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
    })

    const response = await requestJson(
      `${provider.baseURL.replace(/\/$/, '')}/chat/completions`,
      {
        model: provider.model,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(nowText),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      },
      {
        Authorization: `Bearer ${provider.apiKey}`,
      }
    )

    const content =
      response && response.choices && response.choices[0] && response.choices[0].message
        ? response.choices[0].message.content
        : ''

    const parsed = parseJsonSafe(content)
    if (!parsed || !parsed.title || !Array.isArray(parsed.subtasks) || !parsed.subtasks.length) {
      return success(fallbackDraft(prompt))
    }

    return success(normalizeDraft(parsed, prompt))
  } catch (error) {
    return success(fallbackDraft(prompt))
  }
}
