const OpenAI = require('openai');

const HUNYUAN_API_KEY = process.env.HUNYUAN_API_KEY;
const HUNYUAN_BASE_URL = process.env.HUNYUAN_BASE_URL;
const HUNYUAN_MODEL = process.env.HUNYUAN_MODEL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL;

const AI_MODERATION_ENABLED = String(process.env.AI_MODERATION_ENABLED || '').toLowerCase() === 'true';
const AI_MODERATION_MODEL = process.env.AI_MODERATION_MODEL;

const getClientConfig = () => {
  if (HUNYUAN_API_KEY) {
    return {
      apiKey: HUNYUAN_API_KEY,
      baseURL: HUNYUAN_BASE_URL || undefined,
      model: HUNYUAN_MODEL || 'hunyuan-2.0-instruct-20251111',
    };
  }
  if (OPENAI_API_KEY) {
    return {
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL || undefined,
      model: OPENAI_MODEL || 'gpt-4o-mini',
    };
  }
  return null;
};

const clientConfig = getClientConfig();
const client = clientConfig ? new OpenAI({ apiKey: clientConfig.apiKey, baseURL: clientConfig.baseURL }) : null;
const moderationModel = AI_MODERATION_MODEL || clientConfig?.model;

const normalize = (text) => String(text || '').trim();
const clipText = (text, limit = 120) => {
  const input = normalize(text);
  if (!input) return '';
  return input.length > limit ? input.slice(0, limit) : input;
};

const parseDecision = (content) => {
  const value = String(content || '').trim().toUpperCase();
  if (value.includes('BLOCK')) return true;
  if (value.includes('ALLOW')) return false;
  return false;
};

const buildMessages = (text) => [
  {
    role: 'system',
    content: 'You are a safety classifier. Reply only with ALLOW or BLOCK.',
  },
  {
    role: 'user',
    content: `Text: ${text}`,
  },
];

const moderateText = async (text) => {
  if (!AI_MODERATION_ENABLED || !client || !moderationModel) return false;
  const input = clipText(text);
  if (!input) return false;
  try {
    const completion = await client.chat.completions.create({
      model: moderationModel,
      messages: buildMessages(input),
      temperature: 0,
      max_tokens: 1,
      top_p: 1,
    });
    const content = completion.choices?.[0]?.message?.content;
    return parseDecision(content);
  } catch (error) {
    console.error('moderateText error:', error?.message || error);
    return false;
  }
};

module.exports = {
  moderateText,
};
