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
    '你是任务整理助手，根据用户一句话生成任务草案。',
    `当前时间(Asia/Shanghai): ${nowText}`,
    '只返回 JSON，不要额外文字。结构如下：',
    '{',
    '  "title": "...",',
    '  "description": "...",',
    '  "subtasks": [{"title": "...", "total": 1}],',
    '  "attributeReward": {"type": "wisdom" | "strength" | "agility", "value": 1},',
    '  "dueAt": "ISO-8601 datetime string (optional)",',
    '  "offlineRewardPromise": "optional"',
    '}',
    '要求：',
    '- title 简短清楚，像任务名。',
    '- description 自然直白，说明做什么和目标。',
    '- subtasks 只保留关键步骤。',
    '- 购物或清单场景，subtasks 直接写物品项。',
    '- 有明确日期时间才输出 dueAt；title 和 description 不要保留今天、明天、后天、昨晚这类相对时间词。',
    '- 如果用户表达了会给对方线下奖励、请客、请喝、请吃、红包、礼物、交换条件、完成后给好处等承诺，请把承诺内容提炼到 offlineRewardPromise。',
    '- 如果没有这类承诺，offlineRewardPromise 返回空字符串。',
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

function extractOfflineRewardPromise(text) {
  const source = String(text || '').trim()
  if (!source) return ''

  const patterns = [
    /(?:线下奖励|额外奖励|奖励|奖品|报酬|酬劳)[：:是为给\s]*([^，。；;\n]{2,32})/,
    /(?:换取|兑换|换成)[^\S\r\n]*([^，。；;\n]{2,24})/,
    /((?:请|送|给)[^，。；;\n]{0,8}(?:喝|吃|拿|送)[^，。；;\n]{1,24})/,
    /((?:请|带|陪)(?:你|你们|对方|Ta|ta)?去[^，。；;\n]{1,24})/,
    /((?:一起去|去)[^，。；;\n]{2,18})/,
    /((?:奶茶|咖啡|红包|请客|饮料|零食|甜品|吃饭)[^，。；;\n]{0,18})/,
  ]

  for (let index = 0; index < patterns.length; index += 1) {
    const matched = source.match(patterns[index])
    if (!matched) continue
    const value = String(matched[1] || '')
      .replace(/^(作为)?(?:线下奖励|额外奖励|奖励|奖品|报酬|酬劳|换取|兑换|换成)[：:\s]*/u, '')
      .replace(/[,.，。；;!！?？]+$/u, '')
      .trim()
    if (value.length >= 2) return value
  }

  return ''
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
    offlineRewardPromise: extractOfflineRewardPromise(prompt),
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
  normalized.offlineRewardPromise = String(normalized.offlineRewardPromise || '').trim() || extractOfflineRewardPromise(prompt)
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
