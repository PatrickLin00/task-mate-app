const Task = require('../models/Task')

const SYSTEM_USER_ID = 'sys:system'

const normalizeLegacyUserId = (raw) => {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return null
  if (v === 'system') return SYSTEM_USER_ID
  if (v.startsWith('dev:') || v.startsWith('wx:') || v.startsWith('sys:')) return v
  if (v.includes(':')) return null
  if (/^o[A-Za-z0-9_-]{5,}$/.test(v)) return `wx:${v}`
  return `dev:${v}`
}

async function migrateTaskIds() {
  const collection = Task.collection
  const cursor = collection.find(
    { $or: [{ creatorId: { $exists: false } }, { assigneeId: { $exists: false } }] },
    { projection: { creator: 1, assignee: 1, creatorId: 1, assigneeId: 1, createdAt: 1, startAt: 1 } }
  )

  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    const update = { $set: {}, $unset: {} }

    const creatorId =
      typeof doc.creatorId === 'string' && doc.creatorId.trim()
        ? doc.creatorId.trim()
        : normalizeLegacyUserId(doc.creator) || SYSTEM_USER_ID
    update.$set.creatorId = creatorId

    let assigneeId = null
    if (doc.assigneeId === null) {
      assigneeId = null
    } else if (typeof doc.assigneeId === 'string' && doc.assigneeId.trim()) {
      assigneeId = doc.assigneeId.trim()
    } else if (doc.assignee !== undefined) {
      assigneeId = normalizeLegacyUserId(doc.assignee)
    }
    update.$set.assigneeId = assigneeId

    if (!doc.startAt) {
      update.$set.startAt = doc.createdAt || new Date()
    }

    if (doc.creator !== undefined) update.$unset.creator = ''
    if (doc.assignee !== undefined) update.$unset.assignee = ''

    if (Object.keys(update.$unset).length === 0) delete update.$unset
    await collection.updateOne({ _id: doc._id }, update)
  }
}

module.exports = { migrateTaskIds }

