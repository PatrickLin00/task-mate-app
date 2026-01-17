const abiaoFilter = require('abiao_filter');

const SENSITIVE_HINT =
  '\u5185\u5bb9\u542b\u6709\u654f\u611f\u8bcd\uff0c\u5efa\u8bae\u4f7f\u7528\u661f\u65c5\u751f\u6210\u907f\u514d\u654f\u611f\u8bcd\u95ee\u9898';

const customWords = [
  '\u9ec4\u8d4c\u6bd2',
  '\u535a\u5f69',
  '\u8d4c\u535a',
  '\u8d4c\u94b1',
  '\u8d4c\u7403',
  '\u79c1\u5f69',
  '\u62db\u5ad6',
  '\u5ad6\u5a3c',
  '\u5356\u6deb',
  '\u63f4\u4ea4',
  '\u7ea6\u70ae',
  '\u60c5\u8272',
  '\u8272\u60c5',
  '\u9ec4\u7247',
  '\u88f8\u804a',
  '\u88f8\u7167',
  '\u6bd2\u54c1',
  '\u5438\u6bd2',
  '\u8d29\u6bd2',
  '\u51b0\u6bd2',
  '\u6d77\u6d1b\u56e0',
  '\u5927\u9ebb',
  '\u9ebb\u53e4',
  '\u6447\u5934\u4e38',
  '\u6050\u6016',
  '\u6050\u88ad',
  '\u7206\u70b8',
  '\u67aa\u652f',
  '\u653f\u6cbb',
  '\u53cd\u653f\u5e9c',
  '\u53cd\u515a',
  '\u653f\u53d8',
  '\u98a0\u8986',
  '\u5206\u88c2',
  '\u53f0\u72ec',
  '\u6e2f\u72ec',
  '\u7586\u72ec',
  '\u6cd5\u8f6e\u529f',
  '\u90aa\u6559',
];

const filter = abiaoFilter && abiaoFilter.default ? abiaoFilter.default : abiaoFilter;
const mint = filter ? filter.mint : null;

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
  const input = normalize(text);
  if (!input) {
    return false;
  }
  if (mint && typeof mint.verify === 'function') {
    if (!mint.verify(input)) return true;
    const collapsed = collapseNoise(input);
    if (collapsed !== input && !mint.verify(collapsed)) return true;
  }
  const collapsed = collapseNoise(input);
  return customWords.some((word) => input.includes(word) || collapsed.includes(word));
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
