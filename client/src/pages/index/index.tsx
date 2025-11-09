import { View, Text, ScrollView, Button, Swiper, SwiperItem } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import './index.scss'

type Attr = '智慧' | '力量' | '敏捷'
type RoadTask = { id: string; title: string; detail: string; due: string; type: Attr; icon: string; points: number }

const role = { name: '我的小猫', stars: 5, 智慧: 75, 力量: 60, 敏捷: 85 }

const todayTasks: RoadTask[] = [
  { id: 't1', title: '纯真之心阅读', detail: '踏上《小王子》的魔法旅程！第三章等你来探索', due: '今天', type: '智慧', icon: '📚', points: 10 },
  { id: 't2', title: '活力觉醒仪式', detail: '15分钟瑜伽修炼，唤醒身体的无限能量', due: '今天', type: '敏捷', icon: '🏃', points: 15 },
  { id: 't3', title: '技能树升级', detail: '解锁新的编程技能！今日课程开启你的进阶之路', due: '今天', type: '智慧', icon: '💻', points: 20 },
]

const feedTasks: RoadTask[] = [
  { id: 'r1', title: '速度狂奔挑战', detail: '释放你的野性！30分钟极速奔跑，让心跳与激情共振', due: '今天', type: '力量', icon: '🏃', points: 20 },
  { id: 'r2', title: '万步征途', detail: '每一步都是胜利的足迹！今日目标：征服10000步', due: '今天', type: '敏捷', icon: '👟', points: 15 },
  { id: 'r3', title: '心灵静修之旅', detail: '进入禅定！15分钟冥想修炼，恢复精神能量', due: '今天', type: '智慧', icon: '🧘', points: 12 },
  { id: 'r4', title: '钢铁战士修炼', detail: '突破极限！20分钟力量训练，铸就无敌肌肉', due: '今天', type: '力量', icon: '💪', points: 25 },
  { id: 'r5', title: '疾风骑行传说', detail: '骑行40分钟，感受速度与自由的完美融合', due: '今天', type: '敏捷', icon: '🚴', points: 18 },
  { id: 'r6', title: '智慧之光探索', detail: '深度阅读 45 分钟，点亮你的技能树', due: '今天', type: '智慧', icon: '📖', points: 16 },
  { id: 'r7', title: '晨曦勇士勋章', detail: '与太阳赛跑！7 点前起床赢得先机', due: '今天', type: '敏捷', icon: '☀️', points: 10 },
]

function chipText(t: RoadTask) { return `${t.type}+${t.points}` }

type Tab = 'home'|'tasks'|'achievements'|'profile'
const tabOrder: Tab[] = ['home','tasks','achievements','profile']

export default function Index () {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  // 展示全部任务，滚动查看；不再依赖“展开/收起”
  const [expanded, setExpanded] = useState(true)
  const [maxDisplay, setMaxDisplay] = useState(2)
  const [availHeight, setAvailHeight] = useState(180)

  useLoad(() => {})

  // 动态计算“星旅挑战”最多展示的任务数量
  useEffect(() => {
    Taro.nextTick(() => {
      const q = Taro.createSelectorQuery()
      q.select('#hero').boundingClientRect()
      q.select('#today').boundingClientRect()
      q.select('#feed-head').boundingClientRect()
      q.select('.feed-card').boundingClientRect()
      q.exec((res) => {
        const [hero, today, head, card] = res as any[]
        const winH = Taro.getSystemInfoSync().windowHeight
        const used = (hero?.height || 0) + (today?.height || 0) + (head?.height || 0) + 56 // paddings/间距
        const available = Math.max(260, winH - used - 12) // 至少更高一些，贴近屏幕下沿
        setAvailHeight(available)
        const cardH = ((card?.height || 96) + 10)
        const count = Math.max(1, Math.min(Math.floor((available + 6) / cardH), feedTasks.length))
        setMaxDisplay(count)
      })
    })
  }, [])

  const visibleTasks = useMemo(() => feedTasks, [])

  return (
    <View className='home'>
      <View className='bg' />

      {/* 顶部四个标签（静态样式） */}
      <View className='tabs'>
        <View className={`tab ${activeTab==='home'?'active':''}`} onClick={() => setActiveTab('home')}><Text>🏠 首页</Text></View>
        <View className={`tab ${activeTab==='tasks'?'active':''}`} onClick={() => setActiveTab('tasks')}><Text>📋 任务</Text></View>
        <View className={`tab ${activeTab==='achievements'?'active':''}`} onClick={() => setActiveTab('achievements')}><Text>🏆 成就</Text></View>
        <View className={`tab ${activeTab==='profile'?'active':''}`} onClick={() => setActiveTab('profile')}><Text>👤 我的</Text></View>
      </View>

      <Swiper
        className='panes'
        current={tabOrder.indexOf(activeTab)}
        onChange={(e) => setActiveTab(tabOrder[e.detail.current])}
        circular={false}
        duration={220}
      >
        <SwiperItem>
        {/* 角色信息卡片 */}
        <View id='hero' className='hero'>
        <View className='avatar-wrap'>
          <View className='avatar'>🐱</View>
          <View className='badge'>⭐</View>
        </View>
        <View className='hero-main'>
          <View className='hero-head'>
            <Text className='hero-name'>{role.name}</Text>
            <Text className='hero-stars'>{'★★★★★'.slice(0, role.stars)}</Text>
          </View>
          {(['智慧','力量','敏捷'] as Attr[]).map((k) => (
            <View key={k} className='stat'>
              <Text className='label'>{k}</Text>
              <View className='track'><View className={`fill ${k==='智慧'?'blue':k==='力量'?'red':'yellow'}`} style={{ width: `${(role as any)[k]}%` }} /></View>
              <Text className='val'>{(role as any)[k]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 星程简录 */}
      <View id='today' className='section'>
        <View className='section-bar'>
          <Text className='dot'>🎯</Text>
          <Text className='section-title'>星程简录</Text>
          <Text className='more'>⋯</Text>
        </View>
        <View className='tabs-strip'>
          <View className='seg active' />
          <View className='seg green' />
          <View className='seg teal' />
        </View>
        <ScrollView className='mini-cards' scrollX enableFlex>
          {todayTasks.map(t => (
            <View key={t.id} className='mini-card'>
              <View className='mini-body'>
                <View className='row'>
                  <Text className='emoji'>{t.icon}</Text>
                  <Text className='mini-title'>{t.title}</Text>
                  <Text className='chip'>{chipText(t)}</Text>
                </View>
                <Text className='mini-desc'>{t.detail}</Text>
                <View className='mini-foot'>
                  <Text className='due'>{t.due}</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* 星旅挑战 */}
      <View className='section'>
        <View id='feed-head' className='feed-head'>
          <Text className='spark'>✨</Text>
          <Text className='section-title'>星旅挑战</Text>
          <Text className='count'>{feedTasks.length}个任务</Text>
        </View>

        {/* 折叠与展开都提供纵向滚动容器，保证可拖动查看 */}
        <ScrollView scrollY scrollWithAnimation style={{ height: `${availHeight}px` }} className='feed-scroll'>
          <View className='feed-list'>
            {visibleTasks.map(t => (
              <View className='feed-card' key={t.id}>
                <View className='feed-left'><Text className='emoji'>{t.icon}</Text></View>
                <View className='feed-body'>
                  <Text className='feed-title'>{t.title}</Text>
                  <Text className='feed-desc'>{t.detail}</Text>
                  <View className='feed-bottom'>
                    <Text className='feed-meta'>难度：{t.type==='力量'?'中等':t.type==='敏捷'?'简单':'简单'}</Text>
                    <Button className='cta'>接取任务</Button>
                  </View>
                </View>
                <Text className='chip small'>{chipText(t)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* 已改为滚动显示全部任务，如需折叠再开启按钮 */}
      </View>
        </SwiperItem>

        <SwiperItem>
        <View className='section'>
          <Text className='section-title'>任务</Text>
          <View className='feed-list'>
            {feedTasks.map(t => (
              <View className='feed-card' key={t.id}>
                <View className='feed-left'><Text className='emoji'>{t.icon}</Text></View>
                <View className='feed-body'>
                  <Text className='feed-title'>{t.title}</Text>
                  <Text className='feed-desc'>{t.detail}</Text>
                  <View className='feed-bottom'>
                    <Text className='feed-meta'>奖励 {chipText(t)}</Text>
                    <Button className='cta'>接取任务</Button>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
        </SwiperItem>

        <SwiperItem>
        <View className='section'>
          <Text className='section-title'>成就</Text>
          <View className='feed-list'>
            {[{id:'a1',title:'晨曦勇士',desc:'连续7天早起打卡'},{id:'a2',title:'疾风行者',desc:'单日步数达 20,000'}].map(a => (
              <View className='feed-card' key={a.id}>
                <View className='feed-left'><Text className='emoji'>🏅</Text></View>
                <View className='feed-body'>
                  <Text className='feed-title'>{a.title}</Text>
                  <Text className='feed-desc'>{a.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        </SwiperItem>

        <SwiperItem>
        <View className='section'>
          <Text className='section-title'>我的</Text>
          <View className='hero'>
            <View className='avatar-wrap'><View className='avatar'>🐱</View></View>
            <View className='hero-main'>
              <View className='hero-head'><Text className='hero-name'>{role.name}</Text><Text className='hero-stars'>{'★★★★★'.slice(0, role.stars)}</Text></View>
              <Text className='feed-desc'>勇敢的探索者，继续你的星旅吧！</Text>
            </View>
          </View>
        </View>
        </SwiperItem>
      </Swiper>
    </View>
  )
}
