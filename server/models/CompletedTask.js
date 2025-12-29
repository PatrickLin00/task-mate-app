const mongoose = require('mongoose')

const subtaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    current: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 1 },
  },
  { _id: true }
)

const completedTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    icon: { type: String, default: '?', trim: true },
    detail: { type: String, default: '', trim: true },
    dueAt: { type: Date, required: true },
    startAt: { type: Date, default: Date.now },
    completedAt: { type: Date, required: true },
    deleteAt: { type: Date, required: true, index: { expires: '0s' } },
    status: { type: String, enum: ['completed'], default: 'completed' },
    creatorId: { type: String, default: 'sys:system', trim: true },
    assigneeId: { type: String, default: null, trim: true },
    ownerId: { type: String, required: true, trim: true, index: true },
    sourceTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    subtasks: { type: [subtaskSchema], default: [] },
    attributeReward: {
      type: {
        type: String,
        enum: ['strength', 'wisdom', 'agility'],
        required: true,
      },
      value: { type: Number, required: true, min: 0 },
    },
    seedKey: { type: String, default: null, index: true },
  },
  { timestamps: true }
)

module.exports = mongoose.model('CompletedTask', completedTaskSchema)
