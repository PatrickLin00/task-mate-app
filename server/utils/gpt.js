// OpenAI SDK v6 写法
// TODO: 若不需要此功能，可移除此文件与 openai 依赖；若需要，请完善 prompt/安全策略/配额限制
const OpenAI = require('openai')

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

exports.generateTaskTemplate = async (prompt) => {
  const res = await client.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
  })
  return res.choices?.[0]?.message?.content || ''
}
