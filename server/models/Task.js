const mongoose = require('mongoose')

const subtaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    current: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 1 },
  },
  { _id: true }
)

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    icon: { type: String, default: '✨', trim: true },
    detail: { type: String, default: '', trim: true },
    dueAt: { type: Date, required: true },
    startAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    deleteAt: { type: Date, default: null, index: { expires: '0s' } },
    originalDueAt: { type: Date, default: null },
    originalStartAt: { type: Date, default: null },
    originalStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'review_pending', 'pending_confirmation', 'completed', 'closed', 'refactored'],
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'review_pending', 'pending_confirmation', 'completed', 'closed', 'refactored'],
      default: 'pending',
    },
    creatorId: { type: String, default: 'sys:system', trim: true },
    assigneeId: { type: String, default: null, trim: true },
    previousTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
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
    dueSoonNotifiedAt: { type: Date, default: null },
    overdueNotifiedAt: { type: Date, default: null },
    challengeExpiredNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Task', taskSchema)
