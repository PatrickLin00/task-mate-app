const abiaoFilter = require('abiao_filter');

const SENSITIVE_HINT = '内容含有敏感词，建议使用星旅生成避免敏感词问题';

const fallbackWords = [
  '博彩',
  '赌博',
  '色情',
  '涉黄',
  '毒品',
  '博彩',
  '政治',
  '恐怖',
];

const filter = abiaoFilter && abiaoFilter.default ? abiaoFilter.default : abiaoFilter;
const mint = filter ? filter.mint : null;

const normalize = (text) => String(text || '').trim();

const containsSensitive = (text) => {
  const input = normalize(text);
  if (!input) {
    return false;
  }
  if (mint && typeof mint.verify === 'function') {
    return !mint.verify(input);
  }
  return fallbackWords.some((word) => input.includes(word));
};

const containsSensitiveTask = (task) => {
  if (!task) {
    return false;
  }
  if (containsSensitive(task.title) || containsSensitive(task.details)) {
    return true;
  }
  if (Array.isArray(task.subtasks)) {
    return task.subtasks.some((subtask) => containsSensitive(subtask));
  }
  return false;
};

module.exports = {
  SENSITIVE_HINT,
  containsSensitive,
  containsSensitiveTask,
};
