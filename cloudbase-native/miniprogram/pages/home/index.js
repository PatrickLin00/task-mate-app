const { bootstrap, createTask, generateTaskByAI, operateTask, acceptChallengeTask, updateProfile, completeOnboarding } = require('../../utils/api')
const { formatDateTime, formatDateInput, formatTimeInput, statusLabel, rewardLabel } = require('../../utils/format')
const { requestTaskSubscribeAuth } = require('../../utils/subscribe')
const { saveSubscribeSettings } = require('../../utils/api')
const strings = require('../../config/strings')

const ACTIVE_ASSIGNEE_STATUS = ['in_progress', 'pending_confirmation']

function buildDueAt(dateValue, timeValue) {
  const [year, month, day] = String(dateValue || '').split('-').map((item) => Number(item))
  const [hour, minute] = String(timeValue || '').split(':').map((item) => Number(item))
  const localDate = new Date(year, Math.max(0, (month || 1) - 1), day || 1, hour || 0, minute || 0, 0)
  return localDate.toISOString()
}

function getClientTimeContext() {
  const now = new Date()
  let timezoneLabel = ''
  try {
    timezoneLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch (error) {
    void error
  }
  return {
    clientNow: now.toISOString(),
    timezoneOffsetMinutes: now.getTimezoneOffset(),
    timezoneLabel,
  }
}

function buildCreateState() {
  const tomorrow = Date.now() + 24 * 60 * 60 * 1000
  return {
    visible: false,
    mode: 'create',
    reworkTaskId: '',
    confirmDeletePrevious: false,
    aiPrompt: '',
    title: '',
    detail: '',
    dateValue: formatDateInput(tomorrow),
    timeValue: '21:00',
    rewardType: 'wisdom',
    rewardValue: 1,
    offlineRewardPromise: '',
    selfAssign: false,
    subtasks: [
      { title: '', total: 1 },
      { title: '', total: 1 },
    ],
  }
}

function buildOnboardingState() {
  return {
    visible: false,
    step: 0,
    target: '',
    title: '',
    segments: [],
    hint: '',
    panelPosition: 'bottom',
    actionDriven: false,
  }
}

function buildScrollHints() {
  return {
    page: false,
    detail: false,
    create: false,
    profile: false,
    subscribe: false,
  }
}

let subscribeReminderSeed = 0

const MAX_REMINDER_MINUTES = 365 * 24 * 60

function buildSubscribeOffsetOptions() {
  const options = [
    { minutes: 30, label: `30${strings.subscribeSettings.minuteUnit}` },
    { minutes: 60, label: `60${strings.subscribeSettings.minuteUnit}` },
  ]
  for (let hours = 2; hours <= 23; hours += 1) {
    options.push({ minutes: hours * 60, label: `${hours}${strings.subscribeSettings.hourUnit}` })
  }
  for (let days = 1; days <= 6; days += 1) {
    options.push({ minutes: days * 24 * 60, label: `${days}${strings.subscribeSettings.dayUnit}` })
  }
  options.push({ minutes: 7 * 24 * 60, label: `1${strings.subscribeSettings.weekUnit}` })
  options.push({ minutes: 14 * 24 * 60, label: `2${strings.subscribeSettings.weekUnit}` })
  options.push({ minutes: 21 * 24 * 60, label: `3${strings.subscribeSettings.weekUnit}` })
  for (let months = 1; months <= 12; months += 1) {
    options.push({
      minutes: months * 30 * 24 * 60,
      label: months === 12 ? `1${strings.subscribeSettings.yearUnit}` : `${months}${strings.subscribeSettings.monthUnit}`,
    })
  }
  return options
}

const SUBSCRIBE_OFFSET_OPTIONS = buildSubscribeOffsetOptions()

function normalizeSubscribeMinutes(minutes) {
  const safeMinutes = Math.max(30, Math.min(MAX_REMINDER_MINUTES, Math.floor(Number(minutes || 0) || 0)))
  if (safeMinutes <= 45) return 30
  const matched = SUBSCRIBE_OFFSET_OPTIONS.find((item) => item.minutes === safeMinutes)
  if (matched) return matched.minutes
  let bestOption = SUBSCRIBE_OFFSET_OPTIONS[0]
  let bestDistance = Math.abs(bestOption.minutes - safeMinutes)
  for (let index = 1; index < SUBSCRIBE_OFFSET_OPTIONS.length; index += 1) {
    const option = SUBSCRIBE_OFFSET_OPTIONS[index]
    const distance = Math.abs(option.minutes - safeMinutes)
    if (distance < bestDistance) {
      bestOption = option
      bestDistance = distance
    }
  }
  return bestOption.minutes
}

function getSubscribeOffsetIndex(minutes) {
  const normalizedMinutes = normalizeSubscribeMinutes(minutes)
  const index = SUBSCRIBE_OFFSET_OPTIONS.findIndex((item) => item.minutes === normalizedMinutes)
  return index >= 0 ? index : 0
}

function buildSubscribeReminderDraft(direction, minutes) {
  const normalizedDirection = direction === 'after' ? 'after' : direction === 'exact' ? 'exact' : 'before'
  const normalizedMinutes = normalizedDirection === 'exact' ? 0 : normalizeSubscribeMinutes(minutes)
  const optionIndex = normalizedDirection === 'exact' ? -1 : getSubscribeOffsetIndex(normalizedMinutes)
  subscribeReminderSeed += 1
  return {
    id: `reminder_${Date.now()}_${subscribeReminderSeed}`,
    direction: normalizedDirection,
    minutes: normalizedMinutes,
    optionIndex,
    optionLabel: normalizedDirection === 'exact' ? strings.subscribeSettings.onTimeLabel : (SUBSCRIBE_OFFSET_OPTIONS[optionIndex] ? SUBSCRIBE_OFFSET_OPTIONS[optionIndex].label : SUBSCRIBE_OFFSET_OPTIONS[0].label),
  }
}

function dedupeSubscribeReminders(reminders) {
  const source = Array.isArray(reminders) ? reminders : []
  const seen = new Set()
  const unique = []
  for (let index = 0; index < source.length; index += 1) {
    const item = source[index]
    const direction = item && item.direction === 'after' ? 'after' : item && item.direction === 'exact' ? 'exact' : 'before'
    const minutes = direction === 'exact' ? 0 : normalizeSubscribeMinutes(item && item.minutes ? item.minutes : 0)
    const key = `${direction}:${minutes}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(Object.assign({}, item, { direction, minutes }))
  }
  return unique
}

function reindexSubscribeReminderDrafts(reminders) {
  const source = dedupeSubscribeReminders(reminders)
  let beforeCount = 0
  let afterCount = 0
  return source.map((item) => {
    const direction = item && item.direction === 'after' ? 'after' : item && item.direction === 'exact' ? 'exact' : 'before'
    let title = strings.subscribeSettings.reminderCardTitle
    if (direction === 'after') {
      afterCount += 1
      title = `${strings.subscribeSettings.afterReminderCardTitle}${afterCount}`
    } else if (direction === 'before') {
      beforeCount += 1
      title = `${strings.subscribeSettings.beforeReminderCardTitle}${beforeCount}`
    }
    return Object.assign({}, item, { cardTitle: title })
  })
}

function normalizeSubscribeReminderSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {}
  const categoryEnabledSource = source.categoryEnabled && typeof source.categoryEnabled === 'object' ? source.categoryEnabled : {}
  const rawTaskDeadline = Array.isArray(source.taskDeadline)
    ? source.taskDeadline
        .map((item) => {
          const rawDirection = String(item && item.direction ? item.direction : '').trim()
          const direction = rawDirection === 'after' ? 'after' : rawDirection === 'exact' ? 'exact' : 'before'
          const minutes = direction === 'exact' ? 0 : normalizeSubscribeMinutes(item && item.minutes ? item.minutes : 0)
          if (direction !== 'exact' && !minutes) return null
          return { direction, minutes }
        })
        .filter(Boolean)
    : []
  const dedupedTaskDeadline = dedupeSubscribeReminders(rawTaskDeadline)

  const exactList = dedupedTaskDeadline.filter((item) => item.direction === 'exact')
  const beforeList = dedupedTaskDeadline.filter((item) => item.direction === 'before')
  const afterList = dedupedTaskDeadline.filter((item) => item.direction === 'after')

  return {
    categoryEnabled: {
      taskDeadlineExact: categoryEnabledSource.taskDeadlineExact !== false,
      taskDeadlineBefore: categoryEnabledSource.taskDeadlineBefore !== false,
      taskDeadlineAfter: categoryEnabledSource.taskDeadlineAfter !== false,
      work: categoryEnabledSource.work !== false,
      taskUpdate: categoryEnabledSource.taskUpdate !== false,
      review: categoryEnabledSource.review !== false,
      challengeExpired: categoryEnabledSource.challengeExpired !== false,
    },
    taskDeadline: []
      .concat(exactList.length ? exactList : [{ direction: 'exact', minutes: 0 }])
      .concat(beforeList.length ? beforeList : [{ direction: 'before', minutes: 30 }])
      .concat(afterList.length ? afterList : [{ direction: 'after', minutes: 60 }])
      .slice(0, 8),
  }
}

function getSubscribeStatusLabel(enabled, sceneStatus) {
  if (!enabled) return strings.subscribeSettings.statusDisabled
  if (sceneStatus === 'accepted') return strings.subscribeSettings.statusEnabled
  return strings.subscribeSettings.statusNeedAuth
}

function getSubscribeSceneStatusForCategory(category, preferences) {
  const source = preferences && typeof preferences === 'object' ? preferences : {}
  const sceneKey = category === 'work' || category === 'taskUpdate' || category === 'review' ? category : 'todo'
  return source[sceneKey] && source[sceneKey].status ? source[sceneKey].status : ''
}

function buildSubscribeSettingsState(settings, preferences) {
  const normalized = normalizeSubscribeReminderSettings(settings)
  const subscribePreferences = preferences && typeof preferences === 'object' ? preferences : {}
  const todoStatus = subscribePreferences.todo && subscribePreferences.todo.status ? subscribePreferences.todo.status : ''
  const workStatus = subscribePreferences.work && subscribePreferences.work.status ? subscribePreferences.work.status : ''
  const taskUpdateStatus = subscribePreferences.taskUpdate && subscribePreferences.taskUpdate.status ? subscribePreferences.taskUpdate.status : ''
  const reviewStatus = subscribePreferences.review && subscribePreferences.review.status ? subscribePreferences.review.status : ''
  return {
    visible: false,
    closing: false,
    categoryEnabled: Object.assign({}, normalized.categoryEnabled),
    statuses: {
      taskDeadlineExact: getSubscribeStatusLabel(normalized.categoryEnabled.taskDeadlineExact, todoStatus),
      taskDeadlineBefore: getSubscribeStatusLabel(normalized.categoryEnabled.taskDeadlineBefore, todoStatus),
      taskDeadlineAfter: getSubscribeStatusLabel(normalized.categoryEnabled.taskDeadlineAfter, todoStatus),
      work: getSubscribeStatusLabel(normalized.categoryEnabled.work, workStatus),
      taskUpdate: getSubscribeStatusLabel(normalized.categoryEnabled.taskUpdate, taskUpdateStatus),
      review: getSubscribeStatusLabel(normalized.categoryEnabled.review, reviewStatus),
      challengeExpired: getSubscribeStatusLabel(normalized.categoryEnabled.challengeExpired, todoStatus),
    },
    reminders: reindexSubscribeReminderDrafts(normalized.taskDeadline.map((item) => buildSubscribeReminderDraft(item.direction, item.minutes))),
  }
}

function getSecondaryActionColumns(task) {
  let count = 0
  if (task && task.canOpenHistory) count += 1
  if (task && task.canRework) count += 1
  if (task && (task.canClose || task.canDelete)) count += 1
  return count >= 3 ? 3 : 2
}

function splitActionRows(actions) {
  const visible = safeArray(actions).filter(Boolean)
  if (visible.length >= 5) return [visible.slice(0, 3), visible.slice(3)]
  if (visible.length === 4) return [visible.slice(0, 2), visible.slice(2)]
  if (visible.length) return [visible]
  return []
}

function buildNonProgressActionRows(task) {
  if (!task) return []
  const actions = []

  if (task.isHistory) return []

  if (task.status === 'review_pending') {
    if (task.canComplete) actions.push({ key: 'completeTask', variant: 'primary', loadingKey: 'completeTask' })
    if (task.canContinueReview) actions.push({ key: 'continueReview', variant: 'ghost', loadingKey: 'continueReview' })
    return splitActionRows(actions)
  }

  if (task.status === 'pending_confirmation') {
    if (task.canAcceptRework) actions.push({ key: 'acceptRework', variant: 'primary', loadingKey: 'acceptReworkTask' })
    if (task.canRejectRework) actions.push({ key: 'rejectRework', variant: 'ghost', loadingKey: 'rejectReworkTask' })
    if (task.canCancelRework) actions.push({ key: 'cancelRework', variant: 'ghost', loadingKey: 'cancelReworkTask' })
    return splitActionRows(actions)
  }

  if (task.status === 'closed') {
    if (task.canRestart) actions.push({ key: 'restartTask', variant: 'primary', loadingKey: 'restartTask' })
    if (task.canDelete) actions.push({ key: 'deleteTask', variant: 'ghost', loadingKey: 'deleteTask' })
    return splitActionRows(actions)
  }

  if (task.status === 'pending' && !task.hasAssignee) {
    if (task.canAcceptTask) {
      actions.push({ key: 'acceptTask', variant: 'primary', loadingKey: 'acceptTask' })
    } else if (task.canRefreshSchedule) {
      actions.push({ key: 'refreshSchedule', variant: 'primary', loadingKey: 'refreshTaskSchedule' })
    }
    if (task.canShare) actions.push({ key: 'shareTask', variant: 'ghost' })
    if (task.canOpenHistory) actions.push({ key: 'viewPreviousVersion', variant: 'ghost' })
    if (task.canRework) actions.push({ key: 'reworkTask', variant: 'ghost' })
    if (task.canClose) actions.push({ key: 'closeTask', variant: 'ghost', loadingKey: 'closeTask' })
    return splitActionRows(actions)
  }

  if (task.canRestart) actions.push({ key: 'restartTask', variant: 'primary', loadingKey: 'restartTask' })
  if (task.canAcceptTask) actions.push({ key: 'acceptTask', variant: 'primary', loadingKey: 'acceptTask' })
  if (task.canRefreshSchedule) actions.push({ key: 'refreshSchedule', variant: 'primary', loadingKey: 'refreshTaskSchedule' })
  if (task.canShare) actions.push({ key: 'shareTask', variant: 'ghost' })
  if (task.canOpenHistory) actions.push({ key: 'viewPreviousVersion', variant: 'ghost' })
  if (task.canRework) actions.push({ key: 'reworkTask', variant: 'ghost' })
  if (task.canClose) actions.push({ key: 'closeTask', variant: 'ghost', loadingKey: 'closeTask' })
  if (task.canDelete) actions.push({ key: 'deleteTask', variant: 'ghost', loadingKey: 'deleteTask' })
  return splitActionRows(actions)
}

function buildProgressExtraActionRows(task) {
  return splitActionRows([
    task && task.canOpenHistory ? { key: 'viewPreviousVersion', variant: 'ghost' } : null,
    task && task.canRework ? { key: 'reworkTask', variant: 'ghost' } : null,
    task && (task.canClose || task.canDelete)
      ? { key: task.canDelete ? 'deleteTask' : 'closeTask', variant: 'ghost', loadingKey: task.canDelete ? 'deleteTask' : 'closeTask' }
      : null,
  ])
}

function getPrimaryActionColumns(task) {
  let count = 0
  if (task && task.canAcceptTask) count += 1
  if (task && task.canAcceptRework) count += 1
  if (task && task.canRejectRework) count += 1
  if (task && task.canCancelRework) count += 1
  if (task && task.canSubmitReview && !task.canAdjustProgress) count += 1
  if (task && task.canContinueReview) count += 1
  if (task && task.canComplete && !task.canAdjustProgress) count += 1
  if (task && task.canAbandon && !task.canAdjustProgress) count += 1
  if (task && task.canRestart) count += 1
  if (task && task.canRefreshSchedule) count += 1
  return count >= 3 ? 3 : 2
}

function getOnboardingTab(step) {
  if (step <= 4) return 'home'
  if (step <= 6) return 'collab'
  if (step <= 8) return 'mission'
  if (step <= 10) return 'archive'
  if (step === 11) return 'achievements'
  if (step >= 12) return 'profile'
  return 'home'
}

const GUIDE_IDS = {
  collab: 'guide-collab-task',
  mission: 'guide-mission-task',
  archive: 'guide-archive-task',
}

function buildGuideTask(profile, mode) {
  const userId = profile && profile.userId ? profile.userId : 'guide-user'
  const nickname = profile && profile.nickname ? profile.nickname : '旅者-P-ZA'
  const dueAt = new Date('2026-03-18T21:00:00+08:00').toISOString()
  const base = {
    _id: mode === 'archive' ? GUIDE_IDS.archive : mode === 'mission' ? GUIDE_IDS.mission : GUIDE_IDS.collab,
    title: '整理测试房间',
    detail: '把散乱的区域收一收，确认流程清楚、页面可用。',
    status: mode === 'collab' ? 'pending' : mode === 'mission' ? 'in_progress' : 'completed',
    category: 'normal',
    creatorId: userId,
    creatorName: nickname,
    assigneeId: mode === 'collab' ? '' : userId,
    assigneeName: mode === 'collab' ? '' : nickname,
    dueAt,
    startAt: new Date('2026-03-16T20:00:00+08:00').toISOString(),
    completedAt: mode === 'archive' ? new Date('2026-03-16T21:30:00+08:00').toISOString() : null,
    closedAt: null,
    previousTaskId: '',
    attributeReward: { type: 'agility', value: 1 },
    subtasks: [
      { title: '整理桌面区域', total: 1, current: mode === 'collab' ? 0 : 1 },
      { title: '收好杂物箱', total: 1, current: mode === 'collab' ? 0 : 1 },
    ],
    computedProgress: mode === 'collab' ? { current: 0, total: 2 } : { current: 2, total: 2 },
    createdAt: new Date('2026-03-16T20:00:00+08:00').toISOString(),
    updatedAt: new Date('2026-03-16T20:00:00+08:00').toISOString(),
    source: mode === 'archive' ? 'archive' : mode,
  }
  if (mode === 'archive') {
    return enrichArchive({
      _id: GUIDE_IDS.archive,
      ownerId: userId,
      sourceTaskId: 'guide-finished-task',
      status: 'completed',
      completedAt: base.completedAt,
      submittedAt: new Date('2026-03-16T21:10:00+08:00').toISOString(),
      updatedAt: base.completedAt,
      snapshot: base,
    })
  }
  const task = enrichTask(base, profile, mode)
  if (mode === 'mission') {
    return Object.assign({}, task, {
      canAdjustProgress: false,
      canSubmitReview: false,
      canComplete: true,
      canAbandon: false,
      canRework: false,
      canClose: false,
      canDelete: false,
    })
  }
  return task
}

function buildGuideHomeView(profile) {
  const todayTask = enrichTask(
    {
      _id: 'guide-today-task',
      title: '检查首页信息',
      detail: '确认今天要先推进的内容有没有漏掉。',
      status: 'in_progress',
      category: 'normal',
      creatorId: profile.userId || 'guide-user',
      creatorName: profile.nickname || '旅者-P-ZA',
      assigneeId: profile.userId || 'guide-user',
      assigneeName: profile.nickname || '旅者-P-ZA',
      dueAt: new Date('2026-03-16T21:00:00+08:00').toISOString(),
      startAt: new Date('2026-03-16T18:00:00+08:00').toISOString(),
      attributeReward: { type: 'wisdom', value: 1 },
      subtasks: [{ title: '确认今日重点', total: 1, current: 0 }],
      createdAt: new Date('2026-03-16T18:00:00+08:00').toISOString(),
      updatedAt: new Date('2026-03-16T18:00:00+08:00').toISOString(),
    },
    profile,
    'today'
  )
  const challengeTask = enrichTask(
    {
      _id: 'guide-challenge-task',
      title: '完成一组整理练习',
      detail: '这是系统每天给你的练手挑战。',
      status: 'pending',
      category: 'challenge',
      creatorId: `sys:${profile.userId || 'guide-user'}`,
      creatorName: '系统',
      assigneeId: '',
      assigneeName: '',
      dueAt: new Date('2026-03-16T23:59:00+08:00').toISOString(),
      startAt: new Date('2026-03-16T00:00:00+08:00').toISOString(),
      attributeReward: { type: 'agility', value: 1 },
      subtasks: [{ title: '完成一组整理', total: 1, current: 0 }],
      createdAt: new Date('2026-03-16T00:00:00+08:00').toISOString(),
      updatedAt: new Date('2026-03-16T00:00:00+08:00').toISOString(),
      isVirtual: true,
      seedKey: 'guide-seed',
    },
    profile,
    'challenge'
  )
  return {
    todayTasks: [todayTask],
    challengeTasks: [challengeTask],
    missionTasks: [],
    reviewPendingTasks: [],
    pendingConfirmationTasks: [],
    waitingAcceptTasks: [],
    inProgressCollabTasks: [],
    collabTasks: [],
    historyTasks: [],
    archiveTasks: [],
  }
}

function buildGuideCreateState(step) {
  const create = Object.assign(buildCreateState(), {
    visible: step === 3 || step === 4,
    aiPrompt: '帮我生成一个整理测试房间的协作任务',
  })
  if (step === 4) {
    create.title = '整理测试房间'
    create.detail = '把散乱的区域整理好，顺手熟悉一次任务发布流程。'
    create.rewardType = 'agility'
    create.subtasks = [
      { title: '整理桌面区域', total: 1 },
      { title: '收好杂物箱', total: 1 },
    ]
  }
  return create
}

function getOnboardingMeta(step) {
  switch (step) {
    case 0:
      return {
        title: '先看顶部卡片',
        segments: [
          { text: '这里会显示 ' },
          { text: '昵称', strong: true },
          { text: '、' },
          { text: '属性值', strong: true },
          { text: ' 和 ' },
          { text: '新建任务', strong: true },
          { text: '。这是你进入小程序后最先看到的状态面板。' },
        ],
        hint: '',
        target: 'hero',
        panelPosition: 'bottom',
        actionDriven: false,
      }
    case 1:
      return {
        title: '再看首页',
        segments: [
          { text: '这里会显示 ' },
          { text: '首页', strong: true },
          { text: ' 里的 ' },
          { text: '今日焦点', strong: true },
          { text: ' 和 ' },
          { text: '每日挑战', strong: true },
          { text: '。进入小程序或下拉时会自动刷新数据。' },
        ],
        hint: '',
        target: 'home',
        panelPosition: 'top',
        actionDriven: false,
      }
    case 2:
      return {
        title: '开始新建任务',
        segments: [
          { text: '点一下 ' },
          { text: '新建任务', strong: true },
          { text: '。接下来会用一份假数据带你走完整个流程。' },
        ],
        hint: '请点击高亮按钮继续',
        target: 'create-entry',
        panelPosition: 'bottom',
        actionDriven: true,
      }
    case 3:
      return {
        title: '先填充任务',
        segments: [
          { text: '这里已经帮你填好一句示例描述。点 ' },
          { text: '一键填充任务', strong: true },
          { text: '，先看看任务草案会怎么整理出来。' },
        ],
        hint: '请点击高亮按钮继续',
        target: 'create-ai',
        panelPosition: 'bottom',
        actionDriven: true,
      }
    case 4:
      return {
        title: '发布到协作区',
        segments: [
          { text: '草案已经准备好了。请在页面最下方点击 ' },
          { text: '创建任务', strong: true },
          { text: '，这张演示任务会出现在协作页里。' },
        ],
        hint: '请点击高亮按钮继续',
        target: 'create-submit',
        panelPosition: 'top',
        actionDriven: true,
      }
    case 5:
      return {
        title: '看看协作区',
        segments: [
          { text: '这里会显示你发布出去、还在跟进状态的任务。' },
          { text: '点这张演示任务', strong: true },
          { text: '，进入详情。' },
        ],
        hint: '请点击高亮任务继续',
        target: 'collab-list',
        panelPosition: 'top',
        actionDriven: true,
      }
    case 6:
      return {
        title: '接取这张任务',
        segments: [
          { text: '在详情里点 ' },
          { text: '接取任务', strong: true },
          { text: '。接取后，它会进入使命页。' },
        ],
        hint: '请点击高亮按钮继续',
        target: 'collab-accept',
        panelPosition: 'bottom',
        actionDriven: true,
      }
    case 7:
      return {
        title: '看看使命区',
        segments: [
          { text: '这里是你已经接取并正在推进的任务。' },
          { text: '点这张演示任务', strong: true },
          { text: '，继续下一步。' },
        ],
        hint: '请点击高亮任务继续',
        target: 'mission-list',
        panelPosition: 'top',
        actionDriven: true,
      }
    case 8:
      return {
        title: '完成这张任务',
        segments: [
          { text: '这一步直接演示完成流程。点 ' },
          { text: '完成任务', strong: true },
          { text: '，完成后会进入归档。' },
        ],
        hint: '请点击高亮按钮继续',
        target: 'mission-complete',
        panelPosition: 'bottom',
        actionDriven: true,
      }
    case 9:
      return {
        title: '看看归档',
        segments: [
          { text: '这里会保留完成记录，普通任务会保留 ' },
          { text: '7天', strong: true },
          { text: '。' },
          { text: '点这条演示归档', strong: true },
          { text: '，进入记录详情。' },
        ],
        hint: '请点击高亮记录继续',
        target: 'archive-list',
        panelPosition: 'top',
        actionDriven: true,
      }
    case 10:
      return {
        title: '删除一条完成记录',
        segments: [
          { text: '归档默认保留 ' },
          { text: '7天', strong: true },
          { text: '，也可以提前删除完成记录。点 ' },
          { text: '删除归档', strong: true },
          { text: '，可以把这条演示记录移除。' },
        ],
        hint: '请点击高亮按钮继续',
        target: 'archive-delete',
        panelPosition: 'bottom',
        actionDriven: true,
      }
    case 11:
      return {
        title: '看看成长页',
        segments: [
          { text: '这里会展示你的属性累计和归档记录数量。' },
        ],
        hint: '',
        target: 'achievements',
        panelPosition: 'top',
        actionDriven: false,
      }
    case 12:
      return {
        title: strings.onboardingExtra.settingsStepTitle,
        segments: strings.onboardingExtra.settingsStepSegments,
        hint: '',
        target: 'profile-subscribe-entry',
        panelPosition: 'top',
        actionDriven: false,
      }
    case 13:
      return {
        title: strings.onboardingExtra.subscribeStepTitle,
        segments: strings.onboardingExtra.subscribeStepSegments,
        hint: '',
        target: 'subscribe-settings',
        panelPosition: 'top',
        actionDriven: false,
      }
    default:
      return {
        title: '',
        segments: [],
        hint: '',
        target: '',
        panelPosition: 'top',
        actionDriven: false,
      }
  }
}

function safeArray(list) {
  return Array.isArray(list) ? list.filter(Boolean) : []
}

function extractOfflineRewardPromiseFromPrompt(text) {
  const source = String(text || '').trim()
  if (!source) return ''
  const patterns = [
    /(?:线下奖励|额外奖励|奖励|奖品|报酬|酬劳)[：:是为给\s]*([^，。；;\n]{2,32})/,
    /(?:换取|兑换|换成)[^\S\r\n]*([^，。；;\n]{2,24})/,
    /((?:请|送|给)[^，。；;\n]{0,8}(?:喝|吃|拿|送)[^，。；;\n]{1,24})/,
    /((?:请|带|陪)(?:你|你们|对方|Ta|ta)?去[^，。；;\n]{1,24})/,
    /((?:一起去|去)[^，。；;\n]{2,18})/,
    /((?:奶茶|咖啡|红包|请客|饮料|零食|甜品)[^，。；;\n]{0,18})/,
  ]
  for (let index = 0; index < patterns.length; index += 1) {
    const matched = source.match(patterns[index])
    if (!matched) continue
    const value = String(matched[1] || '')
      .replace(/^(作为)?(?:线下奖励|额外奖励|奖励|奖品|报酬|酬劳|换取|兑换|换成)[：:\s]*/u, '')
      .replace(/[,.，。；;!！?？]+$/u, '')
      .trim()
    if (value.length >= 2) return value
  }
  return ''
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function dedupeById(list) {
  const map = new Map()
  safeArray(list).forEach((item) => {
    const id = String(item && item._id ? item._id : '')
    if (id && !map.has(id)) map.set(id, item)
  })
  return Array.from(map.values())
}

function cloneSubtasks(list) {
  return safeArray(list).map((item) => ({
    title: item && item.title ? item.title : '',
    current: Number(item && item.current ? item.current : 0),
    total: Number(item && item.total ? item.total : 1),
    previewCurrent: Number(item && item.previewCurrent >= 0 ? item.previewCurrent : (item && item.current ? item.current : 0)),
    sliderValue:
      typeof (item && item.sliderValue) === 'number'
        ? Number(item.sliderValue)
        : Math.round(
            (Number(item && item.current ? item.current : 0) / Math.max(1, Number(item && item.total ? item.total : 1))) * 1000
          ),
    previewPercent:
      typeof (item && item.previewPercent) === 'number'
        ? Number(item.previewPercent)
        : Math.round(
            (Number(item && item.current ? item.current : 0) / Math.max(1, Number(item && item.total ? item.total : 1))) * 100
          ),
  }))
}

function computeProgress(task) {
  const subtasks = safeArray(task && task.subtasks)
  return subtasks.reduce(
    (result, item) => ({
      current: result.current + Number(item.current || 0),
      total: result.total + Number(item.total || 0),
    }),
    { current: 0, total: 0 }
  )
}

function getOverdueDaysText(dueAt, status) {
  if (!dueAt || status !== 'in_progress') return ''
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return ''
  const now = new Date()
  const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.floor((nowDate.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays <= 0) return ''
  return `已过期${diffDays}天`
}

function shouldHideTask(task, supersededIds) {
  return supersededIds.has(String(task && task._id ? task._id : ''))
}

function buildSupersededIds(creatorRaw, assigneeRaw) {
  return new Set(
    creatorRaw
      .concat(assigneeRaw)
      .filter((task) => task && task.status !== 'refactored' && task.previousTaskId)
      .map((task) => String(task.previousTaskId))
  )
}

function enrichArchive(archive) {
  const snapshot = archive && archive.snapshot ? archive.snapshot : {}
  const progress = computeProgress(snapshot)
  return {
    _id: archive._id,
    archiveId: archive._id,
    sourceTaskId: archive.sourceTaskId,
    status: archive.status,
    statusText: statusLabel(archive.status),
    title: snapshot.title || '',
    detail: snapshot.detail || '',
    creatorName: snapshot.creatorName || '',
    assigneeName: snapshot.assigneeName || '',
    dueText: formatDateTime(snapshot.dueAt),
    rewardText: `${rewardLabel(snapshot.attributeReward && snapshot.attributeReward.type)} +${snapshot.attributeReward && snapshot.attributeReward.value ? snapshot.attributeReward.value : 0}`,
    offlineRewardPromise: snapshot.offlineRewardPromise || '',
    finishedText: formatDateTime(archive.completedAt || archive.submittedAt || archive.updatedAt),
    progressText: `${progress.current}/${progress.total || 1}`,
    subtasks: safeArray(snapshot.subtasks),
    isArchive: true,
    canDelete: archive.status !== 'review_pending',
  }
}

function enrichTask(task, profile, source) {
  const userId = profile && profile.userId ? profile.userId : ''
  const progress = task && task.computedProgress ? task.computedProgress : computeProgress(task)
  const isCreator = Boolean(task && userId && task.creatorId === userId)
  const isAssignee = Boolean(task && userId && task.assigneeId === userId)
  const isHistory = source === 'history' || task.status === 'refactored'
  const isChallenge = task && task.category === 'challenge'
  const isSharedPreviewLocked = Boolean(task && task.sharedPreviewLocked)
  const now = Date.now()
  const dueAt = task && task.dueAt ? new Date(task.dueAt).getTime() : NaN
  const isOverdue = Number.isFinite(dueAt) ? dueAt < now : false

  return Object.assign({}, task, {
    statusText: statusLabel(task.status),
    rewardName: rewardLabel(task.attributeReward && task.attributeReward.type),
    rewardText: `${rewardLabel(task.attributeReward && task.attributeReward.type)} +${task.attributeReward && task.attributeReward.value ? task.attributeReward.value : 0}`,
    offlineRewardPromise: task.offlineRewardPromise || '',
    dueText: formatDateTime(task.dueAt),
    submittedText: formatDateTime(task.submittedAt),
    completedText: formatDateTime(task.completedAt),
    closedText: formatDateTime(task.closedAt),
    overdueDaysText: getOverdueDaysText(task.dueAt, task.status),
    progressText: `${progress.current}/${progress.total || 1}`,
    progressCurrent: progress.current,
    progressTotal: progress.total || 1,
    isCreator,
    isAssignee,
    isHistory,
    isArchive: false,
    isSharedPreviewLocked,
    canOpenHistory: !isHistory && Boolean(task.previousTaskId) && !(task.status === 'pending' && !task.assigneeId && isOverdue),
    canAcceptTask: !isSharedPreviewLocked && task.status === 'pending' && !task.assigneeId && !isOverdue,
    canAcceptRework: isAssignee && task.status === 'pending_confirmation',
    canRejectRework: isAssignee && task.status === 'pending_confirmation',
    canCancelRework: isCreator && task.status === 'pending_confirmation',
    canSubmitReview: isAssignee && task.status === 'in_progress' && !isChallenge,
    canContinueReview: isCreator && task.status === 'review_pending',
    canComplete:
      !isHistory &&
      (
        (isChallenge && isAssignee && task.status === 'in_progress') ||
        (!isChallenge && isCreator && task.status === 'review_pending')
      ),
    canAbandon: !isSharedPreviewLocked && isAssignee && task.status === 'in_progress',
    canShare: isCreator && !isChallenge && !isHistory && task.status === 'pending' && !task.assigneeId && !isOverdue,
    canClose:
      isCreator &&
      task.status !== 'closed' &&
      task.status !== 'completed' &&
      task.status !== 'refactored' &&
      task.status !== 'review_pending' &&
      task.status !== 'pending_confirmation',
    canRestart: isCreator && task.status === 'closed',
    canRefreshSchedule: isCreator && task.status === 'pending' && !task.assigneeId && isOverdue,
    canDelete: isCreator && task.status === 'closed' && !isHistory,
    canRework:
      isCreator &&
      task.status !== 'completed' &&
      task.status !== 'refactored' &&
      task.status !== 'review_pending' &&
      task.status !== 'pending_confirmation',
    canAdjustProgress: !isSharedPreviewLocked && isAssignee && task.status === 'in_progress',
    primaryActionColumns: getPrimaryActionColumns({
      canAcceptTask: !isSharedPreviewLocked && task.status === 'pending' && !task.assigneeId,
      canAcceptRework: isAssignee && task.status === 'pending_confirmation',
      canRejectRework: isAssignee && task.status === 'pending_confirmation',
      canCancelRework: isCreator && task.status === 'pending_confirmation',
      canSubmitReview: isAssignee && task.status === 'in_progress' && !isChallenge,
      canContinueReview: isCreator && task.status === 'review_pending',
      canComplete:
        !isHistory &&
        (
          (isChallenge && isAssignee && task.status === 'in_progress') ||
          (!isChallenge && isCreator && task.status === 'review_pending')
        ),
      canAbandon: !isSharedPreviewLocked && isAssignee && task.status === 'in_progress',
      canRestart: isCreator && task.status === 'closed',
      canRefreshSchedule: isCreator && task.status === 'pending' && !task.assigneeId && isOverdue,
      canAdjustProgress: isAssignee && task.status === 'in_progress',
    }),
    nonProgressActionRows: buildNonProgressActionRows({
      status: task.status,
      hasAssignee: Boolean(task.assigneeId),
      isHistory,
      canRefreshSchedule: isCreator && task.status === 'pending' && !task.assigneeId && isOverdue,
      canAcceptTask: !isSharedPreviewLocked && task.status === 'pending' && !task.assigneeId && !isOverdue,
      canAcceptRework: isAssignee && task.status === 'pending_confirmation',
      canRejectRework: isAssignee && task.status === 'pending_confirmation',
      canCancelRework: isCreator && task.status === 'pending_confirmation',
      canSubmitReview: isAssignee && task.status === 'in_progress' && !isChallenge,
      canContinueReview: isCreator && task.status === 'review_pending',
      canComplete:
        !isHistory &&
        (
          (isChallenge && isAssignee && task.status === 'in_progress') ||
          (!isChallenge && isCreator && task.status === 'review_pending')
        ),
      canAbandon: !isSharedPreviewLocked && isAssignee && task.status === 'in_progress',
      canRestart: isCreator && task.status === 'closed',
      canShare: isCreator && !isChallenge && !isHistory && task.status === 'pending' && !task.assigneeId && !isOverdue,
      canOpenHistory: !isHistory && Boolean(task.previousTaskId) && !(task.status === 'pending' && !task.assigneeId && isOverdue),
      canRework:
        isCreator &&
        task.status !== 'completed' &&
        task.status !== 'refactored' &&
        task.status !== 'review_pending' &&
        task.status !== 'pending_confirmation',
      canClose:
        isCreator &&
        task.status !== 'closed' &&
        task.status !== 'completed' &&
        task.status !== 'refactored' &&
        task.status !== 'review_pending' &&
        task.status !== 'pending_confirmation',
      canDelete: isCreator && task.status === 'closed' && !isHistory,
    }),
    progressExtraActionRows: buildProgressExtraActionRows({
      canOpenHistory: !isHistory && Boolean(task.previousTaskId) && !(task.status === 'pending' && !task.assigneeId && isOverdue),
      canRework:
        isCreator &&
        task.status !== 'completed' &&
        task.status !== 'refactored' &&
        task.status !== 'review_pending' &&
        task.status !== 'pending_confirmation',
      canClose:
        isCreator &&
        task.status !== 'closed' &&
        task.status !== 'completed' &&
        task.status !== 'refactored' &&
        task.status !== 'review_pending' &&
        task.status !== 'pending_confirmation',
      canDelete: isCreator && task.status === 'closed' && !isHistory,
    }),
    source,
  })
}

function buildDashboardView(dashboard, profile) {
  const creatorRaw = safeArray(dashboard && dashboard.creator)
  const assigneeRaw = safeArray(dashboard && dashboard.assignee)
  const completedRaw = safeArray(dashboard && dashboard.completed)
  const historyRaw = safeArray(dashboard && dashboard.history)
  const challengeRaw = safeArray(dashboard && dashboard.challenge)
  const todayRaw = safeArray(dashboard && dashboard.today && dashboard.today.tasks)
  const supersededIds = buildSupersededIds(creatorRaw, assigneeRaw)
  const now = Date.now()

  const missionSource = assigneeRaw.filter(
    (task) => ACTIVE_ASSIGNEE_STATUS.includes(task.status) && !shouldHideTask(task, supersededIds)
  )

  const reviewPendingSource = creatorRaw.filter((task) => {
    if (shouldHideTask(task, supersededIds)) return false
    if (task.status !== 'review_pending') return false
    return true
  })

  const pendingConfirmationSource = creatorRaw.filter((task) => {
    if (shouldHideTask(task, supersededIds)) return false
    if (task.status !== 'pending_confirmation') return false
    return true
  })

  const waitingAcceptSource = creatorRaw.filter((task) => {
    if (shouldHideTask(task, supersededIds)) return false
    if (task.status !== 'pending') return false
    if (task.assigneeId) return false
    return true
  })

  const inProgressCollabSource = creatorRaw.filter((task) => {
    if (shouldHideTask(task, supersededIds)) return false
    if (task.status === 'refactored') return false
    if (task.status === 'review_pending') return false
    if (task.status === 'pending_confirmation') return false
    if (task.status === 'pending' && !task.assigneeId) return false
    if (task.assigneeId && task.creatorId === task.assigneeId) return false
    if (task.status === 'completed' && (!task.assigneeId || task.assigneeId === task.creatorId)) return false
    return true
  })

  const historySource = dedupeById(creatorRaw.filter((task) => task.status === 'refactored').concat(historyRaw))

  return {
    todayTasks: todayRaw.map((task) => enrichTask(task, profile, 'today')),
    challengeTasks: challengeRaw.map((task) => enrichTask(task, profile, 'challenge')),
    missionTasks: missionSource.map((task) => enrichTask(task, profile, 'mission')),
    reviewPendingTasks: reviewPendingSource.map((task) => enrichTask(task, profile, 'collab')),
    pendingConfirmationTasks: pendingConfirmationSource.map((task) => enrichTask(task, profile, 'collab')),
    waitingAcceptTasks: waitingAcceptSource.map((task) => enrichTask(task, profile, 'collab')),
    inProgressCollabTasks: inProgressCollabSource.map((task) => enrichTask(task, profile, 'collab')),
    collabTasks: inProgressCollabSource.map((task) => enrichTask(task, profile, 'collab')),
    historyTasks: historySource.map((task) => enrichTask(task, profile, 'history')),
    archiveTasks: completedRaw.map((archive) => enrichArchive(archive)),
  }
}

Page({
  data: {
    strings,
    loading: false,
    actionLoading: '',
    refreshing: false,
    heroCollapsed: false,
    errorCollapsed: false,
    tabAnimation: null,
    pendingOpenTaskId: '',
    profile: {
      userId: '',
      nickname: '',
      wisdom: 0,
      strength: 0,
      agility: 0,
    },
    dashboard: {
      summary: {
        totalOpen: 0,
      },
    },
    view: {
      todayTasks: [],
      challengeTasks: [],
      missionTasks: [],
      collabTasks: [],
      reviewPendingTasks: [],
      pendingConfirmationTasks: [],
      waitingAcceptTasks: [],
      inProgressCollabTasks: [],
      historyTasks: [],
      archiveTasks: [],
    },
    error: '',
    activeTab: 'home',
    onboarding: buildOnboardingState(),
    detailVisible: false,
    detailMounted: false,
    detailClosing: false,
    createModalVisible: false,
    createModalClosing: false,
    selectedTask: null,
    selectedTaskDraftSubtasks: [],
    selectedTaskHasDraftChanges: false,
    profileEditVisible: false,
    subscribeOffsetOptions: SUBSCRIBE_OFFSET_OPTIONS.map((item) => item.label),
    subscribeSettings: buildSubscribeSettingsState(),
    nicknameDraft: '',
    create: buildCreateState(),
    scrollHints: buildScrollHints(),
  },

  onLoad(options) {
    this._scrollMetrics = {}
    const openTaskId = options && options.openTaskId ? String(options.openTaskId) : ''
    if (openTaskId) {
      this.setData({ pendingOpenTaskId: openTaskId })
    }
    void this.refresh()
  },

  onShow() {
    void this.refresh()
  },

  async onPullDownRefresh() {
    this.setData({ refreshing: true })
    try {
      await this.refresh()
    } finally {
      this.setData({ refreshing: false })
    }
  },

  onPageScrollView(event) {
    this.updateScrollHintByEvent('page', event)
  },

  onDetailScroll(event) {
    this.updateScrollHintByEvent('detail', event)
  },

  onCreateScroll(event) {
    this.updateScrollHintByEvent('create', event)
  },

  onProfileScroll(event) {
    this.updateScrollHintByEvent('profile', event)
  },

  onSubscribeScroll(event) {
    this.updateScrollHintByEvent('subscribe', event)
  },

  updateScrollHintByEvent(type, event) {
    const detail = event && event.detail ? event.detail : {}
    const scrollTop = Number(detail.scrollTop || 0)
    const metrics = this._scrollMetrics && this._scrollMetrics[type] ? this._scrollMetrics[type] : {}
    const scrollHeight = Number(detail.scrollHeight || metrics.contentHeight || 0)
    const viewportHeight = Number(detail.clientHeight || detail.height || metrics.containerHeight || 0)
    if (!scrollHeight || !viewportHeight) return
    const threshold = 56
    const canScroll = scrollHeight > viewportHeight + threshold
    const hasMoreBelow = scrollTop + viewportHeight < scrollHeight - threshold
    this.setData({ [`scrollHints.${type}`]: Boolean(canScroll && hasMoreBelow) })
  },

  measureScrollHint(type) {
    const selectors = {
      page: { container: '.page-scroll', content: '.page-scroll-content' },
      detail: { container: '.detail-scroll', content: '.detail-scroll-content' },
      create: { container: '.create-scroll', content: '.create-scroll-content' },
      profile: { container: '.profile-scroll', content: '.profile-scroll-content' },
    }
    const current = selectors[type]
    if (!current) return
    const query = this.createSelectorQuery()
    query.select(current.container).boundingClientRect()
    query.select(current.content).boundingClientRect()
    query.exec((result) => {
      const container = result && result[0]
      const content = result && result[1]
      if (!container || !content) return
      const containerHeight = Number(container.height || 0)
      const contentHeight = Number(content.height || 0)
      this._scrollMetrics = Object.assign({}, this._scrollMetrics, {
        [type]: {
          containerHeight,
          contentHeight,
        },
      })
      const canScroll = contentHeight > containerHeight + 56
      this.setData({ [`scrollHints.${type}`]: Boolean(canScroll) })
    })
  },

  applyDashboard(payload, selectedTaskId, selectedSource) {
    const dashboard = payload || null
    const profile = this.data.profile
    const view = buildDashboardView(dashboard, profile)
    const nextSelected = selectedTaskId ? this.findTaskById(selectedTaskId, dashboard, selectedSource) : null
    this.setData({
      dashboard,
      view,
      selectedTask: nextSelected,
      selectedTaskDraftSubtasks: nextSelected ? cloneSubtasks(nextSelected.subtasks) : [],
      selectedTaskHasDraftChanges: false,
      detailMounted: Boolean(nextSelected && this.data.detailVisible),
      detailClosing: false,
      detailVisible: Boolean(nextSelected && this.data.detailVisible),
    })
  },

  showTaskDetail(task) {
    if (!task) return
    if (this._detailCloseTimer) {
      clearTimeout(this._detailCloseTimer)
      this._detailCloseTimer = null
    }
    if (this._detailOpenTimer) {
      clearTimeout(this._detailOpenTimer)
      this._detailOpenTimer = null
    }
    this.setData({
      detailMounted: true,
      detailClosing: false,
      detailVisible: false,
      selectedTask: task,
      selectedTaskDraftSubtasks: cloneSubtasks(task.subtasks),
      selectedTaskHasDraftChanges: false,
    })
    this._detailOpenTimer = setTimeout(() => {
      this.setData({
        detailVisible: true,
      })
      wx.nextTick(() => this.measureScrollHint('detail'))
      this._detailOpenTimer = null
    }, 16)
  },

  updateSelectedTaskDraft(subtasks) {
    const nextSubtasks = cloneSubtasks(subtasks)
    const original = safeArray(this.data.selectedTask && this.data.selectedTask.subtasks)
    const changed =
      original.length !== nextSubtasks.length ||
      nextSubtasks.some(
        (item, index) => Number(item.current || 0) !== Number((original[index] && original[index].current) || 0)
      )
    this.setData({
      selectedTaskDraftSubtasks: nextSubtasks,
      selectedTaskHasDraftChanges: changed,
    })
  },

  setError(message) {
    this.setData({
      error: message || '',
      errorCollapsed: false,
    })
  },

  clearError() {
    this.setData({
      error: '',
      errorCollapsed: false,
    })
  },

  shouldAutoOpenOnboarding(profile) {
    return Boolean(profile && profile.userId && !(profile.onboarding && profile.onboarding.seen))
  },

  async openPendingSharedTask(taskId, dashboard) {
    const sharedTaskId = String(taskId || '')
    if (!sharedTaskId) return false

    const existing = this.findTaskById(sharedTaskId, dashboard)
    if (existing) {
      this.setData({
        detailMounted: true,
        detailClosing: false,
        detailVisible: true,
        selectedTask: existing,
        selectedTaskDraftSubtasks: cloneSubtasks(existing.subtasks),
        selectedTaskHasDraftChanges: false,
        pendingOpenTaskId: '',
        activeTab: existing.source === 'collab' || existing.source === 'history' ? 'collab' : existing.source === 'archive' ? 'archive' : 'home',
      })
      return true
    }

    try {
      const payload = await require('../../utils/api').getTask(sharedTaskId)
      const sharedTask =
        payload && payload.archive && payload.data
          ? enrichArchive(payload.data)
          : enrichTask(payload, this.data.profile, 'shared')
      this.setData({
        detailMounted: true,
        detailClosing: false,
        detailVisible: true,
        selectedTask: sharedTask,
        selectedTaskDraftSubtasks: cloneSubtasks(sharedTask.subtasks),
        selectedTaskHasDraftChanges: false,
        pendingOpenTaskId: '',
        activeTab: 'home',
      })
      return true
    } catch (error) {
      if (error && error.code === 'FORBIDDEN') {
        const sharedTask = enrichTask(
          {
            _id: sharedTaskId,
            title: strings.share.taskDetailFallback || '分享任务',
            detail: '任务已被接取',
            status: 'in_progress',
            category: 'normal',
            creatorId: '',
            creatorName: '',
            assigneeId: '',
            assigneeName: '',
            dueAt: '',
            subtasks: [],
            attributeReward: { type: 'wisdom', value: 0 },
            createdAt: '',
            updatedAt: '',
            sharedPreviewLocked: true,
          },
          this.data.profile,
          'shared'
        )
        this.setData({
          detailMounted: true,
          detailClosing: false,
          detailVisible: true,
          selectedTask: sharedTask,
          selectedTaskDraftSubtasks: [],
          selectedTaskHasDraftChanges: false,
          pendingOpenTaskId: '',
          activeTab: 'home',
        })
        return true
      }
      this.setData({ pendingOpenTaskId: '' })
      this.setError((error && error.message) || strings.errors.sharedTaskOpenFailed || strings.errors.loadFailed)
      return false
    }
  },

  async refresh() {
    this.setData({ loading: true, actionLoading: '' })
    this.clearError()
    try {
      const payload = await bootstrap()
      getApp().globalData.profile = payload.profile
      const subscribeSettings = buildSubscribeSettingsState(
        payload.profile && payload.profile.subscribeReminderSettings,
        payload.profile && payload.profile.subscribePreferences
      )
      subscribeSettings.visible = Boolean(this.data.subscribeSettings && this.data.subscribeSettings.visible)
      this.setData({
        profile: payload.profile,
        subscribeSettings,
        onboarding: Object.assign({}, this.data.onboarding, {
          visible: this.data.onboarding.visible || this.shouldAutoOpenOnboarding(payload.profile),
        }),
      })
      const currentTaskId = this.data.selectedTask ? this.data.selectedTask._id : ''
      const currentSource = this.data.selectedTask ? this.data.selectedTask.source : ''
      this.applyDashboard(payload.dashboard, currentTaskId, currentSource)
      if (this.data.onboarding.visible) {
        const onboardingStep = Number(this.data.onboarding && this.data.onboarding.step ? this.data.onboarding.step : 0)
        this.applyOnboardingScene(onboardingStep)
        return
      }
      if (this.data.pendingOpenTaskId) {
        await this.openPendingSharedTask(this.data.pendingOpenTaskId, payload.dashboard)
      }
    } catch (error) {
      this.setError(error.message || strings.errors.loadFailed)
    } finally {
      this.setData({ loading: false, actionLoading: '' })
      wx.nextTick(() => {
        this.measureScrollHint('page')
        if (this.data.detailMounted) this.measureScrollHint('detail')
        if (this.data.create && this.data.create.visible) this.measureScrollHint('create')
        if (this.data.profileEditVisible) this.measureScrollHint('profile')
        if (this.data.subscribeSettings && this.data.subscribeSettings.visible) this.measureScrollHint('subscribe')
      })
    }
  },

  findTaskById(taskId, dashboard, preferredSource) {
    if (!taskId || !dashboard) return null
    const view = buildDashboardView(dashboard, this.data.profile)
    const order = preferredSource
      ? [preferredSource, 'today', 'mission', 'collab', 'history', 'challenge', 'archive']
      : ['today', 'mission', 'collab', 'history', 'challenge', 'archive']
    for (let index = 0; index < order.length; index += 1) {
      const source = order[index]
      const listKeys =
        source === 'today'
          ? ['todayTasks']
          : source === 'mission'
            ? ['missionTasks']
            : source === 'collab'
              ? ['reviewPendingTasks', 'pendingConfirmationTasks', 'waitingAcceptTasks', 'inProgressCollabTasks', 'collabTasks']
              : source === 'history'
                ? ['historyTasks']
                : source === 'challenge'
                  ? ['challengeTasks']
                  : ['archiveTasks']
      for (let listIndex = 0; listIndex < listKeys.length; listIndex += 1) {
        const match = safeArray(view[listKeys[listIndex]]).find((item) => String(item._id) === String(taskId))
        if (match) return match
      }
    }
    return null
  },

  isOnboardingActive() {
    return Boolean(this.data.onboarding && this.data.onboarding.visible)
  },

  applyOnboardingScene(step) {
    const nextStep = Math.max(0, Math.min(13, Number(step || 0)))
    const profile = this.data.profile || {}
    const meta = getOnboardingMeta(nextStep)
    const homeView = buildGuideHomeView(profile)
    const collabTask = buildGuideTask(profile, 'collab')
    const missionTask = buildGuideTask(profile, 'mission')
    const archiveTask = buildGuideTask(profile, 'archive')
    const activeTab = getOnboardingTab(nextStep)
    const nextView = {
      todayTasks: clone(homeView.todayTasks),
      challengeTasks: clone(homeView.challengeTasks),
      missionTasks: [],
      collabTasks: [],
      reviewPendingTasks: [],
      pendingConfirmationTasks: [],
      waitingAcceptTasks: [],
      inProgressCollabTasks: [],
      historyTasks: [],
      archiveTasks: [],
    }
    const nextDashboard = {
      summary: {
        totalOpen: nextStep >= 5 && nextStep <= 8 ? 1 : 0,
      },
    }
    const nextCreate = buildGuideCreateState(nextStep)
    const nextSubscribeSettings =
      nextStep === 13
        ? Object.assign(
            buildSubscribeSettingsState(
              profile && profile.subscribeReminderSettings,
              profile && profile.subscribePreferences
            ),
            { visible: true, closing: false }
          )
        : buildSubscribeSettingsState(
            profile && profile.subscribeReminderSettings,
            profile && profile.subscribePreferences
          )
    let selectedTask = null
    let selectedTaskDraftSubtasks = []
    let detailMounted = false
    let detailVisible = false

    if (nextStep >= 5 && nextStep <= 6) {
      nextView.collabTasks = [clone(collabTask)]
    }
    if (nextStep === 6) {
      selectedTask = clone(collabTask)
      selectedTaskDraftSubtasks = cloneSubtasks(selectedTask.subtasks)
      detailMounted = true
      detailVisible = true
    }
    if (nextStep >= 7 && nextStep <= 8) {
      nextView.missionTasks = [clone(missionTask)]
      nextDashboard.summary.totalOpen = 1
    }
    if (nextStep === 8) {
      selectedTask = clone(missionTask)
      selectedTaskDraftSubtasks = cloneSubtasks(selectedTask.subtasks)
      detailMounted = true
      detailVisible = true
    }
    if (nextStep >= 9 && nextStep <= 11) {
      nextView.archiveTasks = [clone(archiveTask)]
    }
    if (nextStep === 10) {
      selectedTask = clone(archiveTask)
      selectedTaskDraftSubtasks = cloneSubtasks(selectedTask.subtasks)
      detailMounted = true
      detailVisible = true
    }

    this.setData({
      activeTab,
      heroCollapsed: false,
      dashboard: nextDashboard,
      view: nextView,
      onboarding: {
        visible: true,
        step: nextStep,
        target: meta.target,
        title: meta.title,
        segments: meta.segments,
        hint: meta.hint || '',
        panelPosition: meta.panelPosition,
        actionDriven: Boolean(meta.actionDriven),
      },
      create: nextCreate,
      createModalVisible: nextStep === 3 || nextStep === 4,
      createModalClosing: false,
      detailMounted,
      detailVisible,
      detailClosing: false,
      selectedTask,
      selectedTaskDraftSubtasks,
      selectedTaskHasDraftChanges: false,
      profileEditVisible: false,
      subscribeSettings: nextSubscribeSettings,
      nicknameDraft: '',
      tabAnimation: null,
    })
    wx.nextTick(() => {
      this.measureScrollHint('page')
      if (detailMounted) this.measureScrollHint('detail')
      if (nextCreate.visible) this.measureScrollHint('create')
      if (nextSubscribeSettings.visible) this.measureScrollHint('subscribe')
    })
  },

  setTab(event) {
    if (this.isOnboardingActive()) return
    const tab = event.currentTarget.dataset.tab || 'home'
    if (tab === this.data.activeTab) return
    const animation = wx.createAnimation({
      duration: 120,
      timingFunction: 'ease-out',
    })

    animation.opacity(0).translateY(10).step()
    this.setData({ tabAnimation: animation.export() })

    if (this._tabSwitchTimer) {
      clearTimeout(this._tabSwitchTimer)
    }

    this._tabSwitchTimer = setTimeout(() => {
      const fadeIn = wx.createAnimation({
        duration: 180,
        timingFunction: 'ease-out',
      })

      this.setData({ activeTab: tab })
      fadeIn.opacity(1).translateY(0).step()
      this.setData({ tabAnimation: fadeIn.export() })
      wx.nextTick(() => this.measureScrollHint('page'))
      this._tabSwitchTimer = null
    }, 120)
  },

  toggleHeroCollapse() {
    this.setData({
      heroCollapsed: !this.data.heroCollapsed,
    })
  },

  toggleErrorCollapse() {
    this.setData({
      errorCollapsed: !this.data.errorCollapsed,
    })
  },

  openProfileEdit() {
    if (this.isOnboardingActive()) return
    this.setData({
      profileEditVisible: true,
      nicknameDraft: (this.data.profile && this.data.profile.nickname) || '',
    })
    wx.nextTick(() => this.measureScrollHint('profile'))
  },

  openOnboarding() {
    if (this.isOnboardingActive()) return
    this.applyOnboardingScene(0)
  },

  openSubscribeSettings() {
    if (this.isOnboardingActive()) return
    if (this._subscribeCloseTimer) {
      clearTimeout(this._subscribeCloseTimer)
      this._subscribeCloseTimer = null
    }
    const subscribeSettings = buildSubscribeSettingsState(
      this.data.profile && this.data.profile.subscribeReminderSettings,
      this.data.profile && this.data.profile.subscribePreferences
    )
    subscribeSettings.visible = true
    subscribeSettings.closing = false
    this.setData({ subscribeSettings })
    wx.nextTick(() => this.measureScrollHint('subscribe'))
  },

  closeSubscribeSettings() {
    if (!(this.data.subscribeSettings && this.data.subscribeSettings.visible)) return
    if (this._subscribeCloseTimer) {
      clearTimeout(this._subscribeCloseTimer)
    }
    this.setData({
      'subscribeSettings.closing': true,
      'scrollHints.subscribe': false,
    })
    this._subscribeCloseTimer = setTimeout(() => {
      this.setData({
        subscribeSettings: buildSubscribeSettingsState(
          this.data.profile && this.data.profile.subscribeReminderSettings,
          this.data.profile && this.data.profile.subscribePreferences
        ),
      })
      this._subscribeCloseTimer = null
    }, 240)
  },

  openTermsPage() {
    wx.navigateTo({ url: '/pages/legal-terms/index' })
  },

  openPrivacyPage() {
    wx.navigateTo({ url: '/pages/legal-privacy/index' })
  },

  nextOnboardingStep() {
    if (!(this.data.onboarding && this.data.onboarding.visible)) return
    const step = Number(this.data.onboarding && this.data.onboarding.step ? this.data.onboarding.step : 0)
    this.applyOnboardingScene(step + 1)
  },

  prevOnboardingStep() {
    if (!(this.data.onboarding && this.data.onboarding.visible)) return
    const step = Number(this.data.onboarding && this.data.onboarding.step ? this.data.onboarding.step : 0)
    this.applyOnboardingScene(step - 1)
  },

  onGuideBackdropTap() {
    const onboarding = this.data.onboarding || {}
    if (!onboarding.visible) return
    if (Number(onboarding.step || 0) >= 13) return
    this.nextOnboardingStep()
  },

  async finishOnboarding() {
    if (this.data.loading) return
    const profile = this.data.profile || {}
    if (profile.onboarding && profile.onboarding.seen) {
      this.setData({ onboarding: buildOnboardingState() })
      await this.refresh()
      return
    }
    this.setData({ loading: true, actionLoading: 'completeOnboarding' })
    try {
      const result = await completeOnboarding()
      this.setData({
        onboarding: buildOnboardingState(),
        profile: Object.assign({}, profile, {
          onboarding: {
            seen: true,
            seenAt: result && result.seenAt ? result.seenAt : '',
          },
        }),
      })
      await this.refresh()
    } catch (error) {
      this.setError((error && error.message) || strings.errors.operationFailed)
    } finally {
      this.setData({ loading: false, actionLoading: '' })
    }
  },

  async skipOnboarding() {
    return this.finishOnboarding()
  },

  onToggleSubscribeCategory(event) {
    const category = String(event.currentTarget.dataset.category || '')
    if (!category) return
    const currentValue =
      this.data.subscribeSettings &&
      this.data.subscribeSettings.categoryEnabled &&
      this.data.subscribeSettings.categoryEnabled[category] !== false
    this.setData({
      [`subscribeSettings.categoryEnabled.${category}`]: !currentValue,
      [`subscribeSettings.statuses.${category}`]: getSubscribeStatusLabel(
        !currentValue,
        getSubscribeSceneStatusForCategory(category, this.data.profile && this.data.profile.subscribePreferences)
      ),
    })
  },

  onSubscribeOffsetChange(event) {
    const reminderId = String(event.currentTarget.dataset.id || '')
    const nextValue = Math.max(0, Math.min(SUBSCRIBE_OFFSET_OPTIONS.length - 1, Number(event.detail && event.detail.value)))
    const nextMinutes = SUBSCRIBE_OFFSET_OPTIONS[nextValue] ? SUBSCRIBE_OFFSET_OPTIONS[nextValue].minutes : SUBSCRIBE_OFFSET_OPTIONS[0].minutes
    const reminders = safeArray(this.data.subscribeSettings && this.data.subscribeSettings.reminders).map((item) =>
      item.id === reminderId
        ? Object.assign({}, item, {
            minutes: nextMinutes,
            optionIndex: nextValue,
            optionLabel: SUBSCRIBE_OFFSET_OPTIONS[nextValue] ? SUBSCRIBE_OFFSET_OPTIONS[nextValue].label : SUBSCRIBE_OFFSET_OPTIONS[0].label,
          })
        : item
    )
    this.setData({ 'subscribeSettings.reminders': reindexSubscribeReminderDrafts(reminders) })
  },

  addSubscribeReminder(event) {
    const direction = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.direction || '') === 'after' ? 'after' : 'before'
    const reminders = safeArray(this.data.subscribeSettings && this.data.subscribeSettings.reminders)
    if (reminders.length >= 8) return
    this.setData({
      'subscribeSettings.reminders': reindexSubscribeReminderDrafts(reminders.concat(buildSubscribeReminderDraft(direction, 30))),
    })
    wx.nextTick(() => this.measureScrollHint('subscribe'))
  },

  removeSubscribeReminder(event) {
    const reminderId = String(event.currentTarget.dataset.id || '')
    const currentReminders = safeArray(this.data.subscribeSettings && this.data.subscribeSettings.reminders)
    const target = currentReminders.find((item) => item.id === reminderId)
    const reminders = currentReminders.filter((item) => item.id !== reminderId)
    const sameDirectionCount = reminders.filter((item) => item.direction === (target && target.direction)).length
    if (target && sameDirectionCount === 0) {
      reminders.push(buildSubscribeReminderDraft(target.direction, target.direction === 'after' ? 60 : 30))
    }
    this.setData({
      'subscribeSettings.reminders': reindexSubscribeReminderDrafts(reminders),
    })
  },

  async saveSubscribeReminderSettings() {
    if (this.data.loading) return
    const reminders = dedupeSubscribeReminders(safeArray(this.data.subscribeSettings && this.data.subscribeSettings.reminders))
      .map((item) => ({
        direction: item.direction === 'after' ? 'after' : item.direction === 'exact' ? 'exact' : 'before',
        minutes: item.direction === 'exact' ? 0 : normalizeSubscribeMinutes(item.minutes),
      }))
      .filter((item) => item.direction === 'exact' || item.minutes > 0)
    const categoryEnabled =
      this.data.subscribeSettings && this.data.subscribeSettings.categoryEnabled
        ? Object.assign({}, this.data.subscribeSettings.categoryEnabled)
        : {}

    if (!reminders.length) {
      this.setError(strings.subscribeSettings.errors.emptyReminder)
      return
    }

    this.setData({ loading: true, actionLoading: 'saveSubscribeSettings' })
    this.clearError()
    try {
      const result = await saveSubscribeSettings({
        reminderSettings: {
          categoryEnabled,
          taskDeadline: reminders,
        },
      })
      const nextProfile = Object.assign({}, this.data.profile || {}, {
        subscribePreferences: result && result.preferences ? result.preferences : (this.data.profile && this.data.profile.subscribePreferences) || {},
        subscribeReminderSettings: result && result.reminderSettings ? result.reminderSettings : { categoryEnabled, taskDeadline: reminders },
      })
      getApp().globalData.profile = nextProfile
      const nextSubscribeSettings = buildSubscribeSettingsState(
        nextProfile.subscribeReminderSettings,
        nextProfile.subscribePreferences
      )
      nextSubscribeSettings.visible = true
      nextSubscribeSettings.closing = false
      this.setData({
        profile: nextProfile,
        subscribeSettings: nextSubscribeSettings,
      })
      wx.showToast({ title: strings.subscribeSettings.saveSuccess, icon: 'none' })
    } catch (error) {
      this.setError((error && error.message) || strings.subscribeSettings.errors.saveFailed)
    } finally {
      this.setData({ loading: false, actionLoading: '' })
    }
  },

  async onRequestSubscribe() {
    if (this.data.loading) return
    await requestTaskSubscribeAuth({ force: true })
    await this.refresh()
    if (this.data.subscribeSettings && this.data.subscribeSettings.visible) {
      const subscribeSettings = buildSubscribeSettingsState(
        this.data.profile && this.data.profile.subscribeReminderSettings,
        this.data.profile && this.data.profile.subscribePreferences
      )
      subscribeSettings.visible = true
      subscribeSettings.closing = false
      this.setData({ subscribeSettings })
      wx.nextTick(() => this.measureScrollHint('subscribe'))
    }
  },

  closeProfileEdit() {
    this.setData({
      profileEditVisible: false,
      nicknameDraft: '',
      'scrollHints.profile': false,
    })
  },

  onNicknameDraftInput(event) {
    this.setData({ nicknameDraft: event.detail.value || '' })
  },

  async saveProfile() {
    if (this.data.loading) return
    const nickname = String(this.data.nicknameDraft || '').trim()
    if (!nickname) {
      this.setError(strings.errors.nicknameRequired)
      return
    }
    this.setData({ loading: true, actionLoading: 'saveProfile' })
    this.clearError()
    try {
      const payload = await updateProfile({ nickname })
      getApp().globalData.profile = payload.profile
      this.setData({
        profile: payload.profile,
        profileEditVisible: false,
        nicknameDraft: '',
      })
      this.applyDashboard(payload.dashboard)
    } catch (error) {
      this.setError(error.message || strings.errors.updateNicknameFailed)
    } finally {
      this.setData({ loading: false, actionLoading: '' })
    }
  },

  openCreateModal() {
    if (this.isOnboardingActive()) {
      if (this.data.onboarding.step === 2) {
        this.applyOnboardingScene(3)
      }
      return
    }
    if (this.data.loading) return
    if (this._createOpenTimer) {
      clearTimeout(this._createOpenTimer)
      this._createOpenTimer = null
    }
    if (this._createCloseTimer) {
      clearTimeout(this._createCloseTimer)
      this._createCloseTimer = null
    }
    this.setData({
      create: Object.assign(buildCreateState(), { visible: true }),
      createModalVisible: false,
      createModalClosing: false,
    })
    this._createOpenTimer = setTimeout(() => {
      this.setData({ createModalVisible: true })
      wx.nextTick(() => this.measureScrollHint('create'))
      this._createOpenTimer = null
    }, 16)
  },

  startReworkFromSelectedTask() {
    if (this.data.loading) return
    const task = this.data.selectedTask
    if (!task || task.isArchive) return
    if (this._createOpenTimer) {
      clearTimeout(this._createOpenTimer)
      this._createOpenTimer = null
    }
    if (this._createCloseTimer) {
      clearTimeout(this._createCloseTimer)
      this._createCloseTimer = null
    }
    this.setData({
      create: {
        visible: true,
        mode: 'rework',
        reworkTaskId: task._id,
        confirmDeletePrevious: false,
        aiPrompt: '',
        title: task.title || '',
        detail: task.detail || '',
        dateValue: formatDateInput(task.dueAt),
        timeValue: formatTimeInput(task.dueAt),
        rewardType: task.attributeReward && task.attributeReward.type ? task.attributeReward.type : 'wisdom',
        rewardValue: 1,
        offlineRewardPromise: task.offlineRewardPromise || '',
        selfAssign: false,
        subtasks:
          safeArray(task.subtasks).length > 0
            ? task.subtasks.map((item) => ({ title: item.title || '', total: Number(item.total || 1) }))
            : [{ title: '', total: 1 }],
      },
      createModalVisible: false,
      createModalClosing: false,
      detailVisible: false,
    })
    this._createOpenTimer = setTimeout(() => {
      this.setData({ createModalVisible: true })
      wx.nextTick(() => this.measureScrollHint('create'))
      this._createOpenTimer = null
    }, 16)
  },

  closeCreateModal() {
    if (this.isOnboardingActive()) return
    if (!this.data.create.visible) return
    if (this._createOpenTimer) {
      clearTimeout(this._createOpenTimer)
      this._createOpenTimer = null
    }
    if (this._createCloseTimer) {
      clearTimeout(this._createCloseTimer)
    }
    this.setData({
      createModalVisible: false,
      createModalClosing: true,
      'scrollHints.create': false,
    })
    this._createCloseTimer = setTimeout(() => {
      this.setData({
        create: buildCreateState(),
        createModalVisible: false,
        createModalClosing: false,
      })
      this._createCloseTimer = null
    }, 260)
  },

  onAiPromptInput(event) {
    this.setData({ 'create.aiPrompt': event.detail.value || '' })
  },

  onCreateTitleInput(event) {
    this.setData({ 'create.title': event.detail.value || '' })
  },

  onCreateDetailInput(event) {
    this.setData({ 'create.detail': event.detail.value || '' })
  },

  onCreateDateChange(event) {
    this.setData({ 'create.dateValue': event.detail.value })
  },

  onCreateTimeChange(event) {
    this.setData({ 'create.timeValue': event.detail.value })
  },

  onRewardTypeChange(event) {
    this.setData({ 'create.rewardType': event.currentTarget.dataset.type || 'wisdom' })
  },

  onOfflineRewardPromiseInput(event) {
    this.setData({ 'create.offlineRewardPromise': event.detail.value || '' })
  },

  onSelfAssignChange(event) {
    this.setData({ 'create.selfAssign': Boolean(event.detail.value && event.detail.value.length) })
  },

  onSubtaskTitleInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const subtasks = clone(this.data.create.subtasks)
    subtasks[index].title = event.detail.value || ''
    this.setData({ 'create.subtasks': subtasks })
  },

  onSubtaskTotalInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const subtasks = clone(this.data.create.subtasks)
    subtasks[index].total = Math.max(1, Number(event.detail.value || 1))
    this.setData({ 'create.subtasks': subtasks })
  },

  addSubtask() {
    if (this.data.loading) return
    this.setData({
      'create.subtasks': this.data.create.subtasks.concat([{ title: '', total: 1 }]),
    })
    wx.nextTick(() => this.measureScrollHint('create'))
  },

  removeSubtask(event) {
    if (this.data.loading) return
    if (this.data.create.subtasks.length <= 1) return
    const index = Number(event.currentTarget.dataset.index)
    this.setData({
      'create.subtasks': this.data.create.subtasks.filter((_, current) => current !== index),
    })
    wx.nextTick(() => this.measureScrollHint('create'))
  },

  async onGenerateCreateDraft() {
    if (this.isOnboardingActive()) {
      if (this.data.onboarding.step === 3) {
        this.applyOnboardingScene(4)
      }
      return
    }
    if (this.data.loading) return
    const prompt = String(this.data.create.aiPrompt || '').trim()
    if (!prompt) {
      this.setError(strings.errors.aiPromptRequired)
      return
    }
    this.setData({ loading: true, actionLoading: 'generateCreateDraft' })
    this.clearError()
    try {
      const suggestion = await generateTaskByAI(
        Object.assign(
          {
            prompt,
          },
          getClientTimeContext()
        )
      )
      const extractedOfflineRewardPromise = extractOfflineRewardPromiseFromPrompt(prompt)
      this.setData({
        'create.title': suggestion.title || '',
        'create.detail': suggestion.description || '',
        'create.rewardType':
          suggestion.attributeReward && suggestion.attributeReward.type ? suggestion.attributeReward.type : 'wisdom',
        'create.rewardValue': 1,
        'create.offlineRewardPromise': suggestion.offlineRewardPromise || extractedOfflineRewardPromise || this.data.create.offlineRewardPromise || '',
        'create.subtasks':
          safeArray(suggestion.subtasks).length > 0
            ? suggestion.subtasks.map((item) => ({ title: item.title || '', total: Number(item.total || 1) }))
            : this.data.create.subtasks,
        'create.dateValue': suggestion.dueAt ? formatDateInput(suggestion.dueAt) : this.data.create.dateValue,
        'create.timeValue': suggestion.dueAt ? formatTimeInput(suggestion.dueAt) : this.data.create.timeValue,
      })
      wx.nextTick(() => this.measureScrollHint('create'))
    } catch (error) {
      this.setError(error.message || strings.errors.aiGenerateFailed)
    } finally {
      this.setData({ loading: false, actionLoading: '' })
    }
  },

  async submitCreateTask() {
    if (this.isOnboardingActive()) {
      if (this.data.onboarding.step === 4) {
        this.applyOnboardingScene(5)
      }
      return
    }
    if (this.data.loading) return
    const payload = this.data.create
    const title = String(payload.title || '').trim()
    const detail = String(payload.detail || '').trim()
    const subtasks = payload.subtasks
      .map((item) => ({ title: String(item.title || '').trim(), total: Number(item.total || 1) }))
      .filter((item) => item.title)

    if (!title) {
      this.setError(strings.errors.titleRequired)
      return
    }
    if (!subtasks.length) {
      this.setError(strings.errors.subtaskRequired)
      return
    }

    const offlineRewardPromise = String(payload.offlineRewardPromise || '').trim()
    if (payload.mode !== 'rework' && offlineRewardPromise) {
      const confirmReward = await wx.showModal({
        title: '线下奖励提醒',
        content: '任务有承诺的线下奖励，发起者需自行按照承诺给实施者对应奖励。',
        confirmText: '同意',
        cancelText: '拒绝',
      })
      if (!confirmReward.confirm) return
    }

    this.setData({ loading: true, actionLoading: 'submitCreateTask' })
    this.clearError()
    try {
      const requestPayload = {
        title,
        detail,
        dueAt: buildDueAt(payload.dateValue, payload.timeValue),
        subtasks,
        attributeReward: {
          type: payload.rewardType,
          value: 1,
        },
        offlineRewardPromise,
        selfAssign: payload.selfAssign,
      }
      const result =
        payload.mode === 'rework'
          ? await operateTask(
              'reworkTask',
              Object.assign({}, requestPayload, {
                taskId: payload.reworkTaskId,
                clientUpdatedAt: this.data.selectedTask && this.data.selectedTask.updatedAt ? this.data.selectedTask.updatedAt : '',
                confirmDeletePrevious: payload.confirmDeletePrevious,
              })
            )
          : await createTask(requestPayload)

      if (result && result.message === 'no changes' && result.task) {
        await this.refresh()
        const selectedTask = this.findTaskById(result.task._id, this.data.dashboard, 'collab')
        this.setData({
          create: buildCreateState(),
          detailVisible: true,
          selectedTask,
          selectedTaskDraftSubtasks: cloneSubtasks((selectedTask || {}).subtasks),
          selectedTaskHasDraftChanges: false,
          activeTab: 'collab',
        })
        return
      }

      const created = result && result.task ? result.task : result
      await this.refresh()
      const nextSource = payload.mode === 'rework' ? 'collab' : payload.selfAssign ? 'mission' : 'collab'
      const selectedTask = this.findTaskById(created._id, this.data.dashboard, nextSource)
      this.setData({
        create: buildCreateState(),
        detailVisible: true,
        selectedTask,
        selectedTaskDraftSubtasks: cloneSubtasks((selectedTask || {}).subtasks),
        selectedTaskHasDraftChanges: false,
        activeTab: nextSource,
      })
    } catch (error) {
      if (error && error.code === 'REWORK_CONFIRM_REQUIRED') {
        const result = await wx.showModal({
          title: strings.dialogs.reworkConfirmTitle,
          content: strings.dialogs.reworkConfirmContent,
          confirmText: strings.dialogs.confirmContinue,
          cancelText: strings.dialogs.confirmCancel,
        })
        if (result.confirm) {
          this.setData({ 'create.confirmDeletePrevious': true })
          this.setData({ loading: false, actionLoading: '' })
          await this.submitCreateTask()
          return
        }
      }
      this.setError(error.message || strings.errors.saveTaskFailed)
    } finally {
      this.setData({ loading: false, actionLoading: '' })
    }
  },

  openTask(event) {
    if (this.isOnboardingActive()) {
      const taskId = String(event.currentTarget.dataset.taskId || '')
      const source = event.currentTarget.dataset.source || ''
      const step = Number(this.data.onboarding.step || 0)
      if (step === 5 && source === 'collab' && taskId === GUIDE_IDS.collab) {
        this.applyOnboardingScene(6)
      } else if (step === 7 && source === 'mission' && taskId === GUIDE_IDS.mission) {
        this.applyOnboardingScene(8)
      } else if (step === 9 && source === 'archive' && taskId === GUIDE_IDS.archive) {
        this.applyOnboardingScene(10)
      }
      return
    }
    const taskId = event.currentTarget.dataset.taskId
    const source = event.currentTarget.dataset.source || ''
    const task = this.findTaskById(taskId, this.data.dashboard, source)
    if (!task) return
    this.showTaskDetail(task)
  },

  openHistory(event) {
    const taskId = event.currentTarget.dataset.taskId
    const task = this.findTaskById(taskId, this.data.dashboard, 'history')
    if (!task) return
    this.showTaskDetail(task)
  },

  openPreviousVersion(event) {
    const taskId = event.currentTarget.dataset.taskId
    const task = this.findTaskById(taskId, this.data.dashboard, 'history')
    if (!task) {
      this.setError(strings.errors.previousVersionNotFound)
      return
    }
    this.showTaskDetail(task)
  },

  openCurrentVersion() {
    const selectedTask = this.data.selectedTask
    if (!selectedTask || !selectedTask.isHistory) return
    const dashboard = this.data.dashboard || {}
    const view = buildDashboardView(dashboard, this.data.profile)
    const candidates = []
      .concat(safeArray(view.historyTasks))
      .concat(safeArray(view.reviewPendingTasks))
      .concat(safeArray(view.pendingConfirmationTasks))
      .concat(safeArray(view.waitingAcceptTasks))
      .concat(safeArray(view.inProgressCollabTasks))
      .concat(safeArray(view.missionTasks))
      .concat(safeArray(view.collabTasks))
      .concat(safeArray(view.challengeTasks))
      .concat(safeArray(view.todayTasks))
      .concat(safeArray(view.archiveTasks))
    const currentTask = candidates.find((item) => String(item.previousTaskId || '') === String(selectedTask._id))
    if (!currentTask) {
      this.setError('未找到当前任务')
      return
    }
    this.showTaskDetail(currentTask)
  },

  closeTaskModal() {
    if (this.isOnboardingActive()) return
    if (!this.data.detailMounted) return
    if (this._detailOpenTimer) {
      clearTimeout(this._detailOpenTimer)
      this._detailOpenTimer = null
    }
    if (this._detailCloseTimer) {
      clearTimeout(this._detailCloseTimer)
    }
    this.setData({
      detailVisible: false,
      detailClosing: true,
    })
    this._detailCloseTimer = setTimeout(() => {
      this.setData({
        detailMounted: false,
        detailClosing: false,
        selectedTask: null,
        selectedTaskDraftSubtasks: [],
        selectedTaskHasDraftChanges: false,
        'scrollHints.detail': false,
      })
      this._detailCloseTimer = null
    }, 280)
  },

  noop() {},

  async onAcceptChallenge(event) {
    if (this.data.loading) return
    const seedKey = event.currentTarget.dataset.seedKey
    if (!seedKey) return
    this.setData({ loading: true, actionLoading: 'acceptChallenge' })
    this.clearError()
    try {
      const task = await acceptChallengeTask(seedKey)
      await this.refresh()
      const selectedTask = this.findTaskById(task._id, this.data.dashboard, 'mission')
      this.showTaskDetail(selectedTask)
      this.setData({ activeTab: 'mission' })
    } catch (error) {
      this.setError(error.message || strings.errors.acceptChallengeFailed)
    } finally {
      this.setData({ loading: false, actionLoading: '' })
    }
  },

  async runTaskOperation(operation, extraPayload, loadingKey) {
    if (this.data.loading) return
    const task = this.data.selectedTask
    if (!task) return
    this.setData({ loading: true, actionLoading: loadingKey || operation || '' })
    this.clearError()
    try {
      const result = await operateTask(
        operation,
        Object.assign(
          {
            taskId: task.isArchive ? task.archiveId : task._id,
            clientUpdatedAt: task.updatedAt || '',
          },
          extraPayload || {}
        )
      )
      await this.refresh()
      if (result && result._id) {
        const source = task.isArchive ? 'archive' : task.source
        const refreshed = this.findTaskById(result._id, this.data.dashboard, source) || this.findTaskById(task._id, this.data.dashboard, source)
        this.setData({
          detailMounted: Boolean(refreshed),
          detailClosing: false,
          selectedTask: refreshed || null,
          selectedTaskDraftSubtasks: refreshed ? cloneSubtasks(refreshed.subtasks) : [],
          selectedTaskHasDraftChanges: false,
          detailVisible: Boolean(refreshed),
        })
        wx.nextTick(() => {
          if (refreshed) this.measureScrollHint('detail')
        })
      } else if (result && result.ok) {
        const refreshed = this.findTaskById(task._id, this.data.dashboard, task.source)
        this.setData({
          detailMounted: Boolean(refreshed),
          detailClosing: false,
          selectedTask: refreshed || null,
          selectedTaskDraftSubtasks: refreshed ? cloneSubtasks(refreshed.subtasks) : [],
          selectedTaskHasDraftChanges: false,
          detailVisible: Boolean(refreshed),
        })
        wx.nextTick(() => {
          if (refreshed) this.measureScrollHint('detail')
        })
      }
    } catch (error) {
      if (error && error.code === 'CONFLICT_REFRESH' && error.detail && error.detail.dashboard) {
        const payload = error.detail.dashboard
        this.applyDashboard(payload, task._id, task.source)
        this.setError(strings.errors.taskUpdated)
      } else {
        this.setError(error.message || strings.errors.operationFailed)
      }
    } finally {
      this.setData({ loading: false, actionLoading: '' })
    }
  },

  async confirmAndRun(event) {
    if (this.isOnboardingActive()) {
      const step = Number(this.data.onboarding.step || 0)
      const operation = event.currentTarget.dataset.operation
      if (step === 10 && operation === 'deleteTask') {
        this.applyOnboardingScene(11)
      }
      return
    }
    if (this.data.loading) return
    const operation = event.currentTarget.dataset.operation
    const title = event.currentTarget.dataset.title || strings.dialogs.confirmOperationTitle
    const content = event.currentTarget.dataset.content || strings.dialogs.confirmOperationContent
    if (!operation) return
    const result = await wx.showModal({
      title,
      content,
      confirmText: strings.dialogs.confirmContinue,
      cancelText: strings.dialogs.confirmCancel,
    })
    if (!result.confirm) return
    return this.runTaskOperation(operation, null, operation)
  },

  onAcceptTask() {
    if (this.isOnboardingActive()) {
      if (this.data.onboarding.step === 6) {
        this.applyOnboardingScene(7)
      }
      return
    }
    return this.runTaskOperation('acceptTask', null, 'acceptTask')
  },

  onSubmitReview() {
    if (this.data.loading) return
    wx.showModal({
      title: '提交检视',
      content: '是否已经完成全部任务，并准备提交检视？',
      confirmText: strings.dialogs.confirmContinue,
      cancelText: strings.dialogs.confirmCancel,
    }).then((result) => {
      if (!result.confirm) return null
      return this.runTaskOperation('submitReview', null, 'submitReview')
    }).catch(() => null)
  },

  onContinueReview() {
    return this.runTaskOperation('continueReview', null, 'continueReview')
  },

  onCompleteTask() {
    if (this.isOnboardingActive()) {
      if (this.data.onboarding.step === 8) {
        this.applyOnboardingScene(9)
      }
      return
    }
    return this.runTaskOperation('completeTask', null, 'completeTask')
  },

  onAbandonTask() {
    return this.runTaskOperation('abandonTask', null, 'abandonTask')
  },

  onCloseTask() {
    return this.runTaskOperation('closeTask', null, 'closeTask')
  },

  onRestartTask() {
    return this.runTaskOperation('restartTask', null, 'restartTask')
  },

  onRefreshTaskSchedule() {
    return this.runTaskOperation('refreshTaskSchedule', null, 'refreshTaskSchedule')
  },

  onDeleteTask() {
    return this.runTaskOperation('deleteTask', null, 'deleteTask')
  },

  onAcceptReworkTask() {
    return this.runTaskOperation('acceptReworkTask', null, 'acceptReworkTask')
  },

  onRejectReworkTask() {
    return this.runTaskOperation('rejectReworkTask', null, 'rejectReworkTask')
  },

  onCancelReworkTask() {
    return this.runTaskOperation('cancelReworkTask', null, 'cancelReworkTask')
  },

  updateProgressDraftByRatio(index, ratio, commit) {
    const subtasks = clone(this.data.selectedTaskDraftSubtasks || [])
    if (!subtasks[index]) return
    const total = Math.max(1, Number(subtasks[index].total || 1))
    const safeRatio = Math.max(0, Math.min(1, Number(ratio || 0)))
    const snappedCurrent = Math.max(0, Math.min(total, Math.round(safeRatio * total)))
    subtasks[index].previewCurrent = snappedCurrent
    subtasks[index].previewPercent = safeRatio * 100
    if (commit) {
      subtasks[index].current = snappedCurrent
      subtasks[index].sliderValue = total > 0 ? Math.round((snappedCurrent / total) * 1000) : 0
      subtasks[index].previewPercent = total > 0 ? (snappedCurrent / total) * 100 : 0
      this.updateSelectedTaskDraft(subtasks)
      return
    }
    subtasks[index].sliderValue = Math.round(safeRatio * 1000)
    this.setData({
      selectedTaskDraftSubtasks: subtasks,
    })
  },

  getProgressRatioFromTouch(index, pageX, callback) {
    const query = this.createSelectorQuery()
    query.select(`#progress-track-${index}`).boundingClientRect()
    query.exec((result) => {
      const rect = result && result[0]
      if (!rect || !rect.width) return
      const ratio = (Number(pageX || 0) - rect.left) / rect.width
      callback(Math.max(0, Math.min(1, ratio)))
    })
  },

  onProgressTrackTap(event) {
    const index = Number(event.currentTarget.dataset.index)
    const touch = event.changedTouches && event.changedTouches[0]
    if (!touch) return
    this.getProgressRatioFromTouch(index, touch.pageX, (ratio) => {
      this.updateProgressDraftByRatio(index, ratio, true)
    })
  },

  onProgressTrackTouchStart(event) {
    const index = Number(event.currentTarget.dataset.index)
    const touch = event.touches && event.touches[0]
    if (!touch) return
    this.getProgressRatioFromTouch(index, touch.pageX, (ratio) => {
      this.updateProgressDraftByRatio(index, ratio, false)
    })
  },

  onProgressTrackTouchMove(event) {
    const index = Number(event.currentTarget.dataset.index)
    const touch = event.touches && event.touches[0]
    if (!touch) return
    this.getProgressRatioFromTouch(index, touch.pageX, (ratio) => {
      this.updateProgressDraftByRatio(index, ratio, false)
    })
  },

  onProgressTrackTouchEnd(event) {
    const index = Number(event.currentTarget.dataset.index)
    const touch =
      (event.changedTouches && event.changedTouches[0]) ||
      (event.touches && event.touches[0])
    if (!touch) return
    this.getProgressRatioFromTouch(index, touch.pageX, (ratio) => {
      this.updateProgressDraftByRatio(index, ratio, true)
    })
  },

  onProgressTrackTouchCancel() {},

  hasProgressChanges() {
    const original = safeArray(this.data.selectedTask && this.data.selectedTask.subtasks)
    const draft = safeArray(this.data.selectedTaskDraftSubtasks)
    if (original.length !== draft.length) return true
    for (let index = 0; index < draft.length; index += 1) {
      if (Number((original[index] && original[index].current) || 0) !== Number(draft[index].current || 0)) {
        return true
      }
    }
    return false
  },

  onResetDraftProgress() {
    this.updateSelectedTaskDraft((this.data.selectedTask && this.data.selectedTask.subtasks) || [])
  },

  async onApplyProgress() {
    if (this.data.loading) return
    const task = this.data.selectedTask
    if (!task || !this.hasProgressChanges()) return
    const original = safeArray(task.subtasks)
    const draft = safeArray(this.data.selectedTaskDraftSubtasks)
    let latestUpdatedAt = task.updatedAt || ''
    this.setData({ loading: true, actionLoading: 'applyProgress' })
    this.clearError()
    try {
      for (let index = 0; index < draft.length; index += 1) {
        if (Number((original[index] && original[index].current) || 0) === Number(draft[index].current || 0)) {
          continue
        }
        const updatedTask = await operateTask('updateProgress', {
          taskId: task._id,
          clientUpdatedAt: latestUpdatedAt,
          subtaskIndex: index,
          current: Number(draft[index].current || 0),
        })
        latestUpdatedAt = updatedTask && updatedTask.updatedAt ? updatedTask.updatedAt : latestUpdatedAt
      }
      await this.refresh()
      const refreshed = this.findTaskById(task._id, this.data.dashboard, task.source)
      this.setData({
        detailMounted: Boolean(refreshed),
        detailClosing: false,
        selectedTask: refreshed || null,
        selectedTaskDraftSubtasks: refreshed ? cloneSubtasks(refreshed.subtasks) : [],
        selectedTaskHasDraftChanges: false,
        detailVisible: Boolean(refreshed),
      })
      wx.nextTick(() => {
        if (refreshed) this.measureScrollHint('detail')
      })
    } catch (error) {
      if (error && error.code === 'CONFLICT_REFRESH' && error.detail && error.detail.dashboard) {
        this.applyDashboard(error.detail.dashboard, task._id, task.source)
        this.setError(strings.errors.taskUpdated)
      } else {
        this.setError((error && error.message) || strings.errors.progressUpdateFailed)
      }
    } finally {
      this.setData({ loading: false, actionLoading: '' })
    }
  },

  onShareAppMessage(event) {
    const dataset = event && event.target && event.target.dataset ? event.target.dataset : {}
    const taskId = dataset.taskid || (this.data.selectedTask && this.data.selectedTask._id) || ''
    const taskTitle = dataset.tasktitle || (this.data.selectedTask && this.data.selectedTask.title) || strings.share.taskDetailFallback

    if (taskId) {
      return {
        title: taskTitle,
        path: `/pages/home/index?openTaskId=${encodeURIComponent(taskId)}`,
      }
    }

    return {
      title: strings.common.appName,
      path: '/pages/home/index',
    }
  },
})
