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
  if (process.env.HUNYUAN_API_KEY) {
    return {
      apiKey: process.env.HUNYUAN_API_KEY,
      baseURL: process.env.HUNYUAN_BASE_URL || 'https://api.hunyuan.cloud.tencent.com/v1',
      model: process.env.HUNYUAN_MODEL || 'hunyuan-lite',
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

function parseJsonSafe(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    const start = String(text || '').indexOf('{')
    const end = String(text || '').lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(String(text).slice(start, end + 1))
    }
    return null
  }
}

function buildPrompt(nowText) {
  return [
    'You generate playful but practical task plans.',
    'Return only a JSON object with keys:',
    'title, description, subtasks, attributeReward, dueAt(optional).',
    'subtasks must be an array of objects with title and total.',
    'attributeReward.type must be wisdom, strength, or agility.',
    'Current time in Asia/Shanghai:',
    nowText,
  ].join('\n')
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
      value: 10,
    },
  }
}

exports.main = async (event) => {
  const prompt = String(event && event.prompt ? event.prompt : '').trim()
  if (!prompt) return fail('prompt is required', 'INVALID_PROMPT')

  const provider = pickProvider()
  if (!provider) return success(fallbackDraft(prompt))

  try {
    const response = await requestJson(
      `${provider.baseURL.replace(/\/$/, '')}/chat/completions`,
      {
        model: provider.model,
        messages: [
          {
            role: 'system',
            content: buildPrompt(new Date().toISOString()),
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
      response &&
      response.choices &&
      response.choices[0] &&
      response.choices[0].message &&
      response.choices[0].message.content
        ? response.choices[0].message.content
        : ''
    const parsed = parseJsonSafe(content)
    if (!parsed || !parsed.title || !Array.isArray(parsed.subtasks) || !parsed.subtasks.length) {
      return success(fallbackDraft(prompt))
    }
    return success(parsed)
  } catch (error) {
    return success(fallbackDraft(prompt))
  }
}
