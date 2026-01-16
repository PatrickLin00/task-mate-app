const addAliases = (data, labels, value) => {
  const text = String(value ?? '').trim()
  if (!text) return
  labels.forEach((label) => {
    data[label] = text
  })
}

const buildSubscribeData = (fields = {}) => {
  const data = {}
  addAliases(data, ['任务名称', '事项主题', '卡片名称'], fields.taskName)
  addAliases(data, ['执行人'], fields.assignee)
  addAliases(data, ['发布人', '发起人'], fields.creator)
  addAliases(data, ['发布时间', '开始时间', '起始时间'], fields.startTime)
  addAliases(data, ['截止时间', '到期时间'], fields.dueTime)
  addAliases(data, ['剩余时间'], fields.remainTime)
  addAliases(data, ['提醒时间'], fields.remindTime)
  addAliases(data, ['状态', '任务状态'], fields.status)
  addAliases(data, ['温馨提示', '备注消息', '提示', '备注'], fields.tip)
  addAliases(data, ['修改详情'], fields.changeDetail)
  addAliases(data, ['修改时间'], fields.changeTime)
  addAliases(data, ['审核类型'], fields.reviewType)
  addAliases(data, ['审核结果'], fields.reviewResult)
  addAliases(data, ['拒绝理由'], fields.rejectReason)
  addAliases(data, ['通知时间'], fields.notifyTime)
  addAliases(data, ['审核人'], fields.reviewer)
  return data
}

module.exports = {
  buildSubscribeData,
}
