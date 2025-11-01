const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  openid: { type: String, required: true, unique: true },
  nickname: String,
  avatar: String,
  stars: { type: Number, default: 0 } // 完成协作任务后获得的星星
})

module.exports = mongoose.model('User', userSchema)
