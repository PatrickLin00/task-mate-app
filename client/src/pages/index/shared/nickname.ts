const leftParts = [
  '星河',
  '月光',
  '风铃',
  '暖阳',
  '薄荷',
  '云朵',
  '花火',
  '小鹿',
  '雨季',
  '晴天',
  '微风',
  '晨曦',
]

const rightParts = [
  '旅人',
  '行者',
  '小屋',
  '口袋',
  '心愿',
  '日记',
  '花园',
  '灯塔',
  '星愿',
  '轨迹',
  '清歌',
  '步调',
]

const roll = (list: string[]) => list[Math.floor(Math.random() * list.length)]

export const randomNickname = () => {
  for (let i = 0; i < 8; i += 1) {
    const left = roll(leftParts)
    const right = roll(rightParts)
    const name = Math.random() > 0.5 ? `${left}的${right}` : `${right}的${left}`
    if (name.length <= 6) return name
  }
  return '星旅的光'
}
