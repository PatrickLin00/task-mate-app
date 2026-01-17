const abiaoFilter = require('abiao_filter');
const ProfanityFilter = require('bad-words-chinese');

const SENSITIVE_HINT = '内容含有敏感词，建议使用星旅生成避免敏感词问题';
const CONTENT_FILTER_ENABLED =
  String(process.env.CONTENT_FILTER_ENABLED || '').toLowerCase() !== 'false';

const customWords = [
  '黄赌毒',
  '博彩',
  '赌博',
  '赌钱',
  '赌球',
  '私彩',
  '你妈死了',
  '你妈',
  '傻逼',
  '傻b',
  '草泥马',
  '操你妈',
  '他妈的',
  '招嫖',
  '嫖娼',
  '卖淫',
  '援交',
  '约炮',
  '情色',
  '色情',
  '黄片',
  '裸聊',
  '裸照',
  '毒品',
  '吸毒',
  '贩毒',
  '冰毒',
  '海洛因',
  '大麻',
  '麻古',
  '摇头丸',
  '恐怖',
  '恐袭',
  '爆炸',
  '枪支',
  '政治',
  '反政府',
  '反党',
  '政变',
  '颠覆',
  '分裂',
  '台独',
  '港独',
  '疆独',
  '法轮功',
  '邪教',
];

const romanWords = [
  'yuepao',
  'nmsl',
  'caonima',
  'cao',
  'cnm',
  'tmd',
  'sb',
  'sbn',
  'sabi',
  'shabi',
  'fxxk',
  'fuck',
  'bitch',
  'shit',
];

const filter = abiaoFilter && abiaoFilter.default ? abiaoFilter.default : abiaoFilter;
const mint = filter ? filter.mint : null;
const profanity = new ProfanityFilter({
  chineseList: customWords,
  englishList: romanWords,
});

const normalize = (text) => String(text || '').trim();
const collapseNoise = (text) =>
  normalize(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

const ensureCustomWords = () => {
  if (!mint || typeof mint.add !== 'function') return;
  customWords.forEach((word) => {
    if (word) mint.add(word, false);
  });
  if (typeof mint.build === 'function') {
    mint.build();
  }
};

ensureCustomWords();

const containsSensitive = (text) => {
  if (!CONTENT_FILTER_ENABLED) return false;
  const input = normalize(text);
  if (!input) {
    return false;
  }
  if (profanity.isProfane(input)) return true;
  if (mint && typeof mint.verify === 'function') {
    if (!mint.verify(input)) return true;
    const collapsed = collapseNoise(input);
    if (profanity.isProfane(collapsed)) return true;
    if (collapsed !== input && !mint.verify(collapsed)) return true;
  }
  const collapsed = collapseNoise(input);
  if (romanWords.some((word) => collapsed.includes(word))) return true;
  return customWords.some((word) => input.includes(word) || collapsed.includes(word));
};

const containsSensitiveTask = (task) => {
  if (!CONTENT_FILTER_ENABLED) return false;
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
