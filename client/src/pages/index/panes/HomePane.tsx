import { View, Text, ScrollView, Button, Image } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import {
  type Attr,
  role,
  todayTasks,
  feedTasks,
  chipText,
  quietLines,
  challengeQuietLines,
  catIdleFrames,
} from '../shared/mocks'

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
  timelineIcon: '\ud83c\udfbf',
  challengeIcon: '\ud83e\udd10',
  calendarIcon: '\ud83d\udd70',
}

const FRAME_DURATION = 240

const STRINGS = {
  heroBadge: 'Lv.5',
  heroPill: '\u661f\u65c5\u8005',
  todayTitle: '\u661f\u7a0b\u7b80\u5f55',
  todayMeta: '\u4eca\u5929',
  todayUnit: '\u9879',
  feedTitle: '\u661f\u65c5\u6311\u6218',
  difficultyLabel: '\u96be\u5ea6',
  feedUnit: '\u4e2a\u4efb\u52a1',
  typeLabel: '\u7c7b\u578b',
  button: '\u63a5\u53d6\u4efb\u52a1',
}

export default function HomePane() {
  const visibleTasks = useMemo(() => feedTasks, [])
  const quietLine = useMemo(() => quietLines[Math.floor(Math.random() * quietLines.length)], [])
  const challengeLine = useMemo(
    () => challengeQuietLines[Math.floor(Math.random() * challengeQuietLines.length)],
    []
  )
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((idx) => (idx + 1) % catIdleFrames.length)
    }, FRAME_DURATION)

    return () => clearInterval(timer)
  }, [])

  useLoad(() => {})

  return (
    <View className='home-pane'>
      {/* Hero summary */}
      <View id='hero' className='hero card'>
        <View className='hero-panel'>
          <View className='hero-avatar'>
            <View className='avatar-wrap'>
              <View className='avatar'>
                <Image
                  className='avatar-frame'
                  src={catIdleFrames[frameIndex]}
                  mode='aspectFill'
                  alt='hero-cat'
                />
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
              <View className='stat-label'>
                <View className={`stat-icon ${attrTone[attr]}`}>
                  <Text aria-hidden>{attrMeta[attr].icon}</Text>
                </View>
                <Text className='label'>{attr}</Text>
              </View>
              <View className='track'>
                <View className={`fill ${attrTone[attr]}`} style={{ width: `${role[attr]}%` }} />
              </View>
              <Text className='val'>{role[attr]}</Text>
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
        {todayTasks.length > 0 ? (
          <ScrollView className='mini-cards' scrollX enableFlex scrollWithAnimation>
            {todayTasks.map((t) => (
              <View key={t.id} className={`mini-card tone-${attrTone[t.type]}`}>
                <View className='mini-header'>
                  <View className='mini-title-row'>
                    <View className='mini-icon'>
                      <Text className='emoji'>{t.icon}</Text>
                    </View>
                    <Text className='mini-title'>{t.title}</Text>
                  </View>
                  <View className={`mini-chip tone-${attrTone[t.type]}`}>{chipText(t)}</View>
                </View>
                <Text className='mini-desc'>{t.detail}</Text>
                <View className='mini-foot'>
                  <Text className='due'>
                    {UI.calendarIcon} {t.due}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View className='mini-empty'>
            <Text>{quietLine}</Text>
          </View>
        )}
      </View>

      {/* Challenge feed */}
      <View className='section card feed-section'>
        <View id='feed-head' className='feed-head'>
          <View className='section-head'>
            <Text className='section-icon'>{UI.challengeIcon}</Text>
            <Text className='section-title'>{STRINGS.feedTitle}</Text>
          </View>
          <Text className='section-meta'>
            {feedTasks.length} {STRINGS.feedUnit}
          </Text>
        </View>
        <View className='feed-scroll-shell'>
          {visibleTasks.length > 0 ? (
            <ScrollView scrollY scrollWithAnimation className='feed-scroll'>
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
            </ScrollView>
          ) : (
            <View className='feed-empty'>
              <Text>{challengeLine}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}
