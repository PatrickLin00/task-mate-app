const { bootstrap, createTask, generateTaskByAI, operateTask, acceptChallengeTask, updateProfile, completeOnboarding } = require('../../utils/api')
const { formatDateTime, formatDateInput, formatTimeInput, statusLabel, rewardLabel } = require('../../utils/format')
const { requestTaskSubscribeAuth } = require('../../utils/subscribe')
const { saveSubscribeSettings } = require('../../utils/api')
const strings = require('../../config/strings')
const homeRuntime = strings.homeRuntime || {}
const guideStrings = homeRuntime.guide || {}
const offlineRewardStrings = homeRuntime.offlineReward || {}

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
    dailyTask: false,
  }
}

function buildDailyTaskPresetDraft(preset, index) {
  const source = preset && typeof preset === 'object' ? preset : {}
  return {
    id: String(source.id || `daily_preset_${index + 1}`),
    aiPrompt: String(source.aiPrompt || ''),
    title: String(source.title || '').trim(),
    detail: String(source.detail || '').trim(),
    dueTime: String(source.dueTime || '23:59').trim() || '23:59',
    rewardType: ['wisdom', 'strength', 'agility'].includes(String(source.rewardType || '')) ? String(source.rewardType) : 'agility',
    autoAccept: Boolean(source.autoAccept),
    autoAcceptTime: String(source.autoAcceptTime || '06:00').trim() || '06:00',
    subtasks:
      safeArray(source.subtasks).length > 0
        ? safeArray(source.subtasks).map((item) => ({ title: String(item.title || ''), total: Math.max(1, Number(item.total || 1)) }))
        : [{ title: '', total: 1 }],
  }
}

function buildDailyTaskEditorState(presets) {
  const source = safeArray(presets)
  return {
    editMode: false,
    panelMounted: false,
    panelVisible: false,
    expandedIndex: -1,
    openingIndex: -1,
    closingIndex: -1,
    deletingIndex: -1,
    presets: source.map((item, index) => buildDailyTaskPresetDraft(item, index)),
    savedPresets: source.map((item, index) => buildDailyTaskPresetDraft(item, index)),
  }
}

function serializeDailyTaskPresetForSave(preset, index) {
  return {
    id: String(preset && preset.id ? preset.id : `daily_preset_${index + 1}`),
    title: String(preset && preset.title ? preset.title : '').trim(),
    detail: String(preset && preset.detail ? preset.detail : '').trim(),
    dueTime: String(preset && preset.dueTime ? preset.dueTime : '23:59').trim() || '23:59',
    rewardType: preset && preset.rewardType ? preset.rewardType : 'agility',
    autoAccept: Boolean(preset && preset.autoAccept),
    autoAcceptTime: String(preset && preset.autoAcceptTime ? preset.autoAcceptTime : '06:00').trim() || '06:00',
    subtasks: safeArray(preset && preset.subtasks)
      .map((item) => ({ title: String(item.title || '').trim(), total: 1 }))
      .filter((item) => item.title),
  }
}

function buildDailyTaskPresetsForSingleSave(editor, targetIndex) {
  const currentPresets = safeArray(editor && editor.presets)
  const savedPresets = safeArray(editor && editor.savedPresets)
  const nextPresets = savedPresets.map((preset, index) => serializeDailyTaskPresetForSave(preset, index))
  const currentPreset = currentPresets[targetIndex]
  if (!currentPreset) return nextPresets
  nextPresets[targetIndex] = serializeDailyTaskPresetForSave(currentPreset, targetIndex)
  return nextPresets
}

function buildTaskFlyState() {
  return {
    visible: false,
    title: '',
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    scale: 1,
    opacity: 1,
    targetTab: '',
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

function getNextSubscribeReminderMinutes(reminders, direction) {
  const targetDirection = direction === 'after' ? 'after' : direction === 'exact' ? 'exact' : 'before'
  if (targetDirection === 'exact') return 0
  const used = new Set(
    safeArray(reminders)
      .filter((item) => {
        const itemDirection = item && item.direction === 'after' ? 'after' : item && item.direction === 'exact' ? 'exact' : 'before'
        return itemDirection === targetDirection
      })
      .map((item) => normalizeSubscribeMinutes(item && item.minutes ? item.minutes : 0))
  )
  for (let index = 0; index < SUBSCRIBE_OFFSET_OPTIONS.length; index += 1) {
    const option = SUBSCRIBE_OFFSET_OPTIONS[index]
    if (option && !used.has(option.minutes)) return option.minutes
  }
  return targetDirection === 'after' ? 60 : 30
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
      dailyTaskAutoAccept: categoryEnabledSource.dailyTaskAutoAccept !== false,
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
  const sceneKey = category === 'work' || category === 'dailyTaskAutoAccept' ? 'work' : category === 'taskUpdate' || category === 'review' ? category : 'todo'
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
    panelVisible: false,
    closing: false,
    categoryEnabled: Object.assign({}, normalized.categoryEnabled),
    statuses: {
      taskDeadlineExact: getSubscribeStatusLabel(normalized.categoryEnabled.taskDeadlineExact, todoStatus),
      taskDeadlineBefore: getSubscribeStatusLabel(normalized.categoryEnabled.taskDeadlineBefore, todoStatus),
      taskDeadlineAfter: getSubscribeStatusLabel(normalized.categoryEnabled.taskDeadlineAfter, todoStatus),
      work: getSubscribeStatusLabel(normalized.categoryEnabled.work, workStatus),
      dailyTaskAutoAccept: getSubscribeStatusLabel(normalized.categoryEnabled.dailyTaskAutoAccept, workStatus),
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
  const nickname = profile && profile.nickname ? profile.nickname : guideStrings.nicknameFallback
  const dueAt = new Date('2026-03-18T21:00:00+08:00').toISOString()
  const base = {
    _id: mode === 'archive' ? GUIDE_IDS.archive : mode === 'mission' ? GUIDE_IDS.mission : GUIDE_IDS.collab,
    title: guideStrings.taskTitle,
    detail: guideStrings.taskDetail,
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
      { title: guideStrings.subtaskDesk, total: 1, current: mode === 'collab' ? 0 : 1 },
      { title: guideStrings.subtaskBox, total: 1, current: mode === 'collab' ? 0 : 1 },
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
      title: guideStrings.todayTitle,
      detail: guideStrings.todayDetail,
      status: 'in_progress',
      category: 'normal',
      creatorId: profile.userId || 'guide-user',
      creatorName: profile.nickname || guideStrings.nicknameFallback,
      assigneeId: profile.userId || 'guide-user',
      assigneeName: profile.nickname || guideStrings.nicknameFallback,
      dueAt: new Date('2026-03-16T21:00:00+08:00').toISOString(),
      startAt: new Date('2026-03-16T18:00:00+08:00').toISOString(),
      attributeReward: { type: 'wisdom', value: 1 },
      subtasks: [{ title: guideStrings.todaySubtask, total: 1, current: 0 }],
      createdAt: new Date('2026-03-16T18:00:00+08:00').toISOString(),
      updatedAt: new Date('2026-03-16T18:00:00+08:00').toISOString(),
    },
    profile,
    'today'
  )
  const challengeTask = enrichTask(
    {
      _id: 'guide-challenge-task',
      title: guideStrings.challengeTitle,
      detail: guideStrings.challengeDetail,
      status: 'pending',
      category: 'challenge',
      creatorId: `sys:${profile.userId || 'guide-user'}`,
      creatorName: guideStrings.systemName,
      assigneeId: '',
      assigneeName: '',
      dueAt: new Date('2026-03-16T23:59:00+08:00').toISOString(),
      startAt: new Date('2026-03-16T00:00:00+08:00').toISOString(),
      attributeReward: { type: 'agility', value: 1 },
      subtasks: [{ title: guideStrings.challengeSubtask, total: 1, current: 0 }],
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
    aiPrompt: guideStrings.aiPrompt,
  })
  if (step === 4) {
    create.title = guideStrings.taskTitle
    create.detail = guideStrings.createDetail
    create.rewardType = 'agility'
    create.subtasks = [
      { title: guideStrings.subtaskDesk, total: 1 },
      { title: guideStrings.subtaskBox, total: 1 },
    ]
  }
  return create
}

function getOnboardingMeta(step) {
  if (step >= 0 && step < safeArray(guideStrings.steps).length) {
    return guideStrings.steps[step]
  }
  switch (step) {
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
  const patterns = safeArray(offlineRewardStrings.patternSources).map((pattern) => new RegExp(pattern))
  const cleanupPattern = new RegExp(String(offlineRewardStrings.cleanupSource || ''), 'u')
  const trimPattern = new RegExp(String(offlineRewardStrings.trimSource || ''), 'u')
  for (let index = 0; index < patterns.length; index += 1) {
    const matched = source.match(patterns[index])
    if (!matched) continue
    const value = String(matched[1] || '')
      .replace(cleanupPattern, '')
      .replace(trimPattern, '')
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
  return `${homeRuntime.overdue.prefix}${diffDays}${homeRuntime.overdue.suffix}`
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
    dailyTaskEditor: buildDailyTaskEditorState(),
    nicknameDraft: '',
    create: buildCreateState(),
    scrollHints: buildScrollHints(),
    taskFly: buildTaskFlyState(),
    tabPulseTab: '',
    pendingChallengeAcceptSeedKeys: [],
    pendingChallengeAcceptMap: {},
  },

  onLoad(options) {
    this._scrollMetrics = {}
    this._acceptChallengeQueue = []
    this._processingAcceptChallenge = false
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

  onDailyTaskScroll(event) {
    this.updateScrollHintByEvent('dailyTask', event)
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
      dailyTask: { container: '.daily-task-scroll', content: '.daily-task-scroll-content' },
      subscribe: { container: '.subscribe-scroll', content: '.subscribe-scroll-content' },
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

  measureElementRect(selector) {
    return new Promise((resolve) => {
      const query = this.createSelectorQuery()
      query.select(selector).boundingClientRect()
      query.exec((result) => {
        resolve(result && result[0] ? result[0] : null)
      })
    })
  },

  dismissTransientPanels() {
    if (this._detailOpenTimer) {
      clearTimeout(this._detailOpenTimer)
      this._detailOpenTimer = null
    }
    if (this._detailCloseTimer) {
      clearTimeout(this._detailCloseTimer)
      this._detailCloseTimer = null
    }
    if (this._createOpenTimer) {
      clearTimeout(this._createOpenTimer)
      this._createOpenTimer = null
    }
    if (this._createCloseTimer) {
      clearTimeout(this._createCloseTimer)
      this._createCloseTimer = null
    }
    this.setData({
      detailMounted: false,
      detailVisible: false,
      detailClosing: false,
      selectedTask: null,
      selectedTaskDraftSubtasks: [],
      selectedTaskHasDraftChanges: false,
      create: buildCreateState(),
      createModalVisible: false,
      createModalClosing: false,
      'scrollHints.detail': false,
      'scrollHints.create': false,
    })
  },

  async playTaskFlyToTab(title, targetTab) {
    const safeTab = targetTab === 'collab' ? 'collab' : targetTab === 'home' ? 'home' : 'mission'
    const feedbackText =
      safeTab === 'home'
        ? strings.feedback.taskMovedToDailyTask
        : safeTab === 'mission'
          ? strings.feedback.taskMovedToMission
          : strings.feedback.taskMovedToCollab
    const systemInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const windowWidth = Number(systemInfo.windowWidth || 375)
    const windowHeight = Number(systemInfo.windowHeight || 667)
    const startX = Math.max(16, Math.round(windowWidth / 2 - 108))
    const startY = Math.max(112, Math.round(windowHeight * 0.42))
    const targetRect = await this.measureElementRect(`#tab-${safeTab}`)
    const endX = targetRect ? Math.round(targetRect.left + targetRect.width / 2 - 54) : startX
    const endY = targetRect ? Math.round(targetRect.top + targetRect.height / 2 - 24) : Math.round(windowHeight - 140)

    if (this._taskFlyTimer) clearTimeout(this._taskFlyTimer)
    if (this._taskFlyPulseTimer) clearTimeout(this._taskFlyPulseTimer)

    this.setData({
      taskFly: {
        visible: true,
        title: title || strings.share.taskDetailFallback,
        x: startX,
        y: startY,
        tx: 0,
        ty: 0,
        scale: 1,
        opacity: 1,
        targetTab: safeTab,
      },
      tabPulseTab: safeTab,
    })

    await new Promise((resolve) => setTimeout(resolve, 20))
    this.setData({
      'taskFly.tx': endX - startX,
      'taskFly.ty': endY - startY,
      'taskFly.scale': 0.35,
      'taskFly.opacity': 0.1,
    })

    wx.showToast({ title: feedbackText, icon: 'none' })

    this._taskFlyTimer = setTimeout(() => {
      this.setData({ taskFly: buildTaskFlyState() })
      this._taskFlyTimer = null
    }, 520)

    this._taskFlyPulseTimer = setTimeout(() => {
      this.setData({ tabPulseTab: '' })
      this._taskFlyPulseTimer = null
    }, 760)
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
            title: strings.share.sharedTaskTitle || strings.share.taskDetailFallback,
            detail: strings.share.sharedTaskAcceptedDetail,
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
      const currentDailyTaskEditor = this.data.dailyTaskEditor
      const keepDailyTaskDrafts = Boolean(currentDailyTaskEditor && currentDailyTaskEditor.editMode)
      const dailyTaskEditor = keepDailyTaskDrafts
        ? currentDailyTaskEditor
        : buildDailyTaskEditorState(payload.profile && payload.profile.dailyTaskPresets)
      subscribeSettings.visible = Boolean(this.data.subscribeSettings && this.data.subscribeSettings.visible)
      if (!keepDailyTaskDrafts) {
        dailyTaskEditor.editMode = Boolean(this.data.dailyTaskEditor && this.data.dailyTaskEditor.editMode)
        dailyTaskEditor.expandedIndex = Number(this.data.dailyTaskEditor && this.data.dailyTaskEditor.expandedIndex >= 0 ? this.data.dailyTaskEditor.expandedIndex : -1)
      }
      this.setData({
        profile: payload.profile,
        subscribeSettings,
        dailyTaskEditor,
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
        if (this.data.dailyTaskEditor && this.data.dailyTaskEditor.editMode) this.measureScrollHint('page')
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
            { visible: true, panelVisible: true, closing: false }
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

  openDailyTaskSettings() {
    if (this.isOnboardingActive()) return
    const dailyTaskEditor = buildDailyTaskEditorState(this.data.profile && this.data.profile.dailyTaskPresets)
    dailyTaskEditor.editMode = true
    dailyTaskEditor.panelMounted = true
    dailyTaskEditor.panelVisible = true
    dailyTaskEditor.expandedIndex = -1
    this.setData({ dailyTaskEditor })
    wx.nextTick(() => this.measureScrollHint('page'))
  },

  closeDailyTaskSettings() {
    if (!(this.data.dailyTaskEditor && this.data.dailyTaskEditor.editMode)) return
    this.setData({
      dailyTaskEditor: buildDailyTaskEditorState(this.data.profile && this.data.profile.dailyTaskPresets),
    })
  },

  toggleDailyTaskEditMode() {
    if (this.data.dailyTaskEditor && this.data.dailyTaskEditor.editMode) {
      this.closeDailyTaskSettings()
      return
    }
    this.openDailyTaskSettings()
  },

  revertExpandedDailyTaskPreset() {
    const editor = this.data.dailyTaskEditor || {}
    const expandedIndex = Number(editor.expandedIndex)
    if (expandedIndex < 0) return
    if (this._dailyTaskPanelCloseTimer) {
      clearTimeout(this._dailyTaskPanelCloseTimer)
      this._dailyTaskPanelCloseTimer = null
    }
    const savedPresets = safeArray(editor.savedPresets)
    const presets = clone(editor.presets)
    if (savedPresets[expandedIndex]) {
      presets[expandedIndex] = buildDailyTaskPresetDraft(savedPresets[expandedIndex], expandedIndex)
    } else {
      presets.splice(expandedIndex, 1)
    }
    this.setData({
      'dailyTaskEditor.presets': presets.map((item, index) => buildDailyTaskPresetDraft(item, index)),
      'dailyTaskEditor.expandedIndex': -1,
      'dailyTaskEditor.openingIndex': -1,
      'dailyTaskEditor.closingIndex': expandedIndex,
    })
    this._dailyTaskPanelCloseTimer = setTimeout(() => {
      this.setData({ 'dailyTaskEditor.closingIndex': -1 })
      this._dailyTaskPanelCloseTimer = null
    }, 220)
  },

  switchDailyTaskPresetEditor(index) {
    const safeIndex = Number(index)
    if (safeIndex < 0) return
    const currentExpanded = Number(this.data.dailyTaskEditor && this.data.dailyTaskEditor.expandedIndex)
    if (currentExpanded === safeIndex) {
      this.revertExpandedDailyTaskPreset()
      return
    }
    if (this._dailyTaskPanelCloseTimer) {
      clearTimeout(this._dailyTaskPanelCloseTimer)
      this._dailyTaskPanelCloseTimer = null
    }
    if (this._dailyTaskPanelOpenTimer) {
      clearTimeout(this._dailyTaskPanelOpenTimer)
      this._dailyTaskPanelOpenTimer = null
    }
    if (currentExpanded >= 0) {
      const savedPresets = safeArray(this.data.dailyTaskEditor && this.data.dailyTaskEditor.savedPresets)
      const presets = clone(this.data.dailyTaskEditor && this.data.dailyTaskEditor.presets)
      let nextExpandedIndex = safeIndex
      if (savedPresets[currentExpanded]) {
        presets[currentExpanded] = buildDailyTaskPresetDraft(savedPresets[currentExpanded], currentExpanded)
      } else {
        presets.splice(currentExpanded, 1)
        if (safeIndex > currentExpanded) nextExpandedIndex -= 1
      }
      this.setData({
        'dailyTaskEditor.presets': presets.map((item, current) => buildDailyTaskPresetDraft(item, current)),
        'dailyTaskEditor.openingIndex': nextExpandedIndex,
        'dailyTaskEditor.closingIndex': currentExpanded,
        'dailyTaskEditor.expandedIndex': -1,
      })
      this._dailyTaskPanelOpenTimer = setTimeout(() => {
        this.setData({
          'dailyTaskEditor.openingIndex': -1,
          'dailyTaskEditor.expandedIndex': nextExpandedIndex,
        })
        this._dailyTaskPanelOpenTimer = null
      }, 16)
      this._dailyTaskPanelCloseTimer = setTimeout(() => {
        this.setData({ 'dailyTaskEditor.closingIndex': -1 })
        this._dailyTaskPanelCloseTimer = null
      }, 220)
      wx.nextTick(() => this.measureScrollHint('page'))
      return
    }
    this.setData({
      'dailyTaskEditor.closingIndex': -1,
      'dailyTaskEditor.openingIndex': safeIndex,
      'dailyTaskEditor.expandedIndex': -1,
    })
    this._dailyTaskPanelOpenTimer = setTimeout(() => {
      this.setData({
        'dailyTaskEditor.openingIndex': -1,
        'dailyTaskEditor.expandedIndex': safeIndex,
      })
      wx.nextTick(() => this.measureScrollHint('page'))
      this._dailyTaskPanelOpenTimer = null
    }, 16)
  },

  toggleDailyTaskPresetEditor(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.switchDailyTaskPresetEditor(index)
  },

  onTapDailyTaskPresetCard(event) {
    const index = Number(event.currentTarget.dataset.index)
    const currentExpanded = Number(this.data.dailyTaskEditor && this.data.dailyTaskEditor.expandedIndex)
    if (index < 0 || currentExpanded === index) return
    this.switchDailyTaskPresetEditor(index)
  },

  cancelDailyTaskPresetEdit() {
    this.revertExpandedDailyTaskPreset()
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
    subscribeSettings.panelVisible = false
    subscribeSettings.closing = false
    this.setData({ subscribeSettings })
    wx.nextTick(() => {
      this.setData({ 'subscribeSettings.panelVisible': true })
      this.measureScrollHint('subscribe')
    })
  },

  closeSubscribeSettings() {
    if (!(this.data.subscribeSettings && this.data.subscribeSettings.visible)) return
    if (this._subscribeCloseTimer) {
      clearTimeout(this._subscribeCloseTimer)
    }
    this.setData({
      'subscribeSettings.panelVisible': false,
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

  onDailyTaskPresetTitleInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`dailyTaskEditor.presets[${index}].title`]: event.detail.value || '' })
  },

  onDailyTaskPresetAiPromptInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`dailyTaskEditor.presets[${index}].aiPrompt`]: event.detail.value || '' })
  },

  onDailyTaskPresetDetailInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`dailyTaskEditor.presets[${index}].detail`]: event.detail.value || '' })
  },

  onDailyTaskPresetDueTimeChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`dailyTaskEditor.presets[${index}].dueTime`]: event.detail.value || '21:00' })
  },

  onDailyTaskPresetRewardTypeChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`dailyTaskEditor.presets[${index}].rewardType`]: event.currentTarget.dataset.type || 'agility' })
  },

  onDailyTaskPresetAutoAcceptChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`dailyTaskEditor.presets[${index}].autoAccept`]: Boolean(event.detail.value) })
  },

  onDailyTaskPresetAutoAcceptTimeChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`dailyTaskEditor.presets[${index}].autoAcceptTime`]: event.detail.value || '06:00' })
  },

  onDailyTaskPresetSubtaskInput(event) {
    const presetIndex = Number(event.currentTarget.dataset.presetIndex)
    const subtaskIndex = Number(event.currentTarget.dataset.subtaskIndex)
    const presets = clone(this.data.dailyTaskEditor && this.data.dailyTaskEditor.presets)
    if (!presets[presetIndex] || !safeArray(presets[presetIndex].subtasks)[subtaskIndex]) return
    presets[presetIndex].subtasks[subtaskIndex].title = event.detail.value || ''
    this.setData({ 'dailyTaskEditor.presets': presets })
  },

  addDailyTaskPreset() {
    const presets = safeArray(this.data.dailyTaskEditor && this.data.dailyTaskEditor.presets)
    if (presets.length >= 8) return
    const presetId = `daily_preset_${Date.now()}_${presets.length + 1}`
    this.setData({
      'dailyTaskEditor.presets': presets.concat([buildDailyTaskPresetDraft({ id: presetId }, presets.length)]),
      'dailyTaskEditor.expandedIndex': presets.length,
    })
    wx.nextTick(() => this.measureScrollHint('page'))
  },

  removeDailyTaskPreset(event) {
    const index = Number(event.currentTarget.dataset.index)
    const savedPresets = safeArray(this.data.dailyTaskEditor && this.data.dailyTaskEditor.savedPresets)
    if (savedPresets.length <= 1) return
    const presets = safeArray(this.data.dailyTaskEditor && this.data.dailyTaskEditor.presets)
    this.setData({
      'dailyTaskEditor.presets': presets.filter((_, current) => current !== index).map((item, current) => buildDailyTaskPresetDraft(item, current)),
      'dailyTaskEditor.expandedIndex': Math.max(-1, index - 1),
    })
    wx.nextTick(() => this.measureScrollHint('page'))
  },

  async deleteDailyTaskPreset(event) {
    if (this.data.loading) return
    const index = Number(event.currentTarget.dataset.index)
    const currentPresets = safeArray(this.data.dailyTaskEditor && this.data.dailyTaskEditor.presets)
    const targetPreset = currentPresets[index]
    if (!targetPreset) return
    const savedPresets = safeArray(this.data.dailyTaskEditor && this.data.dailyTaskEditor.savedPresets)
    const savedIndex = savedPresets.findIndex((item) => String(item && item.id ? item.id : '') === String(targetPreset.id || ''))
    if (savedIndex < 0) {
      const nextCurrentPresets = currentPresets
        .filter((_, current) => current !== index)
        .map((item, current) => buildDailyTaskPresetDraft(item, current))
      const expandedIndex = Number(this.data.dailyTaskEditor && this.data.dailyTaskEditor.expandedIndex)
      const nextExpandedIndex =
        expandedIndex === index ? -1 : expandedIndex > index ? expandedIndex - 1 : expandedIndex
      this.setData({
        'dailyTaskEditor.presets': nextCurrentPresets,
        'dailyTaskEditor.expandedIndex': nextExpandedIndex,
        'dailyTaskEditor.openingIndex': -1,
        'dailyTaskEditor.closingIndex': -1,
        'dailyTaskEditor.deletingIndex': -1,
      })
      wx.nextTick(() => this.measureScrollHint('page'))
      return
    }
    const nextPresets = savedPresets.filter((_, current) => current !== savedIndex).map((item, current) => buildDailyTaskPresetDraft(item, current))
    this.setData({
      loading: true,
      actionLoading: `deleteDailyTaskPreset_${index}`,
      'dailyTaskEditor.deletingIndex': index,
    })
    this.clearError()
    try {
      const payload = await updateProfile({ dailyTaskPresets: nextPresets })
      getApp().globalData.profile = payload.profile
      const nextDailyTaskEditor = buildDailyTaskEditorState(payload.profile && payload.profile.dailyTaskPresets)
      nextDailyTaskEditor.editMode = true
      nextDailyTaskEditor.expandedIndex = -1
      nextDailyTaskEditor.deletingIndex = -1
      this.setData({
        profile: payload.profile,
        dailyTaskEditor: nextDailyTaskEditor,
      })
      this.applyDashboard(payload.dashboard)
    } catch (error) {
      this.setError((error && error.message) || strings.dailyTaskSettings.errors.saveFailed)
    } finally {
      this.setData({
        loading: false,
        actionLoading: '',
        'dailyTaskEditor.deletingIndex': -1,
      })
    }
  },

  addDailyTaskSubtask(event) {
    const presetIndex = Number(event.currentTarget.dataset.index)
    const presets = clone(this.data.dailyTaskEditor && this.data.dailyTaskEditor.presets)
    const subtasks = safeArray(presets[presetIndex] && presets[presetIndex].subtasks)
    if (subtasks.length >= 5) return
    presets[presetIndex].subtasks = subtasks.concat([{ title: '', total: 1 }])
    this.setData({ 'dailyTaskEditor.presets': presets })
    wx.nextTick(() => this.measureScrollHint('page'))
  },

  removeDailyTaskSubtask(event) {
    const presetIndex = Number(event.currentTarget.dataset.presetIndex)
    const subtaskIndex = Number(event.currentTarget.dataset.subtaskIndex)
    const presets = clone(this.data.dailyTaskEditor && this.data.dailyTaskEditor.presets)
    const subtasks = safeArray(presets[presetIndex] && presets[presetIndex].subtasks)
    if (subtasks.length <= 1) return
    presets[presetIndex].subtasks = subtasks.filter((_, current) => current !== subtaskIndex)
    this.setData({ 'dailyTaskEditor.presets': presets })
    wx.nextTick(() => this.measureScrollHint('page'))
  },

  async onGenerateDailyTaskPresetDraft(event) {
    if (this.data.loading) return
    const index = Number(event.currentTarget.dataset.index)
    const preset = this.data.dailyTaskEditor && this.data.dailyTaskEditor.presets ? this.data.dailyTaskEditor.presets[index] : null
    const prompt = String(preset && preset.aiPrompt ? preset.aiPrompt : '').trim()
    if (!prompt) {
      this.setError(strings.errors.aiPromptRequired)
      return
    }
    this.setData({ loading: true, actionLoading: `generateDailyTaskDraft_${index}` })
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
      const nextDueTime = suggestion && suggestion.dueAt ? formatTimeInput(suggestion.dueAt) : (preset && preset.dueTime) || '23:59'
      this.setData({
        [`dailyTaskEditor.presets[${index}].title`]: (suggestion && suggestion.title) || '',
        [`dailyTaskEditor.presets[${index}].detail`]: (suggestion && suggestion.description) || '',
        [`dailyTaskEditor.presets[${index}].rewardType`]:
          suggestion && suggestion.attributeReward && suggestion.attributeReward.type ? suggestion.attributeReward.type : 'wisdom',
        [`dailyTaskEditor.presets[${index}].subtasks`]:
          safeArray(suggestion && suggestion.subtasks).length > 0
            ? suggestion.subtasks.map((item) => ({ title: item.title || '', total: Number(item.total || 1) }))
            : [{ title: '', total: 1 }],
        [`dailyTaskEditor.presets[${index}].dueTime`]: nextDueTime,
      })
      wx.nextTick(() => this.measureScrollHint('page'))
    } catch (error) {
      this.setError(error.message || strings.errors.aiGenerateFailed)
    } finally {
      this.setData({ loading: false, actionLoading: '' })
    }
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
    const nextMinutes = getNextSubscribeReminderMinutes(reminders, direction)
    this.setData({
      'subscribeSettings.reminders': reindexSubscribeReminderDrafts(reminders.concat(buildSubscribeReminderDraft(direction, nextMinutes))),
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
      nextSubscribeSettings.panelVisible = true
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
      subscribeSettings.panelVisible = true
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

  async saveDailyTaskSettings(event) {
    if (this.data.loading) return
    const targetIndex = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index)
    const presets = buildDailyTaskPresetsForSingleSave(this.data.dailyTaskEditor, targetIndex)
    const presetToSave = Number.isInteger(targetIndex) && targetIndex >= 0 ? presets[targetIndex] : null
    if (!presetToSave) return
    if (!presetToSave.title) {
      this.setError(strings.errors.dailyTaskTitleRequired)
      return
    }
    if (!presetToSave.subtasks.length) {
      this.setError(strings.errors.subtaskRequired)
      return
    }

    this.setData({ loading: true, actionLoading: `saveDailyTaskSettings_${targetIndex}` })
    this.clearError()
    try {
      const payload = await updateProfile({
        dailyTaskPresets: presets,
      })
      getApp().globalData.profile = payload.profile
      const nextDailyTaskEditor = buildDailyTaskEditorState(payload.profile && payload.profile.dailyTaskPresets)
      nextDailyTaskEditor.editMode = true
      nextDailyTaskEditor.expandedIndex = -1
      this.setData({
        profile: payload.profile,
        dailyTaskEditor: nextDailyTaskEditor,
      })
      this.applyDashboard(payload.dashboard)
      wx.showToast({ title: strings.dailyTaskSettings.saveSuccess, icon: 'none' })
    } catch (error) {
      this.setError((error && error.message) || strings.dailyTaskSettings.errors.saveFailed)
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
        title: offlineRewardStrings.reminderTitle,
        content: offlineRewardStrings.reminderContent,
        confirmText: offlineRewardStrings.agree,
        cancelText: offlineRewardStrings.reject,
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
        this.dismissTransientPanels()
        await this.playTaskFlyToTab((result.task && result.task.title) || title, 'collab')
        return
      }

      const created = result && result.task ? result.task : result
      await this.refresh()
      const targetTab = payload.mode === 'rework' ? 'collab' : payload.selfAssign ? 'mission' : 'collab'
      this.dismissTransientPanels()
      await this.playTaskFlyToTab((created && created.title) || title, targetTab)
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

  onTapDailyTaskCard(event) {
    if (this.isOnboardingActive()) return
    const status = String(event.currentTarget.dataset.status || '')
    const assigneeId = String(event.currentTarget.dataset.assigneeId || '')
    const seedKey = String(event.currentTarget.dataset.seedKey || '')
    if (status === 'pending' && !assigneeId && seedKey) return
    this.openTask(event)
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
      this.setError(strings.errors.taskNotFound)
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

  async processAcceptChallengeQueue() {
    if (this._processingAcceptChallenge) return
    this._processingAcceptChallenge = true
    while (this._acceptChallengeQueue && this._acceptChallengeQueue.length) {
      const seedKey = this._acceptChallengeQueue[0]
      try {
        this.setData({ loading: true, actionLoading: `acceptChallenge_${seedKey}` })
        this.clearError()
        const task = await acceptChallengeTask(seedKey)
        await this.refresh()
        this.dismissTransientPanels()
        await this.playTaskFlyToTab((task && task.title) || strings.home.challengeTitle, 'mission')
      } catch (error) {
        this.setError((error && error.message) || strings.errors.acceptChallengeFailed)
      } finally {
        this._acceptChallengeQueue.shift()
        this.setData({
          loading: false,
          actionLoading: '',
          pendingChallengeAcceptSeedKeys: this._acceptChallengeQueue.slice(),
          pendingChallengeAcceptMap: this._acceptChallengeQueue.reduce((map, currentKey) => {
            map[currentKey] = true
            return map
          }, {}),
        })
      }
    }
    this._processingAcceptChallenge = false
  },

  async onAcceptChallenge(event) {
    const seedKey = event.currentTarget.dataset.seedKey
    if (!seedKey) return
    const queued = Array.isArray(this._acceptChallengeQueue) ? this._acceptChallengeQueue : []
    if (queued.includes(seedKey)) return
    this._acceptChallengeQueue = queued.concat([seedKey])
    this.setData({
      pendingChallengeAcceptSeedKeys: this._acceptChallengeQueue.slice(),
      pendingChallengeAcceptMap: this._acceptChallengeQueue.reduce((map, currentKey) => {
        map[currentKey] = true
        return map
      }, {}),
    })
    return this.processAcceptChallengeQueue()
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
    if (this.data.loading) return
    const task = this.data.selectedTask
    if (!task) return
    this.setData({ loading: true, actionLoading: 'acceptTask' })
    this.clearError()
    operateTask('acceptTask', {
      taskId: task._id,
      clientUpdatedAt: task.updatedAt || '',
    }).then(async (result) => {
      await this.refresh()
      this.dismissTransientPanels()
      await this.playTaskFlyToTab((result && result.title) || task.title || strings.actions.acceptTask, 'mission')
    }).catch((error) => {
      if (error && error.code === 'CONFLICT_REFRESH' && error.detail && error.detail.dashboard) {
        this.applyDashboard(error.detail.dashboard, task._id, task.source)
        this.setError(strings.errors.taskUpdated)
        return
      }
      this.setError((error && error.message) || strings.errors.operationFailed)
    }).finally(() => {
      this.setData({ loading: false, actionLoading: '' })
    })
  },

  onSubmitReview() {
    if (this.data.loading) return
    wx.showModal({
      title: strings.dialogs.submitReviewTitle,
      content: strings.dialogs.submitReviewContent,
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
    if (this.data.loading) return null
    const task = this.data.selectedTask
    if (!task) return null
    if (task.category === 'challenge') {
      this.setData({ loading: true, actionLoading: 'abandonTask' })
      this.clearError()
      return operateTask('abandonTask', {
        taskId: task._id,
        clientUpdatedAt: task.updatedAt || '',
      }).then(async (result) => {
        await this.refresh()
        this.dismissTransientPanels()
        await this.playTaskFlyToTab((result && result.title) || task.title || strings.actions.abandonTask, 'home')
      }).catch((error) => {
        if (error && error.code === 'CONFLICT_REFRESH' && error.detail && error.detail.dashboard) {
          this.applyDashboard(error.detail.dashboard, task._id, task.source)
          this.setError(strings.errors.taskUpdated)
          return
        }
        this.setError((error && error.message) || strings.errors.operationFailed)
      }).finally(() => {
        this.setData({ loading: false, actionLoading: '' })
      })
    }
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
