import { View, Text, ScrollView, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { type Attr, role, todayTasks, feedTasks, chipText } from '../shared/mocks'

const attrList: Attr[] = ['\u667a\u6167', '\u529b\u91cf', '\u654f\u6377']
const attrTone: Record<Attr, 'blue' | 'red' | 'yellow'> = {
  '\u667a\u6167': 'blue',
  '\u529b\u91cf': 'red',
  '\u654f\u6377': 'yellow',
}
const attrMeta: Record<Attr, { icon: string }> = {
  '\u667a\u6167': { icon: '\ud83e\udde0' },
  '\u529b\u91cf': { icon: '\ud83d\udcaa' },
  '\u654f\u6377': { icon: '\ud83d\udc3a' },
}

const UI = {
  stars: '\u2605\u2605\u2605\u2605\u2605',
  avatar: '\ud83d\udc31',
  timelineIcon: '\ud83c\udfbf',
  challengeIcon: '\ud83e\udd10',
  calendarIcon: '\ud83d\udd70',
}

const STRINGS = {
  heroBadge: 'Lv.5',
  heroPill: '\u661f\u65c5\u8005',
  todayTitle: '\u661f\u7a0b\u7b80\u5f55',
  todayMeta: '\u4eca\u5929',
  todayUnit: '\u9879',
  viewDetail: '\u67e5\u770b\u8be6\u60c5',
  feedTitle: '\u661f\u65c5\u6311\u6218',
  difficultyLabel: '\u96be\u5ea6',
  feedUnit: '\u4e2a\u4efb\u52a1',
  typeLabel: '\u7c7b\u578b',
  button: '\u63a5\u53d6\u4efb\u52a1',
  showMore: '\u663e\u793a\u66f4\u591a',
  countUnit: '\u4e2a',
}

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
        const { windowHeight: winH, safeArea } = Taro.getSystemInfoSync()
        const safeGap = safeArea ? Math.max(winH - safeArea.bottom, 0) : 0
        const used = (hero?.height || 0) + (today?.height || 0) + (head?.height || 0) + 56
        const available = Math.max(260, winH - used - safeGap - 12)
        setAvailHeight(available)
      })
    })
  }, [])

  const extraCount = Math.max(visibleTasks.length - 4, 0)

  return (
    <>
      {/* Hero summary */}
      <View id='hero' className='hero card'>
        <View className='hero-panel'>
          <View className='hero-avatar'>
            <View className='avatar-wrap'>
              <View className='avatar'>
                <Text className='avatar-emoji' aria-hidden>
                  {UI.avatar}
                </Text>
              </View>
              <View className='badge'>{STRINGS.heroBadge}</View>
            </View>
            <View className='hero-info'>
              <Text className='hero-name'>{role.name}</Text>
              <Text className='hero-stars'>{UI.stars.slice(0, role.stars)}</Text>
            </View>
          </View>
          <View className='hero-pill'>
            <Text>{STRINGS.heroPill}</Text>
          </View>
        </View>
        <View className='hero-stats'>
          {attrList.map((attr) => (
            <View key={attr} className='stat'>
              <View className='stat-info'>
                <View className='stat-label'>
                  <View className={`stat-icon ${attrTone[attr]}`}>
                    <Text aria-hidden>{attrMeta[attr].icon}</Text>
                  </View>
                  <Text className='label'>{attr}</Text>
                </View>
                <Text className='val'>{role[attr]}</Text>
              </View>
              <View className='track'>
                <View className={`fill ${attrTone[attr]}`} style={{ width: `${role[attr]}%` }} />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Today highlights */}
      <View id='today' className='section card'>
        <View className='section-bar'>
          <View className='section-head'>
            <Text className='section-icon'>{UI.timelineIcon}</Text>
            <Text className='section-title'>{STRINGS.todayTitle}</Text>
          </View>
          <Text className='section-meta'>
            {STRINGS.todayMeta} · {todayTasks.length} {STRINGS.todayUnit}
          </Text>
        </View>
        <ScrollView className='mini-cards' scrollX enableFlex scrollWithAnimation>
          {todayTasks.map((t) => (
            <View key={t.id} className={`mini-card tone-${attrTone[t.type]}`}>
              <View className='mini-header'>
                <View className='mini-icon'>
                  <Text className='emoji'>{t.icon}</Text>
                </View>
                <View className={`mini-chip tone-${attrTone[t.type]}`}>{chipText(t)}</View>
              </View>
              <Text className='mini-title'>{t.title}</Text>
              <Text className='mini-desc'>{t.detail}</Text>
              <View className='mini-foot'>
                <Text className='due'>
                  {UI.calendarIcon} {t.due}
                </Text>
                <Text className='link'>{STRINGS.viewDetail}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Challenge feed */}
      <View className='section card'>
        <View id='feed-head' className='feed-head'>
          <View className='section-head'>
            <Text className='section-icon'>{UI.challengeIcon}</Text>
            <Text className='section-title'>{STRINGS.feedTitle}</Text>
          </View>
          <Text className='section-meta'>
            {feedTasks.length} {STRINGS.feedUnit}
          </Text>
        </View>
        <ScrollView scrollY scrollWithAnimation className='feed-scroll' style={{ height: `${availHeight}px` }}>
          <View className='feed-list'>
            {visibleTasks.map((t) => (
              <View className={`feed-card tone-${attrTone[t.type]}`} key={t.id}>
                <View className='feed-left'>
                  <Text className='emoji'>{t.icon}</Text>
                </View>
                <View className='feed-body'>
                  <Text className='feed-title'>{t.title}</Text>
                  <Text className='feed-desc'>{t.detail}</Text>
                  <View className='feed-meta'>
                    <Text>
                      {STRINGS.typeLabel} · {t.type}
                    </Text>
                    {t.difficulty && (
                      <Text>
                        {STRINGS.difficultyLabel} · {t.difficulty}
                      </Text>
                    )}
                    <Text className='feed-due'>{t.due}</Text>
                  </View>
                </View>
                <View className='feed-side'>
                  <View className={`feed-chip tone-${attrTone[t.type]}`}>{chipText(t)}</View>
                  <Button className='cta'>{STRINGS.button}</Button>
                </View>
              </View>
            ))}
          </View>
          {extraCount > 0 && (
            <View className='feed-more'>
              <Text>
                {STRINGS.showMore} ({extraCount} {STRINGS.countUnit})
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </>
  )
}
