const mongoose = require('mongoose')

const taskSchema = new mongoose.Schema({
  title: String,
  description: String,
  checklist: [String],
  type: { type: String, enum: ['self', 'collab', 'public'], default: 'self' },
  createdBy: String,   // 创建者 openid
  acceptedBy: String,  // 接取者 openid
  status: { type: String, enum: ['pending', 'in_progress', 'done'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  dueDate: Date
})

module.exports = mongoose.model('Task', taskSchema)
