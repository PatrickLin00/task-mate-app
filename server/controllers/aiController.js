const OpenAI = require('openai')

const HUNYUAN_API_KEY = process.env.HUNYUAN_API_KEY
const HUNYUAN_BASE_URL = process.env.HUNYUAN_BASE_URL
const HUNYUAN_MODEL = process.env.HUNYUAN_MODEL
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL
const OPENAI_MODEL = process.env.OPENAI_MODEL

const getClientConfig = () => {
  if (HUNYUAN_API_KEY) {
    return {
      apiKey: HUNYUAN_API_KEY,
      baseURL: HUNYUAN_BASE_URL || undefined,
      model: HUNYUAN_MODEL || 'hunyuan-2.0-instruct-20251111',
    }
  }
  if (OPENAI_API_KEY) {
    return {
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL || undefined,
      model: OPENAI_MODEL || 'gpt-4o-mini',
    }
  }
  return null
}

const clientConfig = getClientConfig()
const client = clientConfig
  ? new OpenAI({ apiKey: clientConfig.apiKey, baseURL: clientConfig.baseURL })
  : null

const parseJsonSafe = (text) => {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (err) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1)
      return JSON.parse(slice)
    }
    return null
  }
}

const buildSystemPrompt = (nowText) => {
  return [
    '你是一个轻松游戏风格的任务生成器.',
    '根据用户的一句话,生成清晰易懂的任务方案.',
    `当前时间(Asia/Shanghai): ${nowText}`,
    '只返回JSON对象,不要额外文字.结构:',
    '{',
    '  "title": "...",',
    '  "description": "...",',
    '  "subtasks": [{"title": "...", "total": 1}],',
    '  "attributeReward": {"type": "wisdom" | "strength" | "agility", "value": number}',
    '  "dueAt": "ISO-8601 datetime string (optional)"',
    '}',
    '要求:',
    '- 标题和描述用口语化,轻松语气,不要文言文或生僻词.',
    '- 游戏化氛围适度,表达直白易懂.',
    '- 描述不绕口,尽量一到两句话,点明做什么与目标.',
    '- subtasks 只给关键目标,不要拆得太细.',
    '- 若用户明确列出多个关键事项(如“买A和B和C”“先...再...然后...”),可对应增加.',
    '- 若用户在说购物/食材清单,subtasks 直接列出物品,用“购买X”形式,不要写处理或分类.',
    '- 每条步骤以动词开头,尽量在12字以内.',
    '- total 为正整数,默认 1.',
    '- attributeReward.type 根据语义选择: 学习思考类=wisdom, 运动力量类=strength, 执行效率或灵活类=agility.',
    '- attributeReward.value 在 5 到 20 之间.',
    '- 如果用户输入包含日期或时间,请输出 dueAt,使用 ISO 8601 (例如 2025-12-28T18:00:00+08:00).',
    '- “今天/明天/后天”要按当前时间生成,不要写成过去日期.',
    '- 如果没有明确时间,不要输出 dueAt.',
    '- 标题与描述不要出现“今天/明天/后天/昨晚”等相对时间词,用更通用的表达.',
  ].join('\n')
}

const stripRelativeTime = (text) => {
  if (!text) return text
  const terms = [
    '今天',
    '明天',
    '后天',
    '今晚',
    '今早',
    '今晨',
    '明早',
    '明晨',
    '明晚',
    '后晚',
    '昨天',
    '昨晚',
    '昨日',
    '次日',
    '翌日',
  ]
  let result = String(text)
  terms.forEach((term) => {
    result = result.replace(new RegExp(term, 'g'), '')
  })
  result = result.replace(/\s{2,}/g, ' ').trim()
  result = result.replace(/([，,。！!？?；;])\s*([，,。！!？?；;]+)/g, '$1')
  return result
}

const extractShoppingItems = (text) => {
  if (!text) return []
  const markers = ['食材', '材料', '清单', '购物', '要买', '购买', '备齐']
  let tail = ''
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i]
    const idx = text.indexOf(marker)
    if (idx >= 0) {
      tail = text.slice(idx + marker.length)
      break
    }
  }
  if (!tail) return []
  tail = tail.replace(new RegExp('^[\\s,，、:：]+'), '')
  if (!tail) return []
  const parts = tail.split(new RegExp('[,，、\\s]+'))
  const cleaned = parts
    .map((item) => item.replace(new RegExp('[。！？.!?]+$'), '').trim())
    .filter((item) => item.length > 0)
  const unique = []
  const seen = new Set()
  cleaned.forEach((item) => {
    if (seen.has(item)) return
    seen.add(item)
    unique.push(item)
  })
  return unique
}

exports.generateTask = async (req, res) => {
  try {
    if (!client || !clientConfig) {
      return res
        .status(500)
        .json({ error: 'AI功能未配置,请设置HUNYUAN_API_KEY或OPENAI_API_KEY' })
    }

    const { prompt } = req.body || {}
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt不能为空' })
    }

    const clientNow = Number(req.body?.clientNow)
    const clientTzOffset = Number(req.body?.clientTzOffset)
    let nowText = new Date().toLocaleString('sv-SE', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
    })
    if (!Number.isNaN(clientNow) && !Number.isNaN(clientTzOffset)) {
      const localMs = clientNow - clientTzOffset * 60 * 1000
      nowText = new Date(localMs).toISOString().replace('T', ' ').slice(0, 19)
    }
    const completion = await client.chat.completions.create({
      model: clientConfig.model,
      messages: [
        { role: 'system', content: buildSystemPrompt(nowText) },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const content = completion.choices?.[0]?.message?.content
    if (!content) throw new Error('AI返回为空')

    const data = parseJsonSafe(content)
    if (!data || !data.title || !Array.isArray(data.subtasks) || data.subtasks.length === 0) {
      throw new Error('AI返回不完整')
    }

    const items = extractShoppingItems(prompt)
    if (items.length >= 2) {
      data.subtasks = items.map((item) => ({ title: `购买${item}`, total: 1 }))
      const listText = items.join('、')
      const descBase = data.description ? String(data.description) : ''
      const listLine = `购买清单：${listText}`
      if (!descBase.includes(listText)) {
        data.description = descBase ? `${descBase} ${listLine}` : listLine
      }
    }

    data.title = stripRelativeTime(data.title)
    data.description = stripRelativeTime(data.description)

    res.json(data)
  } catch (error) {
    console.error('generateTask error:', error)
    res.status(500).json({ error: error.message || '生成失败' })
  }
}
