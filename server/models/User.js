const mongoose = require('mongoose')

// TODO: 用户体系与第三方登录（小程序/手机号/邮箱）待设计
const userSchema = new mongoose.Schema({
  openid: { type: String, required: true, unique: true },
  nickname: String,
  avatar: String,
  stars: { type: Number, default: 0 } // 完成协作任务后获得的星星
})

module.exports = mongoose.model('User', userSchema)
