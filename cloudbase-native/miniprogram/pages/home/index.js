const { bootstrap, createTask, generateTaskByAI, operateTask, acceptChallengeTask, updateProfile } = require('../../utils/api')
const { formatDateTime, formatDateInput, formatTimeInput, statusLabel, rewardLabel } = require('../../utils/format')
const { requestTaskSubscribeAuth } = require('../../utils/subscribe')
const strings = require('../../config/strings')

const ACTIVE_ASSIGNEE_STATUS = ['in_progress', 'pending_confirmation']

function buildDueAt(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue}:00+08:00`).toISOString()
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
    selfAssign: false,
    subtasks: [
      { title: '', total: 1 },
      { title: '', total: 1 },
    ],
  }
}

function safeArray(list) {
  return Array.isArray(list) ? list.filter(Boolean) : []
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
  const now = Date.now()
  const dueAt = task && task.dueAt ? new Date(task.dueAt).getTime() : NaN
  const isOverdue = Number.isFinite(dueAt) ? dueAt < now : false

  return Object.assign({}, task, {
    statusText: statusLabel(task.status),
    rewardName: rewardLabel(task.attributeReward && task.attributeReward.type),
    rewardText: `${rewardLabel(task.attributeReward && task.attributeReward.type)} +${task.attributeReward && task.attributeReward.value ? task.attributeReward.value : 0}`,
    dueText: formatDateTime(task.dueAt),
    submittedText: formatDateTime(task.submittedAt),
    completedText: formatDateTime(task.completedAt),
    closedText: formatDateTime(task.closedAt),
    progressText: `${progress.current}/${progress.total || 1}`,
    progressCurrent: progress.current,
    progressTotal: progress.total || 1,
    isCreator,
    isAssignee,
    isHistory,
    isArchive: false,
    canOpenHistory: Boolean(task.previousTaskId),
    canAcceptTask: task.status === 'pending' && !task.assigneeId,
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
    canAbandon: isAssignee && (task.status === 'in_progress' || task.status === 'review_pending'),
    canShare: isCreator && !isChallenge && !isHistory && !isAssignee,
    canClose: isCreator && task.status !== 'closed' && task.status !== 'completed' && task.status !== 'refactored',
    canRestart: isCreator && task.status === 'closed',
    canRefreshSchedule: isCreator && task.status === 'pending' && !task.assigneeId && isOverdue,
    canDelete: isCreator && !task.assigneeId && !isHistory,
    canRework: isCreator && task.status !== 'completed' && task.status !== 'closed' && task.status !== 'refactored',
    canAdjustProgress: isAssignee && task.status === 'in_progress',
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

  const collabSource = creatorRaw.filter((task) => {
    if (shouldHideTask(task, supersededIds)) return false
    if (task.status === 'refactored') return false
    if (task.assigneeId && task.creatorId === task.assigneeId) return false
    if (task.status === 'closed' && task.dueAt && new Date(task.dueAt).getTime() < now) return false
    if (task.status === 'completed' && (!task.assigneeId || task.assigneeId === task.creatorId)) return false
    return true
  })

  const historySource = dedupeById(creatorRaw.filter((task) => task.status === 'refactored').concat(historyRaw))

  return {
    todayTasks: todayRaw.map((task) => enrichTask(task, profile, 'today')),
    challengeTasks: challengeRaw.map((task) => enrichTask(task, profile, 'challenge')),
    missionTasks: missionSource.map((task) => enrichTask(task, profile, 'mission')),
    collabTasks: collabSource.map((task) => enrichTask(task, profile, 'collab')),
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
      historyTasks: [],
      archiveTasks: [],
    },
    error: '',
    activeTab: 'home',
    detailVisible: false,
    detailMounted: false,
    detailClosing: false,
    createModalVisible: false,
    createModalClosing: false,
    selectedTask: null,
    selectedTaskDraftSubtasks: [],
    selectedTaskHasDraftChanges: false,
    profileEditVisible: false,
    nicknameDraft: '',
    create: buildCreateState(),
  },

  onLoad(options) {
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

  async refresh() {
    this.setData({ loading: true, actionLoading: '' })
    this.clearError()
    try {
      const payload = await bootstrap()
      getApp().globalData.profile = payload.profile
      this.setData({ profile: payload.profile })
      const currentTaskId = this.data.selectedTask ? this.data.selectedTask._id : ''
      const currentSource = this.data.selectedTask ? this.data.selectedTask.source : ''
      this.applyDashboard(payload.dashboard, currentTaskId, currentSource)
      if (this.data.pendingOpenTaskId) {
        const sharedTask = this.findTaskById(this.data.pendingOpenTaskId, payload.dashboard)
        if (sharedTask) {
          this.setData({
            detailMounted: true,
            detailClosing: false,
            detailVisible: true,
            selectedTask: sharedTask,
            selectedTaskDraftSubtasks: cloneSubtasks(sharedTask.subtasks),
            selectedTaskHasDraftChanges: false,
            pendingOpenTaskId: '',
            activeTab: sharedTask.source === 'collab' || sharedTask.source === 'history' ? 'collab' : sharedTask.source === 'archive' ? 'archive' : 'home',
          })
        }
      }
    } catch (error) {
      this.setError(error.message || strings.errors.loadFailed)
    } finally {
      this.setData({ loading: false, actionLoading: '' })
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
      const listKey =
        source === 'today'
          ? 'todayTasks'
          : source === 'mission'
            ? 'missionTasks'
            : source === 'collab'
              ? 'collabTasks'
              : source === 'history'
                ? 'historyTasks'
                : source === 'challenge'
                  ? 'challengeTasks'
                  : 'archiveTasks'
      const match = safeArray(view[listKey]).find((item) => String(item._id) === String(taskId))
      if (match) return match
    }
    return null
  },

  setTab(event) {
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
    this.setData({
      profileEditVisible: true,
      nicknameDraft: (this.data.profile && this.data.profile.nickname) || '',
    })
  },

  async onRequestSubscribe() {
    if (this.data.loading) return
    await requestTaskSubscribeAuth({ force: true })
    await this.refresh()
  },

  closeProfileEdit() {
    this.setData({
      profileEditVisible: false,
      nicknameDraft: '',
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
      this._createOpenTimer = null
    }, 16)
  },

  closeCreateModal() {
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
  },

  removeSubtask(event) {
    if (this.data.loading) return
    if (this.data.create.subtasks.length <= 1) return
    const index = Number(event.currentTarget.dataset.index)
    this.setData({
      'create.subtasks': this.data.create.subtasks.filter((_, current) => current !== index),
    })
  },

  async onGenerateCreateDraft() {
    if (this.data.loading) return
    const prompt = String(this.data.create.aiPrompt || '').trim()
    if (!prompt) {
      this.setError(strings.errors.aiPromptRequired)
      return
    }
    this.setData({ loading: true, actionLoading: 'generateCreateDraft' })
    this.clearError()
    try {
      const suggestion = await generateTaskByAI(prompt)
      this.setData({
        'create.title': suggestion.title || '',
        'create.detail': suggestion.description || '',
        'create.rewardType':
          suggestion.attributeReward && suggestion.attributeReward.type ? suggestion.attributeReward.type : 'wisdom',
        'create.rewardValue': 1,
        'create.subtasks':
          safeArray(suggestion.subtasks).length > 0
            ? suggestion.subtasks.map((item) => ({ title: item.title || '', total: Number(item.total || 1) }))
            : this.data.create.subtasks,
        'create.dateValue': suggestion.dueAt ? formatDateInput(suggestion.dueAt) : this.data.create.dateValue,
        'create.timeValue': suggestion.dueAt ? formatTimeInput(suggestion.dueAt) : this.data.create.timeValue,
      })
    } catch (error) {
      this.setError(error.message || strings.errors.aiGenerateFailed)
    } finally {
      this.setData({ loading: false, actionLoading: '' })
    }
  },

  async submitCreateTask() {
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

  closeTaskModal() {
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
    return this.runTaskOperation('acceptTask', null, 'acceptTask')
  },

  onSubmitReview() {
    return this.runTaskOperation('submitReview', null, 'submitReview')
  },

  onContinueReview() {
    return this.runTaskOperation('continueReview', null, 'continueReview')
  },

  onCompleteTask() {
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

  onIncreaseProgress(event) {
    const index = Number(event.currentTarget.dataset.index)
    const subtasks = clone(this.data.selectedTaskDraftSubtasks || [])
    if (!subtasks[index]) return
    const total = Math.max(1, Number(subtasks[index].total || 1))
    subtasks[index].current = Math.min(total, Number(subtasks[index].current || 0) + 1)
    this.updateSelectedTaskDraft(subtasks)
  },

  onDecreaseProgress(event) {
    const index = Number(event.currentTarget.dataset.index)
    const subtasks = clone(this.data.selectedTaskDraftSubtasks || [])
    if (!subtasks[index]) return
    subtasks[index].current = Math.max(0, Number(subtasks[index].current || 0) - 1)
    this.updateSelectedTaskDraft(subtasks)
  },

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
    this.setData({ loading: true, actionLoading: 'applyProgress' })
    this.clearError()
    try {
      for (let index = 0; index < draft.length; index += 1) {
        if (Number((original[index] && original[index].current) || 0) === Number(draft[index].current || 0)) {
          continue
        }
        await operateTask('updateProgress', {
          taskId: task._id,
          clientUpdatedAt: task.updatedAt || '',
          subtaskIndex: index,
          current: Number(draft[index].current || 0),
        })
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

