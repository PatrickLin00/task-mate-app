const User = require('../models/User')

async function migrateUserIds() {
  const collection = User.collection
  const indexes = await collection.indexes()

  if (indexes.some((i) => i.name === 'openid_1')) {
    try {
      await collection.dropIndex('openid_1')
    } catch (err) {
      const code = err && typeof err === 'object' ? err.code : undefined
      if (code !== 27) throw err
    }
  }

  const cursor = collection.find({ userId: { $exists: false } }, { projection: { openid: 1 } })
  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    const legacy = String(doc._id)
    const openid = typeof doc.openid === 'string' ? doc.openid.trim() : ''
    const userId = openid ? `wx:${openid}` : `legacy:${legacy}`
    await collection.updateOne({ _id: doc._id }, { $set: { userId }, $unset: { openid: '' } })
  }

  await User.syncIndexes()
}

module.exports = { migrateUserIds }
