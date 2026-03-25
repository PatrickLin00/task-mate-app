const strings = require('../config/strings')

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatDateTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return `${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function formatDateInput(value) {
  if (!value) {
    const now = new Date()
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatTimeInput(value) {
  if (!value) {
    const now = new Date()
    return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function statusLabel(status) {
  return strings.status[status] || status || strings.common.unknown
}

function rewardLabel(reward) {
  return strings.rewards[reward] || reward || strings.common.unknown
}

module.exports = {
  formatDateTime,
  formatDateInput,
  formatTimeInput,
  statusLabel,
  rewardLabel,
}
