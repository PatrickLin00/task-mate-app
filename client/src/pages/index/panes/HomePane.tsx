import { View, Text, ScrollView, Button } from "@tarojs/components"
import Taro, { useLoad } from "@tarojs/taro"
import { useEffect, useMemo, useState } from "react"
import { type Attr, role, todayTasks, feedTasks, chipText } from "../shared/mocks"

export default function HomePane() {
  const [availHeight, setAvailHeight] = useState(180)
  const visibleTasks = useMemo(() => feedTasks, [])

  useLoad(() => {})

  useEffect(() => {
    Taro.nextTick(() => {
      const q = Taro.createSelectorQuery()
      q.select('#hero').boundingClientRect()
      q.select('#today').boundingClientRect()
      q.select('#feed-head').boundingClientRect()
      q.select('.feed-card').boundingClientRect()
      q.exec((res) => {
        const [hero, today, head] = res as any[]
        const winH = Taro.getSystemInfoSync().windowHeight
        const used = (hero?.height || 0) + (today?.height || 0) + (head?.height || 0) + 56
        const available = Math.max(260, winH - used - 12)
        setAvailHeight(available)
      })
    })
  }, [])

  return (
    <>
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
          {(['智慧', '力量', '敏捷'] as Attr[]).map((k) => (
            <View key={k} className='stat'>
              <Text className='label'>{k}</Text>
              <View className='track'>
                <View
                  className={`fill ${k === '智慧' ? 'blue' : k === '力量' ? 'red' : 'yellow'}`}
                  style={{ width: `${(role as any)[k]}%` }}
                />
              </View>
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
          {todayTasks.map((t) => (
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
          <Text className='count'>{feedTasks.length} 个任务</Text>
        </View>
        <ScrollView scrollY scrollWithAnimation style={{ height: `${availHeight}px` }} className='feed-scroll'>
          <View className='feed-list'>
            {visibleTasks.map((t) => (
              <View className='feed-card' key={t.id}>
                <View className='feed-left'>
                  <Text className='emoji'>{t.icon}</Text>
                </View>
                <View className='feed-body'>
                  <Text className='feed-title'>{t.title}</Text>
                  <Text className='feed-desc'>{t.detail}</Text>
              <View className='feed-bottom'>
                <Text className='feed-meta'>难度：{t.type === '力量' ? '中等' : t.type === '敏捷' ? '简单' : '简单'}</Text>
              </View>
              </View>
                <Text className='chip attr'>{chipText(t)}</Text>
                <Button className='cta top-right'>接取任务</Button>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </>
  )
}
