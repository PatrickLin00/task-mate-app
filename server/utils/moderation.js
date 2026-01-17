const OpenAI = require('openai');

const HUNYUAN_API_KEY = process.env.HUNYUAN_API_KEY;
const HUNYUAN_BASE_URL = process.env.HUNYUAN_BASE_URL;
const HUNYUAN_MODEL = process.env.HUNYUAN_MODEL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL;

const AI_MODERATION_ENABLED = String(process.env.AI_MODERATION_ENABLED || '').toLowerCase() === 'true';
const AI_MODERATION_MODEL = process.env.AI_MODERATION_MODEL;
const AI_MODERATION_DEBUG = String(process.env.AI_MODERATION_DEBUG || '').toLowerCase() === 'true';

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

const metaAllowlist = new Set(['敏感', '敏感词', '敏感内容', '违规词', '违规内容']);

const parseDecision = (content) => {
  const raw = String(content || '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  if (upper.includes('BLOCK')) return true;
  if (upper.includes('ALLOW')) return false;

  if (raw.includes('不违规') || raw.includes('未违规') || raw.includes('合规') || raw.includes('安全')) {
    return false;
  }
  if (raw.includes('违规') || raw.includes('不通过') || raw.includes('禁止')) {
    return true;
  }
  if (raw.includes('辱骂') || raw.includes('侮辱') || raw.includes('色情') || raw.includes('赌博')) {
    return true;
  }
  if (raw.includes('毒品') || raw.includes('暴力') || raw.includes('恐怖') || raw.includes('政治')) {
    return true;
  }
  return false;
};

const buildMessages = (text) => [
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
];

const moderateText = async (text) => {
  if (!AI_MODERATION_ENABLED || !client || !moderationModel) {
    if (AI_MODERATION_DEBUG) {
      console.log('[moderation] skipped', {
        enabled: AI_MODERATION_ENABLED,
        hasClient: Boolean(client),
        model: moderationModel,
      });
    }
    return false;
  }
  const input = clipText(text);
  if (metaAllowlist.has(input)) return false;
  if (!input) return false;
  try {
    const completion = await client.chat.completions.create({
      model: moderationModel,
      messages: buildMessages(input),
      temperature: 0,
      max_tokens: 2,
      top_p: 1,
    });
    const content = completion.choices?.[0]?.message?.content;
    const blocked = parseDecision(content);
    if (AI_MODERATION_DEBUG) {
      console.log('[moderation] decision', { input, content, blocked });
    }
    return blocked;
  } catch (error) {
    console.error('moderateText error:', error?.message || error);
    return false;
  }
};

module.exports = {
  moderateText,
};
