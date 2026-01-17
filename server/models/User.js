const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  nickname: String,
  avatar: String,
  stars: { type: Number, default: 0 },
  wisdom: { type: Number, default: 0 },
  strength: { type: Number, default: 0 },
  agility: { type: Number, default: 0 },
})

module.exports = mongoose.model('User', userSchema)
