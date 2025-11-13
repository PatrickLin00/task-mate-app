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

export const todayTasks: RoadTask[] = [
  { id: 't1', title: '纯真之心阅读', detail: '踏上《小王子》的魔法旅程！第三章等你来探索', due: '今天', type: '智慧', icon: '📚', points: 10 },
  { id: 't2', title: '活力觉醒仪式', detail: '15 分钟瑜伽修炼，唤醒身体的无限能量', due: '今天', type: '敏捷', icon: '🏃', points: 15 },
  { id: 't3', title: '技能树升级', detail: '解锁新的编程技能！今日课程开启你的进阶之路', due: '今天', type: '智慧', icon: '💻', points: 20 },
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
