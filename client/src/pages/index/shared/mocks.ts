export type Attr = '智慧' | '力量' | '敏捷'

export type Difficulty = '简单' | '中等' | '困难'

export type RoadTask = {
  id: string
  title: string
  detail: string
  due: string
  type: Attr
  icon: string
  points: number
  difficulty?: Difficulty
}

export const role = { name: '我的小猫', stars: 5, 智慧: 75, 力量: 60, 敏捷: 85 }
export const catIdleFrames = [
  '/assets/avatars/cat_idle_01.png',
  '/assets/avatars/cat_idle_02.png',
  '/assets/avatars/cat_idle_03.png',
  '/assets/avatars/cat_idle_04.png',
  '/assets/avatars/cat_idle_05.png',
  '/assets/avatars/cat_idle_06.png',
  '/assets/avatars/cat_idle_07.png',
  '/assets/avatars/cat_idle_08.png',
  '/assets/avatars/cat_idle_09.png',
] as const

export const todayTasks: RoadTask[] = [
  { id: 't1', title: '纯真之心阅读', detail: '踏上《小王子》的魔法旅程！第三章等你来探索！加强意志力！扩展技能树！释放自我！成就明天！让生活更有趣！让身体更健康！让心灵更自由！让世界更美好！', due: '今天', type: '智慧', icon: '📚', points: 10 },
  { id: 't2', title: '活力觉醒仪式', detail: '15 分钟瑜伽修炼，唤醒身体的无限能量', due: '今天', type: '敏捷', icon: '🏃', points: 15 },
  { id: 't3', title: '技能树升级', detail: '解锁新的编程技能！今日课程开启你的进阶之路', due: '今天', type: '智慧', icon: '💻', points: 20 },
  { id: 't4', title: '拳法精进', detail: '练习拳法，提高拳法技能，行走江湖，行侠仗义', due: '今天', type: '力量', icon: '👊', points: 10 },
]

export const feedTasks: RoadTask[] = [
  { id: 'r1', title: '速度狂奔挑战', detail: '释放你的野性！30 分钟极速奔跑，让心跳与激情共振！释放自我！成就明天！让生活更有趣！让身体更健康！让心灵更自由！让世界更美好！', due: '今天', type: '力量', icon: '🏃', points: 20, difficulty: '中等' },
  { id: 'r2', title: '万步征途', detail: '每一步都是胜利的足迹！今日目标：征服 10000 步', due: '今天', type: '敏捷', icon: '👟', points: 15, difficulty: '简单' },
  { id: 'r3', title: '心灵静修之旅', detail: '进入禅定！15 分钟冥想修炼，恢复精神能量', due: '今天', type: '智慧', icon: '🧘', points: 12, difficulty: '简单' },
  { id: 'r4', title: '钢铁战士修炼', detail: '突破极限！20 分钟力量训练，铸就无敌肌肉', due: '今天', type: '力量', icon: '💪', points: 25, difficulty: '困难' },
  { id: 'r5', title: '疾风骑行传说', detail: '骑行 40 分钟，感受速度与自由的完美融合', due: '今天', type: '敏捷', icon: '🚴', points: 18, difficulty: '中等' },
  { id: 'r6', title: '智慧之光探索', detail: '深度阅读 45 分钟，点亮你的技能树', due: '今天', type: '智慧', icon: '📖', points: 16, difficulty: '简单' },
  { id: 'r7', title: '晨曦勇士勋章', detail: '与太阳赛跑！7 点前起床赢得先机', due: '今天', type: '敏捷', icon: '☀️', points: 10, difficulty: '简单' },
]

export function chipText(t: RoadTask) {
  return `${t.type}+${t.points}`
}

export const quietLines = [
  '命星不语，天命待启。万象归静，是为渡世之憩。',
  '星河止步，道息灵眠。静候天命转轮，再启新章。',
  '气脉调息，星图未展。是夜无梦，正好养神。',
  '天道藏锋，诸事归元。此刻无声，是为修真静候。',
  '星轨沉寂，道心自明。静中养力，动则惊天。',
  '闲云孤鹤，清风拂面。闲来无事，不如种花听雨，待奇遇自来。',
  '山水无言，蝉声轻响。世事清简，光阴也柔软。',
  '花落篱前，茶煮初沸。星徒暂歇，正是安然时节。',
  '庭前落叶静，檐下风铃轻。人间有闲日，最宜与光同眠。',
  '岁月不催，草木知时。无事即安，小憩亦是好缘。',
]

export const challengeQuietLines = [
  '星轨尚未引动，宿命仍在沉睡。旅者请静候命星指引。',
  '此刻风息星止，未有挑战降临。命运的鼓声，终将响起。',
  '星光遥遥，征途未开。前路未知，万象待启。',
  '命盘安静如水，挑战潜于深渊。静养片刻，以候惊澜。',
  '尘未起，剑尚鞘。修者勿躁，天地尚藏一场奇遇。',
  '风未动，云未起。山野沉静，星旅将至未至。',
  '今日无事入星图，闲看风花雪月，待使命之铃响。',
  '旅人歇息于林间，星路自会在恰好的时刻显现。',
  '挑战之门尚未开启，静待那束光划破天际。',
  '溪水潺潺，野鹤空鸣。行者暂憩于道旁，前路仍长。',
]
