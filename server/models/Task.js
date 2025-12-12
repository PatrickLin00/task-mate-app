const mongoose = require('mongoose')

const progressSchema = new mongoose.Schema(
  {
    current: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
)

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
    description: { type: String, default: '', trim: true },
    mode: { type: String, enum: ['counter', 'checklist'], required: true },
    progress: progressSchema, // for counter mode
    subtasks: [subtaskSchema], // for checklist mode
    status: { type: String, enum: ['ongoing', 'completed', 'abandoned'], default: 'ongoing' },
    attributeReward: {
      type: {
        type: String,
        enum: ['strength', 'wisdom', 'agility'],
        required: true,
      },
      value: { type: Number, required: true, min: 0 },
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Task', taskSchema)
