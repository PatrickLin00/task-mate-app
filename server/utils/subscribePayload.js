const addAliases = (data, labels, value) => {
  const text = String(value ?? '').trim()
  if (!text) return
  labels.forEach((label) => {
    data[label] = text
  })
}

const buildSubscribeData = (fields = {}) => {
  const data = {}
  addAliases(data, ['任务名称', '事项名称', '卡片名称'], fields.taskName)
  addAliases(data, ['执行人', '接取人', '处理人'], fields.assignee)
  addAliases(data, ['发布人', '发起人'], fields.creator)
  addAliases(data, ['发布时间', '开始时间', '起始时间'], fields.startTime)
  addAliases(data, ['截止时间', '到期时间'], fields.dueTime)
  addAliases(data, ['剩余时间'], fields.remainTime)
  addAliases(data, ['提醒时间'], fields.remindTime)
  addAliases(data, ['状态', '任务状态'], fields.status)
  addAliases(data, ['温馨提示', '备注', '备注消息', '提示'], fields.tip)
  addAliases(data, ['修改详情', '变更详情'], fields.changeDetail)
  addAliases(data, ['修改时间', '变更时间'], fields.changeTime)
  addAliases(data, ['审核类型'], fields.reviewType)
  addAliases(data, ['审核结果'], fields.reviewResult)
  addAliases(data, ['拒绝理由', '拒绝原因'], fields.rejectReason)
  addAliases(data, ['通知时间'], fields.notifyTime)
  return data
}

module.exports = {
  buildSubscribeData,
}
