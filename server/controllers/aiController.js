const OpenAI = require('openai')

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

exports.generateTask = async (req, res) => {
  try {
    if (!client) {
      return res.status(500).json({ error: 'AI 功能未配置，请设置 OPENAI_API_KEY' })
    }
    const { prompt } = req.body || {}
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt 不能为空' })
    }

    const sys = `
你是一个轻量 RPG/仙侠风的任务生成器。根据用户给出的自然语言一句话，生成适合小游戏的任务方案。
返回 JSON，不要额外文字，结构为：
{
  "title": "...",
  "description": "...",
  "subtasks": [{"title": "...", "total": 1}],
  "attributeReward": {"type": "wisdom" | "strength" | "agility", "value": number}
}
要求：
- 标题与描述保留仙侠/修行/冒险风格但贴近日常生活。
- subtasks 2~5 条为宜，总是包含 title，total 为正整数。
- attributeReward.type 根据语义选择：学习/思考类=wisdom，运动/力量类=strength，执行/效率/灵活类=agility；value 给 5~30 的合理整数。
`

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const content = completion.choices?.[0]?.message?.content
    if (!content) throw new Error('AI 返回为空')

    const data = JSON.parse(content)
    // 轻量校验
    if (!data.title || !data.subtasks || !Array.isArray(data.subtasks) || data.subtasks.length === 0) {
      throw new Error('AI 返回不完整')
    }

    res.json(data)
  } catch (error) {
    console.error('generateTask error:', error)
    res.status(500).json({ error: error.message || '生成失败' })
  }
}
